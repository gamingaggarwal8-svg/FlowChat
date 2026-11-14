import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDB, HttpError } from "./http";
export type MemoryTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sequence: number;
  facts?: unknown;
  created_at: string;
};
export async function conversationHistory(
  db: SupabaseClient,
  businessId: string,
  userId: string,
  threadId: string,
  limit = 10,
) {
  const thread = await db
    .from("ai_threads")
    .select("id,title")
    .eq("id", threadId)
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();
  checkDB(thread.error);
  if (!thread.data)
    throw new HttpError(
      404,
      "This conversation was not found in your workspace.",
    );
  const { data, error } = await db
    .from("ai_turns")
    .select("id,role,content,sequence,facts,created_at")
    .eq("thread_id", threadId)
    .eq("business_id", businessId)
    .order("sequence", { ascending: false })
    .limit(limit);
  checkDB(error);
  return {
    thread: thread.data,
    messages: ((data || []) as MemoryTurn[]).reverse(),
  };
}
export function recallInput(
  question: string,
  history: Pick<MemoryTurn, "role" | "content">[],
) {
  return JSON.stringify({
    question,
    previousMessages: history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    rule: "Use prior messages only to resolve conversational context, such as which customer a follow-up refers to. Earlier amounts and states are historical. Current financial facts must come from the fresh analytics supplied separately.",
  });
}
