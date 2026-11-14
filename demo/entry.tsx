import React from "react";
import { createRoot } from "react-dom/client";
import Demo, { type Page } from "../app/Demo";
import "../app/globals.css";
const pages: Record<string, Page> = {
  "/import-chats": "Import Chats",
  "/accounting": "Accounting & Documents",
  "/sync": "Excel Sync",
  "/pricing": "Plans & Billing",
  "/copilot": "AI Copilot",
  "/settings": "Workspace Settings",
};
createRoot(document.getElementById("root")!).render(
  <Demo
    initialPage={
      pages[window.location.pathname.replace(/\/$/, "")] || "Overview"
    }
  />,
);
