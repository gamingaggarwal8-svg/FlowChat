import { z } from "zod";
import { plans } from "../../../lib/integrations/plans";
import {
  adminDB,
  api,
  checkDB,
  HttpError,
  jsonBody,
  requireBusiness,
} from "../../../lib/server/http";
import { razorpay, validSignature } from "../../../lib/server/razorpay";
export const GET = api(async (request) => {
  const { db, businessId } = await requireBusiness(request);
  const [subs, events] = await Promise.all([
    db
      .from("subscriptions")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("billing_events")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  checkDB(subs.error);
  checkDB(events.error);
  return Response.json({ subscriptions: subs.data, history: events.data });
});
export const POST = api(async (request) => {
  const { businessId } = await requireBusiness(request, true, true);
  const db = adminDB();
  const input = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("buy"), plan: z.enum(["starter", "pro"]) }),
      z.object({
        action: z.literal("verify"),
        subscription_id: z.string().regex(/^sub_[a-zA-Z0-9]+$/),
        payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
        signature: z.string(),
      }),
      z.object({
        action: z.literal("cancel"),
        subscription_id: z.string().regex(/^sub_[a-zA-Z0-9]+$/),
      }),
    ])
    .parse(await jsonBody(request));
  if (input.action === "buy") {
    const price = plans.find((p) => p.id === input.plan)!.price!;
    const reserved = await db
      .from("subscriptions")
      .insert({ business_id: businessId, plan: input.plan, status: "created" })
      .select("id")
      .single();
    if (reserved.error)
      throw new HttpError(
        409,
        "This workspace already has a pending or active subscription. Manage it below.",
      );
    try {
      let planId =
        process.env[
          input.plan === "starter"
            ? "RAZORPAY_PLAN_STARTER"
            : "RAZORPAY_PLAN_PRO"
        ];
      if (planId) {
        const plan = await razorpay(`plans/${encodeURIComponent(planId)}`);
        if (
          plan.item?.amount !== price * 100 ||
          plan.item?.currency !== "INR" ||
          plan.period !== "monthly" ||
          plan.interval !== 1
        )
          throw new HttpError(
            409,
            "Configured Razorpay plan does not match the displayed monthly price.",
          );
      } else {
        const plan = await razorpay("plans", "POST", {
          period: "monthly",
          interval: 1,
          item: {
            name: `FlowChat ${input.plan} (provisional)`,
            amount: price * 100,
            currency: "INR",
          },
        });
        planId = plan.id;
      }
      const subscription = await razorpay("subscriptions", "POST", {
        plan_id: planId,
        total_count: 120,
        quantity: 1,
        customer_notify: 1,
        notes: { business_id: businessId },
      });
      const saved = await db
        .from("subscriptions")
        .update({ provider_id: subscription.id, status: subscription.status })
        .eq("id", reserved.data!.id);
      checkDB(saved.error);
      return Response.json({
        subscription_id: subscription.id,
        key: process.env.RAZORPAY_KEY_ID,
        plan: input.plan,
        amount: price * 100,
      });
    } catch (error) {
      await db
        .from("subscriptions")
        .update({ status: "failed" })
        .eq("id", reserved.data!.id);
      throw error;
    }
  }
  const { data: sub } = await db
    .from("subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .eq("provider_id", input.subscription_id)
    .single();
  if (!sub)
    throw new HttpError(404, "Subscription not found in your business.");
  if (input.action === "cancel") {
    const result = await razorpay(
      `subscriptions/${input.subscription_id}/cancel`,
      "POST",
      { cancel_at_cycle_end: 1 },
    );
    return Response.json({
      status: result.status,
      message:
        "Cancellation requested. Pending checkout cancels immediately; active plans cancel at cycle end. Webhook confirmation updates the subscription.",
    });
  }
  if (
    !process.env.RAZORPAY_KEY_SECRET ||
    !validSignature(
      `${input.payment_id}|${sub.provider_id}`,
      input.signature,
      process.env.RAZORPAY_KEY_SECRET,
    )
  )
    throw new HttpError(400, "Payment signature verification failed.");
  const payment = await razorpay(`payments/${input.payment_id}`),
    remote = await razorpay(`subscriptions/${sub.provider_id}`);
  if (
    !["captured", "authorized"].includes(payment.status) ||
    payment.currency !== "INR" ||
    remote.id !== sub.provider_id
  )
    throw new HttpError(400, "Payment is not verified.");
  // Do not grant entitlement from client checkout; the verified webhook is authoritative.
  return Response.json({
    verified: true,
    status: remote.status,
    message:
      "Checkout verified. Waiting for the signed billing webhook to confirm the subscription.",
  });
});
