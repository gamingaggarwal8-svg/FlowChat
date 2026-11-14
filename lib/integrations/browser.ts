import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export type IntegrationConfig = {
  server: boolean;
  supabase: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  gemini: boolean;
  razorpay: boolean;
  excel: boolean;
};
const offline: IntegrationConfig = {
  server: false,
  supabase: false,
  supabaseUrl: "",
  supabaseAnonKey: "",
  gemini: false,
  razorpay: false,
  excel: false,
};
let configPromise: Promise<IntegrationConfig> | undefined,
  client: SupabaseClient | undefined;
export function integrationConfig() {
  return (configPromise ??= (async () => {
    try {
      const response = await fetch("/api/integrations", {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return offline;
      return (await response.json()) as IntegrationConfig;
    } catch {
      return offline;
    }
  })());
}
export async function browserSupabase() {
  const config = await integrationConfig();
  if (!config.supabase) return null;
  return (client ??= createClient(config.supabaseUrl, config.supabaseAnonKey));
}
export function selectedBusiness() {
  return typeof window !== "undefined"
    ? localStorage.getItem("flowchat-business-id") || ""
    : "";
}
export function announceWorkspace() {
  window.dispatchEvent(new Event("flowchat-workspace"));
}
export async function apiRequest(path: string, options: RequestInit = {}) {
  const supabase = await browserSupabase();
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  const headers = new Headers(options.headers);
  if (session) headers.set("Authorization", `Bearer ${session.access_token}`);
  const business = selectedBusiness();
  if (business) headers.set("x-business-id", business);
  const response = await fetch(path, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(175000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "This action needs the Next.js server. Local demo features remain available.",
    );
  }
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
export const postJSON = (path: string, value: unknown, method = "POST") =>
  apiRequest(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
export function download(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function localDocumentStore<T>(
  operation: "list" | "put" | "get",
  value?: T,
  key?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("flowchat-local-documents", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("documents", { keyPath: "id" });
    request.onerror = () =>
      reject(new Error("Local document storage is unavailable."));
    request.onsuccess = () => {
      const db = request.result,
        tx = db.transaction(
          "documents",
          operation === "put" ? "readwrite" : "readonly",
        ),
        store = tx.objectStore("documents");
      const action =
        operation === "list"
          ? store.getAll()
          : operation === "put"
            ? store.put(value)
            : store.get(key!);
      let result: T;
      action.onsuccess = () => {
        result = (operation === "put" ? value : action.result) as T;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(
          new Error("Unable to save locally. Browser storage may be full."),
        );
      };
    };
  });
}
