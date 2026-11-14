"use client";
import { useEffect, useState } from "react";
import { IntegrationAccount } from "./IntegrationAccount";
import { AppIcon } from "./ui";
import Copilot from "./Copilot";
import {
  apiRequest,
  postJSON,
  download,
  localDocumentStore,
  announceWorkspace,
  type IntegrationConfig,
} from "../lib/integrations/browser";
import { parseWhatsApp, readChatExport } from "../lib/integrations/chat";
import {
  accountingCSV,
  documentKinds,
  invoiceSchema,
  invoiceIssues,
  type AccountingDocument,
} from "../lib/integrations/accounting";
import {
  canonical,
  latestRecords,
  type RecordVersion,
} from "../lib/integrations/records";
import { plans, type PlanId } from "../lib/integrations/plans";
import chatCache from "../demo/chat-cache.json";
import demoSeed from "../demo/seed.json";
import { type Dataset } from "../lib/business";
export type FeaturePage =
  | "Import Chats"
  | "Accounting & Documents"
  | "Excel Sync"
  | "Plans & Billing"
  | "AI Copilot"
  | "Workspace Settings";
const featurePages: FeaturePage[] = [
  "Import Chats",
  "Accounting & Documents",
  "Excel Sync",
  "Plans & Billing",
  "AI Copilot",
  "Workspace Settings",
];
export const isFeaturePage = (page: string): page is FeaturePage =>
  featurePages.includes(page as FeaturePage);
