"use client";
import { useEffect, useState } from "react";
import { AppIcon } from "./ui";
import WorkflowMap from "./WorkflowMap";
import {
  announceWorkspace,
  browserSupabase,
  integrationConfig,
  selectedBusiness,
} from "../lib/integrations/browser";
type Mode = "signin" | "signup" | "forgot" | "reset";
type Membership = {
  business_id: string;
  role: string;
  businesses: { name: string } | { name: string }[] | null;
};
export default function Login({
  onAuthenticated,
  onDemo,
}: {
  onAuthenticated?: () => void;
  onDemo?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("signin"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [configured, setConfigured] = useState(false),
    [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [user, setUser] = useState(""),
    [memberships, setMemberships] = useState<Membership[]>([]),
    [business, setBusiness] = useState("");
  async function refresh() {
    const config = await integrationConfig();
    setConfigured(config.supabase);
    const db = await browserSupabase();
    if (!db) return;
    const {
      data: { user: current },
    } = await db.auth.getUser();
    setUser(current?.email || "");
    if (current) {
      const { data, error: loadError } = await db
        .from("business_members")
        .select("business_id,role,businesses(name)");
      if (loadError)
        throw new Error(
          "Your workspace is not ready yet. Please check the database setup.",
        );
      const rows = (data || []) as Membership[];
      setMemberships(rows);
      const selected =
        rows.find((r) => r.business_id === selectedBusiness())?.business_id ||
        rows[0]?.business_id ||
        "";
      setBusiness(selected);
    }
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reset") === "1")
      setMode("reset");
    void refresh()
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Unable to load your account.",
        ),
      )
      .finally(() => setChecking(false));
  }, []);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign-in failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function continueToWorkspace(chosen = business) {
    try {
      localStorage.setItem("flowchat-business-id", chosen);
    } catch {
      setError(
        "Allow browser storage to choose a cloud workspace, or explore the demo.",
      );
      return;
    }
    announceWorkspace();
    if (onAuthenticated && chosen) onAuthenticated();
    else window.location.assign(chosen ? "/" : "/settings");
  }
  async function submit() {
    const db = await browserSupabase();
    if (!db)
      throw new Error(
        "Cloud sign-in is unavailable here. You can explore the demo below.",
      );
    if (mode === "forgot") {
      const result = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?reset=1`,
      });
      if (result.error) throw result.error;
      setMessage(
        "If an account exists for this email, you’ll receive a password-reset link.",
      );
      return;
    }
    if (mode === "reset") {
      if (password !== confirmation)
        throw new Error("The two passwords do not match.");
      const result = await db.auth.updateUser({ password });
      if (result.error) throw result.error;
      setPassword("");
      setConfirmation("");
      setMode("signin");
      setMessage("Your password is updated. Continue to your workspace.");
      await refresh();
      return;
    }
    if (mode === "signup") {
      if (password !== confirmation)
        throw new Error("The two passwords do not match.");
      const result = await db.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (result.error) throw result.error;
      setPassword("");
      setConfirmation("");
      setMessage(
        "Check your email to confirm your account. Then sign in to create your business workspace.",
      );
      await refresh();
      return;
    }
    const result = await db.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    setPassword("");
    const rows = await db
      .from("business_members")
      .select("business_id,role,businesses(name)");
    if (rows.error)
      throw new Error(
        "Signed in, but workspace setup is incomplete. Check your database migrations.",
      );
    const choices = (rows.data || []) as Membership[];
    if (choices.length === 1) {
      continueToWorkspace(choices[0].business_id);
      return;
    }
    if (!choices.length) {
      continueToWorkspace("");
      return;
    }
    await refresh();
  }
  function explore() {
    try {
      localStorage.removeItem("flowchat-business-id");
    } catch {
      /* The demo still works for this session. */
    }
    announceWorkspace();
    if (onDemo) onDemo();
    else window.location.assign("/?demo=1");
  }
  const title =
    mode === "signup"
      ? "Make room for clearer business."
      : mode === "forgot"
        ? "Let’s get you back in."
        : mode === "reset"
          ? "A fresh start."
          : "Welcome back.";
  return (
    <main className="login-page">
      <section className="login-story">
        <a className="login-brand" href="/">
          <AppIcon name="brand" size={33} />
          FlowChat<span>Chat se cash tak.</span>
        </a>
        <div className="login-story-copy">
          <h1>
            Good business starts
            <br />
            with a conversation.
          </h1>
          <p>
            Keep the context. Find the next step.
            <br />
            Give your trading day a little more breathing room.
          </p>
        </div>
        <WorkflowMap compact />
        <p className="login-story-footer">
          Conversations. Commitments. A clearer way forward.
        </p>
      </section>
      <section className="login-form-side">
        <a
          className="login-demo-top"
          href="/?demo=1"
          onClick={(e) => {
            e.preventDefault();
            explore();
          }}
        >
          Explore the demo <AppIcon name="arrow" size={17} />
        </a>
        <div className="login-form-content">
          <span className="login-emblem">
            <AppIcon name="brand" size={29} />
          </span>
          <h2>
            {user && mode !== "reset" ? "Your workspace is ready." : title}
          </h2>
          <p className="login-description">
            {user && mode !== "reset"
              ? `You’re signed in as ${user}.`
              : mode === "signup"
                ? "Your conversations and business records, connected in one place."
                : mode === "forgot"
                  ? "Enter your account email and we’ll send a reset link."
                  : mode === "reset"
                    ? "Choose a new password for your account."
                    : "Sign in to pick up where your business left off."}
          </p>
          {user && mode !== "reset" ? (
            <div className="login-session">
              {memberships.length > 0 && (
                <label>
                  Business workspace
                  <select
                    value={business}
                    onChange={(e) => setBusiness(e.target.value)}
                  >
                    {memberships.map((m) => (
                      <option key={m.business_id} value={m.business_id}>
                        {(Array.isArray(m.businesses)
                          ? m.businesses[0]?.name
                          : m.businesses?.name) || "Your business"}{" "}
                        · {m.role}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="primary login-submit"
                disabled={busy}
                onClick={() => continueToWorkspace()}
              >
                {memberships.length
                  ? "Open workspace"
                  : "Create your business workspace"}
                <AppIcon name="arrow" size={18} />
              </button>
              <button
                className="text-btn"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await (await browserSupabase())!.auth.signOut();
                    localStorage.removeItem("flowchat-business-id");
                    setUser("");
                    setMemberships([]);
                    announceWorkspace();
                  })
                }
              >
                Use another account
              </button>
            </div>
          ) : (
            <form
              className="login-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(submit);
              }}
            >
              {mode !== "reset" && (
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@yourbusiness.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy || !configured || checking}
                  />
                </label>
              )}
              {mode !== "forgot" && (
                <label>
                  Password
                  <div className="login-password">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "signin" ? "current-password" : "new-password"
                      }
                      minLength={mode === "signin" ? 6 : 12}
                      required
                      placeholder={
                        mode === "signin"
                          ? "Your password"
                          : "At least 12 characters"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy || !configured || checking}
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <AppIcon
                        name={showPassword ? "eye-off" : "eye"}
                        size={20}
                      />
                    </button>
                  </div>
                </label>
              )}
              {(mode === "signup" || mode === "reset") && (
                <label>
                  Confirm password
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    disabled={busy || !configured || checking}
                  />
                </label>
              )}
              {mode === "signin" && (
                <button
                  type="button"
                  className="login-forgot"
                  onClick={() => {
                    setMode("forgot");
                    setError("");
                    setMessage("");
                  }}
                >
                  Forgot password?
                </button>
              )}
              <button
                className="primary login-submit"
                disabled={busy || !configured || checking}
              >
                {busy
                  ? "Please wait…"
                  : mode === "signin"
                    ? "Sign in to FlowChat"
                    : mode === "signup"
                      ? "Create account"
                      : mode === "forgot"
                        ? "Send reset link"
                        : "Update password"}
                <AppIcon name="arrow" size={18} />
              </button>
            </form>
          )}
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="login-message" role="status">
              {message}
            </p>
          )}
          {!checking && !configured && (
            <p className="login-offline">
              Cloud sign-in isn’t connected in this demo. You can explore the
              workspace without an account.
            </p>
          )}
          {!user && (
            <p className="login-switch">
              {mode === "signin"
                ? "New to FlowChat?"
                : "Already have an account?"}{" "}
              <button
                className="text-btn"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError("");
                  setMessage("");
                  setConfirmation("");
                }}
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          )}
          <div className="login-divider">
            <span>or take a look around</span>
          </div>
          <button className="secondary login-explore" onClick={explore}>
            Explore the synthetic demo <AppIcon name="external" size={17} />
          </button>
          <p className="login-privacy">
            <AppIcon name="lock" size={14} />
            Private workspaces. Owner-approved actions.
          </p>
        </div>
        <footer className="login-form-footer">
          Built for the conversations behind your business.
        </footer>
      </section>
    </main>
  );
}
