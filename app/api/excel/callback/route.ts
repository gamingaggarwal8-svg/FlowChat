import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  api,
  checkDB,
  HttpError,
  requireBusiness,
} from "../../../../lib/server/http";
import {
  microsoftToken,
  redirectURI,
  seal,
  unseal,
} from "../../../../lib/server/excel";
export const GET = api(async (request) => {
  const jar = await cookies(),
    cookie = jar.get("flowchat_excel_state")?.value;
  jar.set("flowchat_excel_state", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/excel/callback",
    maxAge: 0,
  });
  if (!cookie)
    throw new HttpError(
      400,
      "Excel connection state expired. Reconnect from FlowChat.",
    );
  const state = unseal<{
    nonce: string;
    token: string;
    businessId: string;
    driveId: string;
    itemId: string;
    expires: number;
  }>(cookie);
  const params = new URL(request.url).searchParams;
  if (
    state.expires < Date.now() ||
    params.get("state") !== state.nonce ||
    !params.get("code")
  )
    throw new HttpError(400, "Excel authorization was cancelled or expired.");
  const authenticated = new Request(request.url, {
    headers: { authorization: state.token, "x-business-id": state.businessId },
  });
  const { db } = await requireBusiness(authenticated, true, true);
  const tokens = await microsoftToken({
    grant_type: "authorization_code",
    code: params.get("code")!,
    redirect_uri: redirectURI(),
  });
  if (!tokens.refresh_token)
    throw new HttpError(
      400,
      "Microsoft did not provide offline authorization. Reconnect and grant access.",
    );
  checkDB(
    (
      await db.from("excel_connections").upsert({
        business_id: state.businessId,
        drive_id: state.driveId,
        item_id: state.itemId,
        credentials: seal({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: Date.now() + tokens.expires_in * 1000,
        }),
        etag: null,
      })
    ).error,
  );
  return NextResponse.redirect(new URL("/sync?connected=1", redirectURI()));
});
