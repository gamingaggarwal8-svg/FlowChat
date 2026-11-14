import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError, checkDB } from "./http";
import { parseWorkbook } from "../integrations/workbook";
export function seal(value: unknown) {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new HttpError(
      503,
      "Set TOKEN_ENCRYPTION_KEY to a random 32-byte hex value.",
    );
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  return Buffer.concat([
    iv,
    cipher.update(JSON.stringify(value)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
}
export function unseal<T>(sealed: string): T {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new HttpError(503, "Token encryption is not configured.");
  try {
    const bytes = Buffer.from(sealed, "base64url"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(key, "hex"),
        bytes.subarray(0, 12),
      );
    decipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(12, -16)),
        decipher.final(),
      ]).toString(),
    );
  } catch {
    throw new HttpError(
      400,
      "Connection state expired or is invalid. Reconnect Excel.",
    );
  }
}
export const microsoftTenant = () =>
  process.env.MICROSOFT_TENANT_ID || "common";
export function redirectURI() {
  if (!process.env.APP_URL)
    throw new HttpError(503, "Set APP_URL to the full Next.js server URL.");
  return `${process.env.APP_URL.replace(/\/$/, "")}/api/excel/callback`;
}
export async function microsoftToken(values: Record<string, string>) {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET)
    throw new HttpError(503, "Microsoft OAuth is not configured.");
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenant())}/oauth2/v2.0/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        ...values,
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new HttpError(
      502,
      "Microsoft authorization failed. Reconnect your workbook.",
    );
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}
type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
export async function syncCloudWorkbook(
  db: SupabaseClient,
  businessId: string,
) {
  const lease = randomUUID();
  const locked = await db
    .from("excel_connections")
    .update({
      lease_until: new Date(Date.now() + 120000).toISOString(),
      lease_token: lease,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("business_id", businessId)
    .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
    .select("*")
    .maybeSingle();
  checkDB(locked.error);
  if (!locked.data)
    throw new HttpError(
      409,
      "Excel is already syncing, or no workbook is connected.",
    );
  try {
    const connection = locked.data;
    let tokens = unseal<Tokens>(connection.credentials);
    if (tokens.expires_at < Date.now() + 60000) {
      const fresh = await microsoftToken({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        scope: "offline_access Files.Read User.Read",
      });
      tokens = {
        access_token: fresh.access_token,
        refresh_token: fresh.refresh_token || tokens.refresh_token,
        expires_at: Date.now() + fresh.expires_in * 1000,
      };
      checkDB(
        (
          await db
            .from("excel_connections")
            .update({ credentials: seal(tokens) })
            .eq("business_id", businessId)
            .eq("lease_token", lease)
        ).error,
      );
    }
    const path = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(connection.drive_id)}/items/${encodeURIComponent(connection.item_id)}`;
    const metadata = await fetch(`${path}?$select=eTag,size,name`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!metadata.ok)
      throw new HttpError(
        502,
        "Cannot access the selected workbook. Reconnect or check its permissions.",
      );
    const file = await metadata.json();
    if (file.size > 10 * 1024 * 1024)
      throw new HttpError(413, "Cloud workbook exceeds 10 MB.");
    if (file.eTag === connection.etag) {
      await db
        .from("excel_connections")
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq("business_id", businessId)
        .eq("lease_token", lease);
      return { inserted: 0, unchanged: true };
    }
    const response = await fetch(`${path}/content`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "If-Match": file.eTag,
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok)
      throw new HttpError(
        409,
        "Workbook changed while reading it. Press Sync Now again.",
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const rows = await parseWorkbook(bytes);
    const synced = await db.rpc("sync_records", {
      p_business: businessId,
      p_source: `OneDrive: ${String(file.name).slice(0, 150)}`,
      p_rows: rows,
    });
    checkDB(synced.error);
    checkDB(
      (
        await db
          .from("excel_connections")
          .update({
            etag: file.eTag,
            last_synced_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("business_id", businessId)
          .eq("lease_token", lease)
      ).error,
    );
    return synced.data;
  } catch (error) {
    await db
      .from("excel_connections")
      .update({
        last_error:
          error instanceof HttpError
            ? error.message
            : "Cloud sync failed. The prior ledger is retained.",
      })
      .eq("business_id", businessId)
      .eq("lease_token", lease);
    throw error;
  } finally {
    await db
      .from("excel_connections")
      .update({ lease_until: null, lease_token: null })
      .eq("business_id", businessId)
      .eq("lease_token", lease);
  }
}
