import { z } from "zod";
import {
  api,
  checkDB,
  HttpError,
  jsonBody,
  requireBusiness,
} from "../../../lib/server/http";
import { conversationHistory } from "../../../lib/server/memory";
export const GET = api(async (request) => {
  const { db, businessId, user } = await requireBusiness(request);
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (id) {
    z.uuid().parse(id);
    return Response.json(
      await conversationHistory(db, businessId, user.id, id, 100),
    );
  }
  const { data, error } = await db
    .from("ai_threads")
    .select("id,title,created_at,updated_at")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  checkDB(error);
  return Response.json({ threads: data });
});
export const DELETE = api(async (request) => {
  const { db, businessId, user } = await requireBusiness(request);
  const input = z
    .object({ id: z.uuid() })
    .strict()
    .parse(await jsonBody(request));
  const { data, error } = await db
    .from("ai_threads")
    .delete()
    .eq("id", input.id)
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .select("id");
  checkDB(error);
  if (!data?.length) throw new HttpError(404, "Conversation not found.");
  return Response.json({
    deleted: true,
    notice:
      "Only this conversation was deleted. Imported chats, documents and financial history are retained.",
  });
});
