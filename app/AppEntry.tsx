"use client";
import { useEffect, useState } from "react";
import Demo from "./Demo";
import Login from "./Login";
import type { OperationsData } from "./Operations";
import { browserSupabase } from "../lib/integrations/browser";
export default function AppEntry({
  initialOperations,
  loginOnly = false,
}: {
  initialOperations?: OperationsData;
  loginOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    if (loginOnly) return;
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      try {
        localStorage.removeItem("flowchat-business-id");
      } catch {
        /* Keep the offline demo accessible. */
      }
      setOpen(true);
      return;
    }
    void browserSupabase()
      .then(async (db) => {
        if (!db) return;
        const {
          data: { user },
        } = await db.auth.getUser();
        if (active && user) setOpen(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [loginOnly]);
  if (open && !loginOnly) return <Demo initialOperations={initialOperations} />;
  return (
    <Login
      onAuthenticated={() => {
        if (loginOnly) window.location.assign("/");
        else {
          window.history.replaceState(window.history.state, "", "/");
          setOpen(true);
        }
      }}
      onDemo={() => {
        if (loginOnly) window.location.assign("/?demo=1");
        else {
          window.history.replaceState(window.history.state, "", "/?demo=1");
          setOpen(true);
        }
      }}
    />
  );
}
