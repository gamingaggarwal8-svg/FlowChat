import { z } from "zod";
import {
  api,
  checkDB,
  HttpError,
  jsonBody,
  requireBusiness,
} from "../../../lib/server/http";
import { generateStructured } from "../../../lib/server/gemini";
import { conversationHistory, recallInput } from "../../../lib/server/memory";
import { workspaceAnalytics } from "../../../lib/server/workspace";
import {
  cashAnalytics,
  inventoryAnalytics,
  reconcileLedger,
} from "../../../lib/analytics";
const router = z
  .object({
    intent: z.enum([
      "receivables",
      "payables",
      "inventory",
      "overview",
      "conversations",
    ]),
    party: z.string().nullable(),
  })
  .strict();
const textSchema = z.object({ text: z.string().min(1).max(2500) }).strict();
export const maxDuration = 180;
export const POST = api(async (request) => {
  const context = await requireBusiness(request, true);
  const input = z
    .discriminatedUnion("task", [
      z.object({
        task: z.literal("ask"),
        question: z.string().min(1).max(1000),
        conversationId: z.uuid().nullable().optional(),
      }),
      z.object({
        task: z.literal("reminder"),
        party: z.string().min(1).max(160),
      }),
    ])
    .parse(await jsonBody(request));
  const { analytics } = await workspaceAnalytics(
    context.db,
    context.businessId,
  );
  if (input.task === "reminder") {
    const row = reconcileLedger(
      analytics.customerInvoices,
      analytics.customerPayments,
    ).find((r) => r.party === input.party);
    if (!row || row.outstanding <= 0)
      throw new HttpError(
        400,
        "No outstanding recorded balance for this customer.",
      );
    const facts = {
      party: row.party,
      outstanding: row.outstanding,
      overdue: row.overdue,
    };
    const generated = await generateStructured({
      ...context,
      schema: textSchema,
      instruction:
        "Draft a polite Hinglish payment reminder using only the supplied facts. Do not invent promises, dates, bank details, discounts or amounts. It is a draft for owner approval, never send it.",
      input: JSON.stringify(facts),
    });
    return Response.json({ ...generated, facts, approvalRequired: true });
  }
  const prior = input.conversationId
    ? await conversationHistory(
        context.db,
        context.businessId,
        context.user.id,
        input.conversationId,
      )
    : null;
  const conversation = recallInput(input.question, prior?.messages || []);
  const routed = await generateStructured({
    ...context,
    schema: router,
    instruction:
      "Use the current question and previous messages to resolve follow-ups, then classify into one supported analytics view and optional exact party name. Do not calculate or answer. Use conversations for chat orders, promises, commitments and quoted evidence. Use overview if unclear.",
    input: conversation,
  });
  const route = routed.result;
  const conversationRows =
    route.intent === "conversations"
      ? await context.db
          .from("chat_imports")
          .select("customer,extraction,created_at")
          .eq("business_id", context.businessId)
          .order("created_at", { ascending: false })
          .limit(100)
      : null;
  if (conversationRows) checkDB(conversationRows.error);
  const facts =
    route.intent === "conversations"
      ? {
          notice:
            "AI-extracted conversation intentions await owner review; they are not ledger transactions.",
          chats: conversationRows?.data || [],
        }
      : route.intent === "inventory"
        ? inventoryAnalytics(analytics)
        : route.intent === "receivables"
          ? reconcileLedger(
              analytics.customerInvoices,
              analytics.customerPayments,
            ).filter(
              (r) =>
                !route.party ||
                r.party.toLowerCase().includes(route.party.toLowerCase()),
            )
          : route.intent === "payables"
            ? reconcileLedger(
                analytics.supplierInvoices,
                analytics.supplierPayments,
              ).filter(
                (r) =>
                  !route.party ||
                  r.party.toLowerCase().includes(route.party.toLowerCase()),
              )
            : cashAnalytics(analytics);
  const explanationInput = JSON.stringify({
    context: JSON.parse(conversation),
    facts,
  });
  if (explanationInput.length > 100000)
    throw new HttpError(
      413,
      "This evidence view is too large for one explanation. Ask about a specific customer or a smaller view.",
    );
  const explained = await generateStructured({
    ...context,
    schema: textSchema,
    instruction:
      "Explain the supplied deterministic analytics in plain language. Do not perform calculations, invent numbers or forecast. Use earlier messages only as conversational context, never as a current ledger. Reference the freshly supplied facts; uncertain promises are not confirmed payments. No automatic actions.",
    input: explanationInput,
  });
  const saved = await context.db.rpc("store_ai_exchange", {
    p_business: context.businessId,
    p_thread: input.conversationId || null,
    p_question: input.question,
    p_answer: explained.result.text,
    p_facts: facts,
    p_intent: route.intent,
  });
  checkDB(saved.error);
  return Response.json({
    conversationId: saved.data,
    historySaved: true,
    answer: explained.result.text,
    facts,
    intent: route.intent,
    cached: explained.cached,
  });
});
