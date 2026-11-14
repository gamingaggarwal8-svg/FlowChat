import React from "react";
import { createRoot } from "react-dom/client";
import Demo, { type Page } from "../app/Demo";
import AppEntry from "../app/AppEntry";
import "../app/globals.css";
const pages: Record<string, Page> = {
  "/import-chats": "Import Chats",
  "/accounting": "Accounting & Documents",
  "/sync": "Excel Sync",
  "/pricing": "Plans & Billing",
  "/copilot": "AI Copilot",
  "/settings": "Workspace Settings",
};
const path = window.location.pathname.replace(/\/$/, "");
createRoot(document.getElementById("root")!).render(
  path === "/login" ? (
    <AppEntry loginOnly />
  ) : path === "" ? (
    <AppEntry />
  ) : (
    <Demo initialPage={pages[path] || "Overview"} />
  ),
);
