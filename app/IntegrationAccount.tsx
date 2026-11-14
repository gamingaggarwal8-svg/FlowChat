"use client";
import { useEffect, useState } from "react";
import {
  announceWorkspace,
  browserSupabase,
  integrationConfig,
  postJSON,
  selectedBusiness,
  type IntegrationConfig,
} from "../lib/integrations/browser";
type Membership = {
  business_id: string;
  role: string;
  businesses: { name: string } | { name: string }[] | null;
};
export function IntegrationAccount({
  onChange,
}: {
  onChange: (config: IntegrationConfig, connected: boolean) => void;
}) {
  const [config, setConfig] = useState<IntegrationConfig | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [user, setUser] = useState(""),
    [memberships, setMemberships] = useState<Membership[]>([]),
    [business, setBusiness] = useState(""),
    [name, setName] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const c = await integrationConfig();
    setConfig(c);
    const db = await browserSupabase();
    const session = db ? (await db.auth.getSession()).data.session : null;
    setUser(session?.user.email || "");
    let rows: Membership[] = [];
    if (session && db) {
      const { data, error } = await db
        .from("business_members")
        .select("business_id,role,businesses(name)");
      if (error)
        throw new Error(
          "Apply the Supabase migration before creating a workspace.",
        );
      rows = (data || []) as Membership[];
    }
    setMemberships(rows);
    let chosen = selectedBusiness();
    if (!rows.some((r) => r.business_id === chosen)) {
      chosen = "";
      localStorage.removeItem("flowchat-business-id");
    }
    setBusiness(chosen);
    onChange(c, Boolean(chosen && session));
  }
  useEffect(() => {
    void refresh().catch((e) => setNotice(e.message));
    const handler = () => {
      void refresh().catch((e) => setNotice(e.message));
    };
    window.addEventListener("flowchat-workspace", handler);
    return () => window.removeEventListener("flowchat-workspace", handler);
  }, []); // Auth refresh also fires on explicit workspace changes.
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await task();
      await refresh();
      announceWorkspace();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Account action failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="integration-account" aria-label="Workspace account">
      <div>
        <strong>
          {business ? "Connected business workspace" : "Local demo workspace"}
        </strong>
        <p>
          {config?.supabase
            ? "Sign in and select a business to use private cloud features."
            : "Cloud credentials are not configured. Local imports and the synthetic dashboard remain available."}
        </p>
      </div>
      {config?.supabase &&
        (user ? (
          <div className="integration-account-controls">
            <span>{user}</span>
            <label>
              Workspace
              <select
                value={business}
                onChange={(e) => {
                  localStorage.setItem("flowchat-business-id", e.target.value);
                  setBusiness(e.target.value);
                  announceWorkspace();
                }}
              >
                <option value="">Synthetic demo</option>
                {memberships.map((m) => (
                  <option key={m.business_id} value={m.business_id}>
                    {(Array.isArray(m.businesses)
                      ? m.businesses[0]?.name
                      : m.businesses?.name) || m.business_id}{" "}
                    · {m.role}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await (await browserSupabase())?.auth.signOut();
                  localStorage.removeItem("flowchat-business-id");
                })
              }
            >
              Sign out
            </button>
            <details>
              <summary>Create business workspace</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const result = await postJSON("/api/account", {
                      action: "create",
                      name,
                    });
                    localStorage.setItem(
                      "flowchat-business-id",
                      result.businessId,
                    );
                    setName("");
                  });
                }}
              >
                <label>
                  Business name
                  <input
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Create workspace
                </button>
              </form>
            </details>
          </div>
        ) : (
          <form
            className="integration-signin"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const db = await browserSupabase();
                const result = await db!.auth.signInWithPassword({
                  email,
                  password,
                });
                if (result.error) throw result.error;
                setPassword("");
              });
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              Sign in
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !email || password.length < 12}
              onClick={() =>
                run(async () => {
                  const result = await (await browserSupabase())!.auth.signUp({
                    email,
                    password,
                  });
                  if (result.error) throw result.error;
                  setNotice(
                    "Check your email to confirm your account, then sign in.",
                  );
                })
              }
            >
              Create account
            </button>
          </form>
        ))}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
