import { randomBytes } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import {
  api,
  checkDB,
  jsonBody,
  requireBusiness,
} from "../../../lib/server/http";
import {
  microsoftTenant,
  redirectURI,
  seal,
  syncCloudWorkbook,
} from "../../../lib/server/excel";
import { workspaceAnalytics } from "../../../lib/server/workspace";
export const maxDuration = 180;
export const GET = api(async (request) => {
  const { db, businessId } = await requireBusiness(request, false, true);
  const { data, error } = await db
    .from("excel_connections")
    .select("drive_id,item_id,last_synced_at,last_error,last_attempt_at")
    .eq("business_id", businessId)
    .maybeSingle();
  checkDB(error);
  return Response.json({ connection: data });
});
export const POST = api(async (request) => {
  const { db, businessId } = await requireBusiness(request, true, true);
  const input = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("connect"),
        driveId: z.string().regex(/^[a-zA-Z0-9!_,-]{1,200}$/),
        itemId: z.string().regex(/^[a-zA-Z0-9!_,-]{1,200}$/),
      }),
      z.object({ action: z.literal("sync") }),
      z.object({ action: z.literal("disconnect") }),
    ])
    .parse(await jsonBody(request));
  if (input.action === "disconnect") {
    checkDB(
      (
        await db
          .from("excel_connections")
          .delete()
          .eq("business_id", businessId)
      ).error,
    );
    return Response.json({ ok: true });
  }
  if (input.action === "sync")
    return Response.json({
      sync: await syncCloudWorkbook(db, businessId),
      ...(await workspaceAnalytics(db, businessId)),
    });
  const nonce = randomBytes(24).toString("hex");
  const state = seal({
    nonce,
    token: request.headers.get("authorization"),
    businessId,
    driveId: input.driveId,
    itemId: input.itemId,
    expires: Date.now() + 600000,
  });
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID || "",
    response_type: "code",
    redirect_uri: redirectURI(),
    response_mode: "query",
    scope: "offline_access Files.Read User.Read",
    state: nonce,
    prompt: "select_account",
  });
  const response = NextResponse.json({
    url: `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenant())}/oauth2/v2.0/authorize?${params}`,
  });
  response.cookies.set("flowchat_excel_state", state, {
    httpOnly: true,
    secure: new URL(redirectURI()).protocol === "https:",
    sameSite: "lax",
    path: "/api/excel/callback",
    maxAge: 600,
  });
  return response;
});