type LocalDocument = AccountingDocument & { file: Blob };
function errorText(e: unknown) {
  return e instanceof Error ? e.message : "The action failed. Please retry.";
}
export default function FeatureWorkspace({
  page,
  onReminder,
  demoData,
}: {
  page: FeaturePage;
  onReminder?: (party: string, text: string) => void;
  demoData?: Dataset;
}) {
  const [config, setConfig] = useState<IntegrationConfig | null>(null),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [customer, setCustomer] = useState(""),
    [owner, setOwner] = useState("Rakesh"),
    [chatText, setChatText] = useState(""),
    [extraction, setExtraction] = useState<unknown>(null),
    [exportChoices, setExportChoices] = useState<
      { name: string; text: string }[]
    >([]),
    [chatHistory, setChatHistory] = useState<
      { id: string; customer: string; extraction: unknown }[]
    >([]);
  const [docs, setDocs] = useState<AccountingDocument[]>([]),
    [kind, setKind] = useState<AccountingDocument["kind"]>("Sales invoice"),
    [search, setSearch] = useState(""),
    [preview, setPreview] = useState(""),
    [selectedDoc, setSelectedDoc] = useState<AccountingDocument | null>(null),
    [details, setDetails] = useState("");
  const [runs, setRuns] = useState<
      {
        created_at: string;
        source: string;
        inserted: number;
        unchanged: number;
      }[]
    >([]),
    [versions, setVersions] = useState<RecordVersion[]>([]),
    [auditOffset, setAuditOffset] = useState<number | null>(null),
    [cloud, setCloud] = useState<{
      drive_id: string;
      item_id: string;
      last_synced_at: string;
      last_error: string | null;
    } | null>(null),
    [driveId, setDriveId] = useState(""),
    [itemId, setItemId] = useState("");
  const [billing, setBilling] = useState<{
      subscriptions: { provider_id: string; plan: string; status: string }[];
      history: {
        id: string;
        amount_paise: number;
        status: string;
        created_at: string;
      }[];
    }>({ subscriptions: [], history: [] }),
    [demoPlan, setDemoPlan] = useState("free"),
    [checkout, setCheckout] = useState<PlanId | null>(null),
    [demoHistory, setDemoHistory] = useState<
      { plan: string; date: string; status: string }[]
    >([]);
  const [memberEmail, setMemberEmail] = useState(""),
    [memberRole, setMemberRole] = useState("viewer"),
    [members, setMembers] = useState<{ user_id: string; role: string }[]>([]),
    [voiceMessages, setVoiceMessages] = useState<unknown[]>([]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    if (page === "Accounting & Documents") {
      const result = connected
        ? (await apiRequest("/api/documents")).documents
        : await localDocumentStore<LocalDocument[]>("list");
      setDocs(result);
    }
    if (page === "Import Chats" && connected) {
      setChatHistory((await apiRequest("/api/chats")).chats);
    }
    if (page === "Excel Sync") {
      if (connected) {
        const response = await apiRequest("/api/sync");
        setRuns(response.runs);
        const audit = await apiRequest("/api/sync?history=1");
        setVersions(audit.versions);
        setAuditOffset(audit.nextOffset);
        try {
          setCloud((await apiRequest("/api/excel")).connection);
        } catch {
          setCloud(null);
        }
      } else {
        const local = JSON.parse(
          localStorage.getItem("flowchat-local-record-versions") || "[]",
        );
        setVersions(local);
        setRuns(
          JSON.parse(localStorage.getItem("flowchat-local-sync-runs") || "[]"),
        );
      }
    }
    if (page === "Plans & Billing") {
      if (connected) setBilling(await apiRequest("/api/billing"));
      else {
        setDemoPlan(localStorage.getItem("flowchat-demo-plan") || "free");
        setDemoHistory(
          JSON.parse(
            localStorage.getItem("flowchat-demo-billing-history") || "[]",
          ),
        );
      }
    }
    if (page === "Workspace Settings" && connected) {
      const result = await apiRequest("/api/account");
      setMembers(result.members);
      setVoiceMessages((await apiRequest("/api/whatsapp")).messages);
    }
  }
  useEffect(() => {
    setError("");
    setNotice("");
    setExtraction(null);
    setPreview("");
    setSelectedDoc(null);

    setChatHistory([]);
    setMembers([]);
    setVoiceMessages([]);
    void load().catch((e) => setError(errorText(e)));
  }, [page, connected]);
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function chooseExport(entry: { name: string; text: string }) {
    const messages = parseWhatsApp(entry.text);
    setChatText(entry.text);
    setCustomer(
      entry.name
        .replace(/\.txt$/i, "")
        .replace(/^WhatsApp Chat with /i, "")
        .replaceAll("_", " "),
    );
    setExtraction({
      messages: messages.slice(0, 8),
      totalMessages: messages.length,
    });
  }
  async function importChatFile(file: File) {
    const entries = await readChatExport(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
    );
    const chats = entries.filter((entry) => {
      try {
        parseWhatsApp(entry.text);
        return true;
      } catch {
        return false;
      }
    });
    if (!chats.length)
      throw new Error(
        "No supported WhatsApp conversations were found. Export with DD/MM/YYYY dates.",
      );
    setExportChoices(chats);
    chooseExport(chats[0]);
    setNotice(
      `${chats.length} conversation file(s) loaded. Choose a conversation and review its customer name before extraction.`,
    );
  }
  async function extractChat() {
    parseWhatsApp(chatText);
    if (!customer.trim()) throw new Error("Enter the customer name.");
    if (connected) {
      const result = await postJSON("/api/chats", {
        customer,
        text: chatText,
        owner,
      });
      setExtraction(result);
      setNotice(
        "Structured extraction saved for review. No ledger records were created.",
      );
      await load();
    } else {
      const cached = chatCache.find(
        (c) =>
          c.text.replaceAll("\r", "").trim() ===
          chatText.replaceAll("\r", "").trim(),
      );
      if (cached) {
        setExtraction({
          source:
            "Prepared synthetic demo annotations — not a live Gemini response",
          customer: cached.customer,
          result: cached.extraction,
        });
        setNotice(
          "Showing prepared demo annotations for this exact supplied chat.",
        );
      } else {
        setExtraction({
          messages: parseWhatsApp(chatText),
          source:
            "Local export parser only — semantic extraction requires a connected Gemini workspace",
        });
        setNotice(
          "Chat structure parsed locally. Configure Gemini and sign in for order and promise understanding.",
        );
      }
    }
  }
  async function uploadPDF(file: File) {
    if (file.size > 4 * 1024 * 1024) throw new Error("PDF limit is 4 MB.");
    if (
      new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== "%PDF-"
    )
      throw new Error("Choose a valid PDF file.");
    if (connected) {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      await apiRequest("/api/documents", { method: "POST", body: form });
      setNotice("PDF stored in private business storage.");
    } else {
      await localDocumentStore("put", {
        id: crypto.randomUUID(),
        name: file.name,
        kind,
        created_at: new Date().toISOString(),
        details: null,
        reviewed: false,
        file,
      });
      setNotice(
        "PDF saved in this browser only. Private Supabase storage requires a connected workspace.",
      );
    }
    await load();
  }
  async function viewDocument(doc: AccountingDocument, save = false) {
    if (connected) {
      const result = await apiRequest(
        `/api/documents?id=${doc.id}${save ? "&download=1" : ""}`,
      );
      if (save) {
        const response = await fetch(result.url);
        if (!response.ok) throw new Error("Download link expired. Retry.");
        download(await response.blob(), doc.name, "application/pdf");
      } else setPreview(result.url);
    } else {
      const stored = await localDocumentStore<LocalDocument>(
        "get",
        undefined,
        doc.id,
      );
      if (save) download(stored.file, doc.name, "application/pdf");
      else setPreview(URL.createObjectURL(stored.file));
    }
    setSelectedDoc(doc);
    setDetails(
      JSON.stringify(
        doc.details || {
          invoice_number: null,
          party: null,
          date: null,
          gstin: null,
          taxable_value: null,
          cgst: null,
          sgst: null,
          igst: null,
          total: null,
          evidence: "",
        },
        null,
        2,
      ),
    );
  }
  async function reviewDocument() {
    if (!selectedDoc) return;
    const parsed = invoiceSchema.parse(JSON.parse(details));
    if (
      ["Sales invoice", "Purchase bill"].includes(selectedDoc.kind) &&
      invoiceIssues(parsed).length
    )
      throw new Error(invoiceIssues(parsed).join(" "));
    if (connected)
      await postJSON(
        "/api/documents",
        { action: "review", id: selectedDoc.id, details: parsed },
        "PATCH",
      );
    else {
      const old = await localDocumentStore<LocalDocument>(
        "get",
        undefined,
        selectedDoc.id,
      );
      await localDocumentStore("put", {
        ...old,
        details: parsed,
        reviewed: true,
      });
    }
    setSelectedDoc({ ...selectedDoc, details: parsed, reviewed: true });
    await load();
    setNotice("Owner review saved. No ledger entry or GST filing was created.");
  }
  async function syncFile(file: File) {
    if (file.size > 4 * 1024 * 1024)
      throw new Error("Workbook upload limit is 4 MB.");
    if (connected) {
      const form = new FormData();
      form.set("file", file);
      const result = await apiRequest("/api/sync", {
        method: "POST",
        body: form,
      });
      setNotice(
        `Synced ${result.inserted} revisions; skipped ${result.unchanged} unchanged records.`,
      );
    } else {
      const { parseWorkbook } = await import("../lib/integrations/workbook");
      const rows = await parseWorkbook(
        new Uint8Array(await file.arrayBuffer()),
      );
      const history: RecordVersion[] = JSON.parse(
        localStorage.getItem("flowchat-local-record-versions") || "[]",
      );
      let inserted = 0,
        unchanged = 0;
      for (const row of rows) {
        const previous = history
          .filter((v) => v.kind === row.kind && v.record_id === row.id)
          .sort((a, b) => b.revision - a.revision)[0];
        if (previous && canonical(previous.payload) === canonical(row)) {
          unchanged++;
          continue;
        }
        history.push({
          kind: row.kind,
          record_id: row.id,
          revision: (previous?.revision || 0) + 1,
          payload: row,
          created_at: new Date().toISOString(),
        });
        inserted++;
      }
      const historyRuns = JSON.parse(
        localStorage.getItem("flowchat-local-sync-runs") || "[]",
      );
      historyRuns.unshift({
        created_at: new Date().toISOString(),
        source: file.name,
        inserted,
        unchanged,
      });
      localStorage.setItem(
        "flowchat-local-record-versions",
        JSON.stringify(history),
      );
      localStorage.setItem(
        "flowchat-local-sync-runs",
        JSON.stringify(historyRuns),
      );
      setNotice(
        `Local demo: ${inserted} new revisions, ${unchanged} duplicates skipped. Dashboard recalculated over synthetic data.`,
      );
    }
    announceWorkspace();
    await load();
  }
  async function buyPlan(plan: PlanId) {
    if (plan === "enterprise") {
      setNotice(
        "Enterprise pricing is custom. Record your requirements with the workspace owner; no charge or order was created.",
      );
      return;
    }
    if (!connected || !config?.razorpay) {
      setCheckout(plan);
      return;
    }
    if (plan === "free") {
      setNotice(
        "Cancel your current paid subscription below to return to Free at the end of the billing cycle.",
      );
      return;
    }
    const result = await postJSON("/api/billing", { action: "buy", plan });
    await openRazorpay(result);
  }
  async function openRazorpay(value: { key: string; subscription_id: string }) {
    const global = window as unknown as {
      Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
    };
    if (!global.Razorpay)
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error("Razorpay checkout could not load."));
        document.head.append(script);
      });
    new global.Razorpay!({
      key: value.key,
      subscription_id: value.subscription_id,
      name: "FlowChat",
      description: "Monthly subscription · provisional pricing",
      handler: async (response: {
        razorpay_subscription_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        await run(async () => {
          const verification = await postJSON("/api/billing", {
            action: "verify",
            subscription_id: response.razorpay_subscription_id,
            payment_id: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          setNotice(verification.message);
          await load();
        });
      },
      modal: {
        ondismiss: () => {
          setNotice(
            "Checkout closed. No paid status is granted without webhook confirmation.",
          );
        },
      },
    }).open();
  }
  const filteredDocs = docs.filter((d) =>
    `${d.name} ${d.kind} ${d.details?.party || ""} ${d.details?.invoice_number || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="integration-workspace">
      <IntegrationAccount
        onChange={(c, active) => {
          setConfig(c);
          setConnected(active);
        }}
      />
      <div aria-live="polite">
        {busy && (
          <p className="integration-status">
            Working… please keep this page open.
          </p>
        )}
        {notice && <p className="integration-status">{notice}</p>}
        {error && (
          <p className="integration-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {page === "Import Chats" && (
        <>
          <section className="panel integration-panel">
            <h2>Bring the conversation into view</h2>
            <p>
              Export a WhatsApp chat without media, then upload its .txt or .zip
              file. We preserve the original messages as evidence; extracted
              commitments never become payments automatically.
            </p>
            <div className="integration-form-grid">
              <label>
                WhatsApp export
                <input
                  type="file"
                  accept=".txt,.zip"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void run(() => importChatFile(file));
                    e.target.value = "";
                  }}
                />
              </label>
              <label>
                Customer name
                <input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                />
              </label>
              <label>
                Business owner’s chat name
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </label>
            </div>
            {exportChoices.length > 1 && (
              <label>
                Conversation in this archive
                <select
                  onChange={(e) =>
                    chooseExport(exportChoices[Number(e.target.value)])
                  }
                >
                  {exportChoices.map((entry, index) => (
                    <option key={`${entry.name}-${index}`} value={index}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Original conversation
              <textarea
                rows={9}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="DD/MM/YYYY, HH:MM - Name: message"
              />
            </label>
            <div className="integration-actions">
              <button
                className="primary"
                disabled={busy || !chatText.trim()}
                onClick={() => run(extractChat)}
              >
                <AppIcon name="spark" />
                Extract for review
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setCustomer(chatCache[0].customer);
                  setChatText(chatCache[0].text);
                  setNotice("Loaded a supplied synthetic demo chat.");
                }}
              >
                Load synthetic example
              </button>
              <span>
                {connected && config?.gemini
                  ? "Gemini structured extraction"
                  : "Prepared demo cache / local parsing"}
              </span>
            </div>
          </section>
          {extraction !== null && (
            <section className="panel integration-panel">
              <h2>Messages & extracted evidence</h2>
              <pre className="integration-json">
                {JSON.stringify(extraction, null, 2)}
              </pre>
            </section>
          )}
          {chatHistory.length > 0 && (
            <section className="panel integration-panel">
              <h2>Saved imports</h2>
              {chatHistory.map((c) => (
                <button
                  className="secondary"
                  key={c.id}
                  onClick={() => setExtraction(c.extraction)}
                >
                  {c.customer} · view extraction
                </button>
              ))}
            </section>
          )}
        </>
      )}
      {page === "Accounting & Documents" && (
        <>
          <section className="panel integration-panel">
            <h2>Your accounting library</h2>
            <p>
              Keep invoices, purchase bills, receipts and GST PDFs together.
              Extractions need review. Summaries are prepared for your CA;
              FlowChat does not file GST returns.
            </p>
            <div className="integration-actions">
              <label>
                Document category
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as AccountingDocument["kind"])
                  }
                >
                  {documentKinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Upload PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void run(() => uploadPDF(file));
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="secondary"
                disabled={!docs.length || busy}
                onClick={() =>
                  download(
                    accountingCSV(filteredDocs),
                    "flowchat-accounting.csv",
                    "text/csv;charset=utf-8",
                  )
                }
              >
                Download CSV
              </button>
              <button
                className="secondary"
                disabled={!docs.length || busy}
                onClick={() =>
                  run(async () => {
                    const { accountingPDF } =
                      await import("../lib/integrations/pdf");
                    download(
                      new Uint8Array(await accountingPDF(filteredDocs)),
                      "flowchat-ca-summary.pdf",
                      "application/pdf",
                    );
                  })
                }
              >
                Download CA PDF
              </button>
            </div>
            <label>
              Search documents
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="File, party, invoice number or category"
              />
            </label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Document",
                      "Category",
                      "Invoice / party",
                      "Review",
                      "Actions",
                    ].map((h) => (
                      <th scope="col" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.name}
                        <small>
                          {new Date(d.created_at).toLocaleDateString()}
                        </small>
                      </td>
                      <td>{d.kind}</td>
                      <td>
                        {d.details?.invoice_number || "—"}
                        <small>{d.details?.party || "Not extracted"}</small>
                      </td>
                      <td>{d.reviewed ? "Owner reviewed" : "Needs review"}</td>
                      <td>
                        <button
                          className="text-btn"
                          disabled={busy}
                          onClick={() => run(() => viewDocument(d))}
                        >
                          Preview & review
                        </button>
                        <button
                          className="text-btn"
                          disabled={busy}
                          onClick={() => run(() => viewDocument(d, true))}
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filteredDocs.length && (
              <p className="empty">
                Upload your first PDF to start the accounting library.
              </p>
            )}
          </section>
          {selectedDoc && (
            <section className="panel integration-panel">
              <div className="integration-actions">
                <h2>{selectedDoc.name}</h2>
                <button
                  className="secondary"
                  disabled={busy || !connected || !config?.gemini}
                  onClick={() =>
                    run(async () => {
                      const result = await postJSON(
                        "/api/documents",
                        { action: "extract", id: selectedDoc.id },
                        "PATCH",
                      );
                      setSelectedDoc(result.document);
                      setDetails(
                        JSON.stringify(result.document.details, null, 2),
                      );
                      setNotice(
                        result.issues.join(" ") ||
                          "Extraction validated. Check every field against the PDF.",
                      );
                      await load();
                    })
                  }
                >
                  Extract invoice with Gemini
                </button>
              </div>
              <div className="document-review-grid">
                <div>
                  {preview && (
                    <iframe
                      title={`PDF preview: ${selectedDoc.name}`}
                      src={preview}
                      className="document-preview"
                      sandbox="allow-same-origin"
                    />
                  )}
                  <p>
                    Signed preview links expire after 60 seconds. Select Preview
                    again to refresh.
                  </p>
                </div>
                <div>
                  <div className="invoice-review-fields">
                    {Object.entries({
                      invoice_number: "Invoice number",
                      party: "Party",
                      date: "Invoice date",
                      currency: "Currency (ISO code, e.g. INR)",
                      gstin: "GSTIN",
                      taxable_value: "Taxable value",
                      cgst: "CGST",
                      sgst: "SGST",
                      igst: "IGST",
                      total: "Total (document currency)",
                      evidence: "Source evidence",
                    }).map(([field, label]) => {
                      const fields = JSON.parse(details || "{}");
                      const numeric = [
                        "taxable_value",
                        "cgst",
                        "sgst",
                        "igst",
                        "total",
                      ].includes(field);
                      return (
                        <label key={field}>
                          {label}
                          <input
                            type={
                              numeric
                                ? "number"
                                : field === "date"
                                  ? "date"
                                  : "text"
                            }
                            step={numeric ? "0.01" : undefined}
                            min={numeric ? 0 : undefined}
                            value={fields[field] ?? ""}
                            onChange={(e) =>
                              setDetails(
                                JSON.stringify({
                                  ...fields,
                                  [field]:
                                    e.target.value === ""
                                      ? field === "evidence"
                                        ? ""
                                        : null
                                      : numeric
                                        ? Number(e.target.value)
                                        : e.target.value,
                                }),
                              )
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p>
                    Leave unknown fields empty. Use the document’s currency.
                    GST-summary review requires confirmed INR. A receipt or GST
                    document can have no invoice number. Review checks do not
                    certify tax compliance.
                  </p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => run(reviewDocument)}
                  >
                    Save owner review
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
      {page === "Excel Sync" && (
        <>
          <section className="panel integration-panel">
            <h2>One workbook, a traceable ledger</h2>
            <p>
              Use the named sheets in the template. Keep transaction IDs as
              text. Edited records create revisions; missing rows do not delete
              history. Mark a record void explicitly to reverse its effect.
              Inventory is the owner’s on-hand snapshot, excluding unreceived
              purchase orders.
            </p>
            <div className="integration-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const { workbookTemplate } =
                      await import("../lib/integrations/workbook");
                    download(
                      new Uint8Array(await workbookTemplate()),
                      "flowchat-workbook.xlsx",
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    );
                  })
                }
              >
                Download Excel template
              </button>
              <label>
                Sync workbook now
                <input
                  type="file"
                  accept=".xlsx"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void run(() => syncFile(file));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <h3>OneDrive / SharePoint connection</h3>
            <p>
              Save the workbook in OneDrive or SharePoint. A connected owner can
              sync the saved cloud file; a configured scheduled job can check
              for updates automatically.
            </p>
            <div className="integration-form-grid">
              <label>
                Microsoft Graph drive ID
                <input
                  value={driveId}
                  onChange={(e) => setDriveId(e.target.value)}
                />
              </label>
              <label>
                Workbook item ID
                <input
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                />
              </label>
            </div>
            <div className="integration-actions">
              <button
                className="secondary"
                disabled={
                  busy || !connected || !config?.excel || !driveId || !itemId
                }
                onClick={() =>
                  run(async () => {
                    const result = await postJSON("/api/excel", {
                      action: "connect",
                      driveId,
                      itemId,
                    });
                    window.location.assign(result.url);
                  })
                }
              >
                Connect Microsoft account
              </button>
              <button
                className="primary"
                disabled={busy || !connected || !cloud}
                onClick={() =>
                  run(async () => {
                    const result = await postJSON("/api/excel", {
                      action: "sync",
                    });
                    setNotice(
                      `Cloud sync complete: ${JSON.stringify(result.sync)}`,
                    );
                    announceWorkspace();
                    await load();
                  })
                }
              >
                Sync Now
              </button>
              <button
                className="secondary"
                disabled={busy || !cloud}
                onClick={() =>
                  run(async () => {
                    await postJSON("/api/excel", { action: "disconnect" });
                    setCloud(null);
                    setNotice(
                      "Workbook disconnected. Financial history is retained.",
                    );
                  })
                }
              >
                Disconnect workbook
              </button>
              <span>
                {cloud
                  ? `Last synced: ${cloud.last_synced_at || "Not yet"}`
                  : "No cloud workbook connected"}
              </span>
            </div>
            {cloud?.last_error && (
              <p role="status" className="integration-error">
                Last cloud attempt: {cloud.last_error} The previous ledger
                remains available.
              </p>
            )}
          </section>
          <section className="panel integration-panel">
            <h2>Sync audit history</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {["When", "Source", "New revisions", "Unchanged"].map(
                      (h) => (
                        <th scope="col" key={h}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={`${r.created_at}-${i}`}>
                      <td>{new Date(r.created_at).toLocaleString()}</td>
                      <td>{r.source}</td>
                      <td>{r.inserted}</td>
                      <td>{r.unchanged}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!runs.length && (
              <p className="empty">
                Upload a workbook to record your first sync.
              </p>
            )}
            {versions.length > 0 && (
              <details>
                <summary>Inspect record revisions ({versions.length})</summary>
                <pre className="integration-json">
                  {JSON.stringify(versions, null, 2)}
                </pre>
                <p>
                  Earlier revisions remain stored.{" "}
                  {connected
                    ? "Use Load earlier revisions to inspect more history."
                    : `${latestRecords(versions).length} current records.`}
                </p>
                {connected && auditOffset !== null && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const result = await apiRequest(
                          `/api/sync?history=1&offset=${auditOffset}`,
                        );
                        setVersions([...versions, ...result.versions]);
                        setAuditOffset(result.nextOffset);
                      })
                    }
                  >
                    Load earlier revisions
                  </button>
                )}
              </details>
            )}
          </section>
        </>
      )}
      {page === "Plans & Billing" && (
        <>
          <section className="pricing-intro">
            <h2>A plan for your next stage</h2>
            <p>
              Provisional monthly prices in INR. Paid plans require configured
              services. Demo checkout simulates a plan selection and never
              charges money or grants a real subscription.
            </p>
          </section>
          <div className="pricing-grid">
            {plans.map((p) => (
              <article
                className={`pricing-plan ${p.id === "pro" ? "pricing-featured" : ""}`}
                key={p.id}
              >
                <h3>{p.name}</h3>
                <p className="plan-price">
                  {p.price === null
                    ? "Let’s talk"
                    : `₹${p.price.toLocaleString("en-IN")}`}
                  <span>{p.price !== null ? "/ month" : ""}</span>
                </p>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>
                      <AppIcon name="check" size={16} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={p.id === "pro" ? "primary" : "secondary"}
                  disabled={busy}
                  onClick={() => run(() => buyPlan(p.id))}
                >
                  {p.id === "enterprise"
                    ? "Discuss Enterprise"
                    : p.id === "free"
                      ? "Choose Free"
                      : "Buy Plan"}
                </button>
              </article>
            ))}
          </div>
          <section className="panel integration-panel">
            <h2>Feature comparison</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Capability</th>
                    {plans.map((p) => (
                      <th scope="col" key={p.id}>
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Offline analytics",
                      "Included",
                      "Included",
                      "Included",
                      "Included",
                    ],
                    [
                      "Private cloud & Gemini",
                      "Local only",
                      "Configured services",
                      "Configured services",
                      "Custom",
                    ],
                    [
                      "OneDrive & team workflow",
                      "Manual files",
                      "Manual files",
                      "Configured services",
                      "Custom",
                    ],
                    ["Custom implementation", "—", "—", "—", "By agreement"],
                  ].map((r) => (
                    <tr key={r[0]}>
                      {r.map((v, i) => (
                        <td key={i}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Plan cards describe provisional packaging. This version does not
              enforce paid feature entitlements or usage-based quotas by plan;
              AI has a separate workspace safety limit.
            </p>
          </section>
          {checkout && (
            <section
              className="panel integration-panel"
              role="region"
              aria-label="Demo checkout"
            >
              <h2>Demo checkout · {checkout}</h2>
              <p>
                No payment details are collected. This simulates selection in
                the synthetic workspace only.
              </p>
              <div className="integration-actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    const history = [
                      {
                        plan: checkout,
                        date: new Date().toISOString(),
                        status: "Simulated — no charge",
                      },
                      ...demoHistory,
                    ];
                    localStorage.setItem("flowchat-demo-plan", checkout);
                    localStorage.setItem(
                      "flowchat-demo-billing-history",
                      JSON.stringify(history),
                    );
                    setDemoPlan(checkout);
                    setDemoHistory(history);
                    setCheckout(null);
                    setNotice("Demo plan selected. No money was charged.");
                  }}
                >
                  Simulate plan selection
                </button>
                <button className="secondary" onClick={() => setCheckout(null)}>
                  Cancel
                </button>
              </div>
            </section>
          )}
          <section className="panel integration-panel">
            <h2>Subscription management</h2>
            {connected ? (
              billing.subscriptions.map((s, i) => (
                <div
                  className="integration-actions"
                  key={`${s.provider_id}-${i}`}
                >
                  <strong>
                    {s.plan} · {s.status}
                  </strong>
                  <button
                    className="secondary"
                    disabled={
                      busy ||
                      !["active", "authenticated", "created"].includes(s.status)
                    }
                    onClick={() =>
                      run(async () => {
                        const result = await postJSON("/api/billing", {
                          action: "cancel",
                          subscription_id: s.provider_id,
                        });
                        setNotice(result.message);
                        await load();
                      })
                    }
                  >
                    Cancel at cycle end
                  </button>
                </div>
              ))
            ) : (
              <div className="integration-actions">
                <span>Demo selection: {demoPlan}</span>
                <button
                  className="secondary"
                  onClick={() => {
                    localStorage.setItem("flowchat-demo-plan", "free");
                    setDemoPlan("free");
                    setNotice("Demo selection reset to Free.");
                  }}
                >
                  Return demo to Free
                </button>
              </div>
            )}
            <h3>Billing history</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {["Date", "Plan / event", "Amount / status"].map((h) => (
                      <th scope="col" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {connected
                    ? billing.history.map((e) => (
                        <tr key={e.id}>
                          <td>{new Date(e.created_at).toLocaleString()}</td>
                          <td>{e.status}</td>
                          <td>
                            ₹{(e.amount_paise / 100).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))
                    : demoHistory.map((h, i) => (
                        <tr key={i}>
                          <td>{new Date(h.date).toLocaleString()}</td>
                          <td>{h.plan}</td>
                          <td>{h.status}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!(connected ? billing.history.length : demoHistory.length) && (
              <p className="empty">No billing events yet.</p>
            )}
          </section>
        </>
      )}
      {page === "AI Copilot" && (
        <Copilot
          connected={connected}
          data={demoData || (demoSeed as Dataset)}
          onReminder={onReminder}
        />
      )}
      {page === "Workspace Settings" && (
        <>
          <section className="panel integration-panel">
            <h2>People & permissions</h2>
            <p>
              Owners manage billing, Microsoft connections and teammates.
              Accountants can import chats, sync records and review documents.
              Viewers can read their business records. A teammate must create
              and confirm an account before an owner adds them.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await postJSON("/api/account", {
                    action: "member",
                    email: memberEmail,
                    role: memberRole,
                  });
                  setNotice("Workspace membership saved.");
                  await load();
                });
              }}
            >
              <div className="integration-actions">
                <label>
                  Teammate email
                  <input
                    type="email"
                    required
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                  />
                </label>
                <label>
                  Role
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="accountant">Accountant</option>
                  </select>
                </label>
                <button className="primary" disabled={busy || !connected}>
                  Add / update teammate
                </button>
              </div>
            </form>
            <ul>
              {members.map((m) => (
                <li key={m.user_id}>
                  {m.user_id} · {m.role}
                </li>
              ))}
            </ul>
          </section>
          <section className="panel integration-panel">
            <h2>Connections</h2>
            <dl className="connection-list">
              <dt>Gemini</dt>
              <dd>
                {config?.gemini
                  ? "Server credential configured"
                  : "Not configured"}
              </dd>
              <dt>Supabase</dt>
              <dd>
                {config?.supabase
                  ? "Project configured; sign-in required"
                  : "Local demo"}
              </dd>
              <dt>Razorpay</dt>
              <dd>
                {config?.razorpay
                  ? "Checkout configured; webhook also required"
                  : "Demo checkout only"}
              </dd>
              <dt>Excel cloud</dt>
              <dd>
                {config?.excel
                  ? "Microsoft credentials configured"
                  : "Manual workbook upload available"}
              </dd>
            </dl>
            <h3>WhatsApp live messages</h3>
            <p>
              Official Meta Cloud API webhook only. A server administrator must
              onboard the business number, configure signed webhooks and map its
              phone number ID to this workspace. Historical chats still use
              exports. Received voice media IDs are retained; live audio
              transcription is not connected.
            </p>
            {voiceMessages.length ? (
              <pre className="integration-json">
                {JSON.stringify(voiceMessages, null, 2)}
              </pre>
            ) : (
              <p>No live messages received for this workspace.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
