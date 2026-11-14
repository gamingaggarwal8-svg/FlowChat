import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http";
export function validSignature(
  payload: string,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export async function razorpay(path: string, method = "GET", body?: unknown) {
  const id = process.env.RAZORPAY_KEY_ID,
    secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret)
    throw new HttpError(503, "Razorpay is not configured. Use demo checkout.");
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new HttpError(
      502,
      "Razorpay could not complete this request. Check billing settings.",
    );
  return response.json();
}
