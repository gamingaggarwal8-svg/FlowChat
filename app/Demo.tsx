"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import seed from "../demo/seed.json";
import VoiceNotes from "./VoiceNotes";
import { AppIcon as Icon } from "./ui";
import operationsSeed from "../demo/operations.json";
import { CustomerVisuals, OverviewVisuals, PromiseVisuals } from "./Charts";
import {
  OperationsOverview,
  SupplierSheet,
  InventoryGrowth,
  type OperationsData,
} from "./Operations";
import { cashAnalytics, inventoryAnalytics } from "../lib/analytics";
import {
  TODAY,
  metrics,
  money,
  answerQuestion,
  bargain,
  importCSV,
  type Dataset,
  type Analysis,
} from "../lib/business";

type Page =
  | "Voice transcripts"
  | "Suppliers"
  | "Inventory & growth"
  | "Overview"
  | "Customers"
  | "Payment promises"
  | "Chat review"
  | "Approval queue"
  | "Bargaining";
type Draft = {
  id: string;
  customer: string;
  text: string;
  type: "Reminder" | "Price" | "Supplier" | "Purchase";
  status: "Pending" | "Approved" | "Rejected";
};
type Modal =
  | { type: "customer"; name: string }
  | { type: "draft"; name: string; text: string; kind: Draft["type"] }
  | { type: "import" }
  | { type: "reset" }
  | null;
const DATA_KEY = "flowchat-demo-data-v2",
  QUEUE_KEY = "flowchat-demo-queue-v1";
function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
}
function Badge({ status }: { status: string }) {
  const label = status === "Missed" ? "Potentially missed · Review" : status;
  return <span className={`badge ${status.toLowerCase()}`}>{label}</span>;
}
function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th scope="col" key={i}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty">No matching records.</div>}
    </div>
  );
}
export default function Demo({
  initialOperations,
}: { initialOperations?: OperationsData } = {}) {
  const [data, setData] = useState<Dataset>(seed as Dataset);
  const [queue, setQueue] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState<Page>("Overview");
  const [navOpen, setNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Analysis | null>(null);
  const [promiseFilter, setPromiseFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("All");
  const [chatName, setChatName] = useState("Sharma Textiles");
  const [draftText, setDraftText] = useState("");
  const [importError, setImportError] = useState("");
  const [importLog, setImportLog] = useState<string[]>([]);
  const [tour, setTour] = useState<number | null>(null);
  const [offer, setOffer] = useState("185");
  const [quantity, setQuantity] = useState("100");
  const [sku, setSku] = useState("P01");
  const [bargainResult, setBargainResult] = useState<ReturnType<
    typeof bargain
  > | null>(null);
  const [bargainCustomer, setBargainCustomer] = useState("Sharma Textiles");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const m = useMemo(() => metrics(data), [data]);
  const operations = useMemo<OperationsData>(
    () => ({
      ...(initialOperations || (operationsSeed as OperationsData)),
      customerInvoices: data.invoices.map((i) => ({
        id: i.invoice_id,
        party: i.customer,
        date: i.date,
        dueDate: i.due_date,
        total: i.total,
        source: { file: "invoices.csv", id: i.invoice_id },
      })),
      customerPayments: data.payments.map((p) => ({
        id: p.payment_id,
        party: p.customer,
        date: p.date,
        amount: p.amount,
        source: { file: "payments.csv", id: p.payment_id },
      })),
      quotes: data.quotes.map((q) => ({
        id: q.quote_id,
        customer: q.customer,
        date: q.date,
        taxableValue: q.taxable_value,
        status: q.status,
        items: q.items,
        source: { file: "quotes.csv", id: q.quote_id },
      })),
    }),
    [data, initialOperations],
  );
  const cash = useMemo(() => cashAnalytics(operations), [operations]);
  const stock = useMemo(() => inventoryAnalytics(operations), [operations]);
  function operationsDraft(
    name: string,
    text: string,
    kind: "Supplier" | "Purchase",
  ) {
    setDraftText(text);
    setModal({ type: "draft", name, text, kind });
  }

  const pendingCount = queue.filter((q) => q.status === "Pending").length;
  const subtitle =
    page === "Voice transcripts"
      ? "Review voice transcripts, capture speech and keep the original evidence."
      : page === "Suppliers"
        ? "Your purchase partners, open orders, delivery commitments and payables."
        : page === "Inventory & growth"
          ? "Decide what to focus on, what to receive, and when to buy more."
          : page === "Overview"
            ? "Customers, suppliers and stock. See what needs your attention next."
            : page === "Customers"
              ? "Every rupee reconciled. Every customer in view."
              : page === "Payment promises"
                ? "What they said. What they paid. What needs a review."
                : page === "Chat review"
                  ? "The original conversation, alongside prepared demo annotations."
                  : page === "Approval queue"
                    ? "Review the words before they leave your workspace."
                    : "A clear price decision. A considered reply. You have the final say.";
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DATA_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed.invoices) &&
          Array.isArray(parsed.payments) &&
          Array.isArray(parsed.promises) &&
          Array.isArray(parsed.quotes) &&
          Array.isArray(parsed.customers) &&
          Array.isArray(parsed.products) &&
          Array.isArray(parsed.chats)
        )
          setData(parsed);
      }
      const savedQueue = localStorage.getItem(QUEUE_KEY);
      if (savedQueue && Array.isArray(JSON.parse(savedQueue)))
        setQueue(JSON.parse(savedQueue));
    } catch {
      setToast("Saved demo could not be loaded. Using sample data.");
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded)
      try {
        localStorage.setItem(DATA_KEY, JSON.stringify(data));
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      } catch {
        setToast("Browser storage unavailable; changes last for this session.");
      }
  }, [data, queue, loaded]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const d = dialogRef.current;
    if (modal && !d?.open) d?.showModal();
    else if (!modal && d?.open) d.close();
  }, [modal]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!isMobile || !navOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled])",
        ) ?? [],
      );
    controls()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        return;
      }
      if (event.key === "Tab") {
        const nodes = controls(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handle);
      menuRef.current?.focus();
    };
  }, [isMobile, navOpen]);
  function navigate(p: Page) {
    setPage(p);
    setSearch("");
    setAnswer(null);
    setNavOpen(false);
  }
  function ask(q: string) {
    setQuestion(q);
    setAnswer(answerQuestion(q, data));
  }
  function reminder(name: string) {
    const row = m.ledger.find((c) => c.customer === name);
    const last = m.promises
      .filter(
        (p) => p.customer === name && ["Missed", "Partial"].includes(p.status),
      )
      .sort((a, b) =>
        (b.promised_date || "").localeCompare(a.promised_date || ""),
      )[0];
    const text = `Namaste ${name.split(" ")[0]} ji, ${row?.overdue ? `${money(row.overdue)} ka payment overdue hai` : `${money(row?.outstanding || 0)} balance pending hai`}.${last ? ` Aapne ${last.promised_date} tak ${money(last.amount || 0)} bhejne ko bola tha.` : ""} Kripya payment ka update aur expected date bata dein. Dhanyavaad, Rakesh.`;
    setDraftText(text);
    setModal({ type: "draft", name, text, kind: "Reminder" });
  }
  function saveDraft() {
    if (modal?.type !== "draft" || !draftText.trim()) return;
    setQueue((prev) => [
      {
        id: crypto.randomUUID(),
        customer: modal.name,
        text: draftText.trim(),
        type: modal.kind,
        status: "Pending",
      },
      ...prev,
    ]);
    setModal(null);
    setToast("Draft added to approval queue. Nothing was sent.");
  }
  function customerButton(name: string) {
    return (
      <button
        className="customer customer-link"
        onClick={() => setModal({ type: "customer", name })}
      >
        <span className="avatar">{initials(name)}</span>
        <span>
          {name}
          <small>
            {m.ledger.find((c) => c.customer === name)?.city || "Customer"}
          </small>
        </span>
      </button>
    );
  }
  function promiseRows(list: typeof m.promises) {
    return list.map((p, i) => [
      customerButton(p.customer),
      <div key={i} className="quote">
        “{p.quote}”
        {p.via_voice && <small className="voice">Voice transcript</small>}
        <small>Made {p.made_on}</small>
      </div>,
      p.promised_date || "Unknown",
      <span key={i} className="money">
        {p.amount === null ? "Unknown" : money(p.amount)}
      </span>,
      <span key={i}>
        {money(p.paid)}
        <small>
          {p.evidence.map((e) => e.payment_id).join(", ") ||
            "No payment in window"}
        </small>
      </span>,
      <Badge key={i} status={p.status} />,
      <button
        key={i}
        className="text-btn"
        onClick={() => reminder(p.customer)}
        disabled={!m.ledger.find((c) => c.customer === p.customer)?.outstanding}
      >
        Draft reminder <Icon name="external" size={14} />
      </button>,
    ]);
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setImportError("");
    setImportLog([]);
    let next = data;
    const logs: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > 2 * 1024 * 1024)
          throw new Error(`${file.name}: maximum file size is 2 MB`);
        const text = await file.text();
        if (file.name.toLowerCase().endsWith(".txt")) {
          const name = file.name
            .replace(/\.txt$/i, "")
            .replaceAll("_", " ")
            .replace(/\b\w/g, (s) => s.toUpperCase());
          next = {
            ...next,
            chats: [
              ...next.chats.filter((c) => c.filename !== file.name),
              { customer: name, text, filename: file.name },
            ],
          };
          logs.push(
            `${file.name}: stored for review; AI extraction is not connected.`,
          );
        } else {
          next = importCSV(file.name, text, next);
          logs.push(`${file.name}: validated and loaded.`);
        }
      }
      setData(next);
      setAnswer(null);
      setImportLog(logs);
      setToast("Files imported locally. Calculations refreshed.");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed");
    }
  }
  const steps = [
    {
      title: "1. Read the messy chat",
      description:
        "Open Sharma Textiles. Show the exact “26 tarikh” promise and the later payment message.",
      page: "Chat review" as Page,
    },
    {
      title: "2. Follow the rupees",
      description:
        "Ask “Kis customer ka sabse zyada paisa atka hai?” and inspect the invoice evidence.",
      page: "Overview" as Page,
    },
    {
      title: "3. Check the promise",
      description:
        "Filter missed promises. Compare promised dates with payment evidence. Show Gupta’s voice-note promise.",
      page: "Payment promises" as Page,
    },
    {
      title: "4. Take an approved action",
      description:
        "Draft a Hinglish reminder, edit it, then approve and copy it from the queue. No messages are sent.",
      page: "Approval queue" as Page,
    },
  ];
  const chosenChat =
    data.chats.find((c) => c.customer === chatName) || data.chats[0];
  const selectedProduct =
    data.products.find((p) => p.sku === sku) || data.products[0];
  const pageTitles: Record<Page, string> = {
    Overview: "Your trading day, in view.",
    Customers: "Customer ledger",
    Suppliers: "Supplier workspace",
    "Inventory & growth": "Inventory & growth",
    "Payment promises": "Payment promises",
    "Chat review": "Conversation review",
    "Voice transcripts": "Voice transcripts",
    "Approval queue": "Approval queue",
    Bargaining: "Bargaining desk",
  };
  const navGroups = [
    {
      name: "Business",
      items: [
        "Overview",
        "Inventory & growth",
        "Suppliers",
        "Customers",
      ] as Page[],
    },
    {
      name: "Conversations",
      items: ["Payment promises", "Chat review", "Voice transcripts"] as Page[],
    },
    {
      name: "Owner controls",
      items: ["Approval queue", "Bargaining"] as Page[],
    },
  ];
  return (
    <div className="ops-app" data-page={page}>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      {navOpen && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        inert={isMobile && !navOpen ? true : undefined}
        aria-hidden={isMobile && !navOpen ? true : undefined}
        className={navOpen ? "sidebar is-open" : "sidebar"}
        aria-label="Workspace navigation"
      >
        <button
          className="sidebar-close"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        >
          <Icon name="close" size={21} />
        </button>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <Icon name="brand" size={29} />
          <span>FlowChat</span>
        </a>
        <div className="workspace">
          <span className="avatar">RT</span>
          <div>
            Rakesh Textiles<small>Owner workspace</small>
          </div>
          <Icon name="down" size={14} />
        </div>
        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.name}>
              <p className="nav-group-label">{group.name}</p>
              {group.items.map((p) => (
                <button
                  key={p}
                  aria-current={page === p ? "page" : undefined}
                  className={page === p ? "active" : ""}
                  onClick={() => navigate(p)}
                >
                  <Icon name={p} />
                  <span>
                    {p === "Inventory & growth"
                      ? "Inventory & growth"
                      : p === "Voice transcripts"
                        ? "Voice notes"
                        : p === "Payment promises"
                          ? "Promises"
                          : p === "Approval queue"
                            ? "Approvals"
                            : p === "Chat review"
                              ? "Chat review"
                              : p}
                  </span>
                  {p === "Payment promises" && (
                    <b>
                      {m.promises.filter((p) => p.status === "Missed").length}
                    </b>
                  )}
                  {p === "Approval queue" && pendingCount > 0 && (
                    <b>{pendingCount}</b>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="aside-bottom">
          <div className="privacy">
            <Icon name="lock" size={16} />
            <div>
              <strong>Owner stays in control</strong>
              <p>Drafts need your approval. Nothing auto-sends.</p>
            </div>
          </div>
          <button
            className="reset-demo"
            onClick={() => setModal({ type: "reset" })}
          >
            <Icon name="reset" size={15} /> Reset demo data
          </button>
          <div className="profile">
            <span className="avatar">RK</span>
            <div>
              Rakesh Kumar<small>Workspace owner</small>
            </div>
            <span className="online-indicator" />
          </div>
        </div>
      </aside>
      <main
        id="main-content"
        tabIndex={-1}
        inert={isMobile && navOpen ? true : undefined}
      >
        <header>
          <div className="header-location">
            <button
              ref={menuRef}
              className="mobile-menu"
              aria-label={navOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={navOpen}
              onClick={() => setNavOpen(!navOpen)}
            >
              <Icon name={navOpen ? "close" : "menu"} size={22} />
            </button>
            <span className="breadcrumb">
              Workspace <Icon name="chevron" size={13} />{" "}
              <strong>{page}</strong>
            </span>
          </div>
          <div className="header-right">
            <span className="sample-label">
              <span className="demo-dot" /> Synthetic demo
            </span>
            <span className="header-date">14 Nov 2026</span>
            <button
              onClick={() => {
                setImportError("");
                setImportLog([]);
                setModal({ type: "import" });
              }}
            >
              <Icon name="upload" size={15} /> Import data
            </button>
          </div>
        </header>
        <section className="content">
          <div className="page-heading">
            <div>
              <h1>{pageTitles[page]}</h1>
              <p>{subtitle}</p>
            </div>
            <button
              className="tour-button"
              onClick={() => {
                setTour(0);
                navigate("Chat review");
              }}
            >
              <Icon name="play" size={13} /> Demo walkthrough
            </button>
          </div>
          {tour !== null && (
            <div className="tour-banner">
              <div>
                <strong>{steps[tour].title}</strong>
                <p>{steps[tour].description}</p>
              </div>
              <div className="tour-actions">
                <button onClick={() => setTour(null)} className="text-btn">
                  Exit
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    if (tour === 3) {
                      setTour(null);
                      setToast(
                        "Demo complete. All actions stayed in your workspace.",
                      );
                    } else {
                      setTour(tour + 1);
                      navigate(steps[tour + 1].page);
                    }
                  }}
                >
                  {tour === 3 ? "Finish" : "Next step"}
                </button>
              </div>
            </div>
          )}
          {page === "Overview" && (
            <>
              <OperationsOverview data={operations} onOpen={navigate} />
              <div className="stats">
                {[
                  {
                    label: "Customer receivables",
                    value: m.outstanding,
                    note: `Across ${m.ledger.filter((c) => c.outstanding > 0).length} customers`,
                    icon: "Customers",
                  },
                  {
                    label: "Supplier payables",
                    value: cash.payables,
                    note: "Inspect invoices and supplier terms",
                    icon: "Suppliers",
                  },
                  {
                    label: "Stock value at cost",
                    value: stock.valueAtCost,
                    note: `${stock.lowStock.length} low-stock · ${stock.overstock.length} overstock SKUs`,
                    icon: "Inventory & growth",
                  },
                  {
                    label: "Quoted, not confirmed",
                    value: m.openQuotes,
                    note: `${data.quotes.filter((q) => q.status === "open").length} open quotes · excluding GST`,
                    icon: "file",
                  },
                ].map((s, i) => (
                  <button
                    className="stat"
                    key={s.label}
                    onClick={() => {
                      if (i === 2) {
                        navigate("Inventory & growth");
                      } else if (i === 1) {
                        navigate("Suppliers");
                      } else if (i === 3) {
                        ask("Show open quotations");
                      } else {
                        navigate("Customers");
                        setCustomerFilter(i === 1 ? "Overdue" : "All");
                      }
                    }}
                  >
                    <div className="stat-top">
                      {s.label}
                      <Icon name={s.icon} size={16} />
                    </div>
                    <div className="amount">{money(s.value)}</div>
                    <small className={i === 2 ? "emphasis" : ""}>
                      {s.note}
                    </small>
                  </button>
                ))}
              </div>
              <OverviewVisuals
                data={operations}
                onCustomer={(name) => setModal({ type: "customer", name })}
                onSuppliers={() => navigate("Suppliers")}
              />
              <div className="ask">
                <div className="ask-title">
                  <Icon name="Chat review" size={19} />
                  Ask your business
                  <span className="tiny-pill">Calculated answers</span>
                </div>
                <p>
                  Ask in English or Hinglish. Get an answer you can trace back
                  to the ledger.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(question);
                  }}
                >
                  <Icon name="Chat review" size={17} />
                  <input
                    aria-label="Ask your business"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Kis customer ka sabse zyada paisa atka hai?"
                  />
                  <button className="primary" type="submit">
                    Ask FlowChat <Icon name="arrow" size={15} />
                  </button>
                </form>
                <div className="chips">
                  {[
                    "Kis customer ka sabse zyada paisa atka hai?",
                    "Show overdue payments",
                    "Which promises were missed?",
                  ].map((q) => (
                    <button key={q} onClick={() => ask(q)}>
                      {q} <Icon name="external" size={14} />
                    </button>
                  ))}
                </div>
                <div className="demo-note">
                  Predefined analysis functions · live AI is not connected
                </div>
                {answer && (
                  <div className="answer">
                    <div className="section-head">
                      <h2>{answer.title}</h2>
                      <button
                        aria-label="Close answer"
                        onClick={() => setAnswer(null)}
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                    <p>{answer.explanation}</p>
                    {answer.columns.length > 0 && (
                      <DataTable columns={answer.columns} rows={answer.rows} />
                    )}
                    <div className="methodology">{answer.methodology}</div>
                  </div>
                )}
              </div>
              <div className="panel">
                <div className="section-head">
                  <div>
                    <h2>
                      Receivables that need your attention{" "}
                      <span className="count-pill">
                        {m.ledger.filter((c) => c.outstanding > 0).length}
                      </span>
                    </h2>
                    <p>
                      Review the balance, then inspect its invoices or prepare a
                      follow-up.
                    </p>
                  </div>
                  <button
                    className="inline-link"
                    onClick={() => navigate("Customers")}
                  >
                    View all customers <Icon name="chevron" size={13} />
                  </button>
                </div>
                <DataTable
                  columns={[
                    "CUSTOMER",
                    "OUTSTANDING",
                    "OVERDUE",
                    "LATEST PROMISE",
                    "NEXT STEP",
                  ]}
                  rows={m.ledger
                    .filter((c) => c.outstanding > 0)
                    .slice(0, 5)
                    .map((c) => {
                      const last = m.promises
                        .filter((p) => p.customer === c.customer)
                        .sort((a, b) => b.made_on.localeCompare(a.made_on))[0];
                      return [
                        customerButton(c.customer),
                        <span className="money" key="m">
                          {money(c.outstanding)}
                        </span>,
                        <span
                          key="o"
                          className={c.overdue ? "overdue-money" : "muted"}
                        >
                          {money(c.overdue)}
                        </span>,
                        last ? (
                          <div key="p">
                            <Badge status={last.status} />
                            <small>{last.promised_date}</small>
                          </div>
                        ) : (
                          <span key="p" className="muted">
                            No promise yet
                          </span>
                        ),
                        <button
                          key="b"
                          className="text-btn"
                          onClick={() => reminder(c.customer)}
                        >
                          Draft reminder <Icon name="external" size={14} />
                        </button>,
                      ];
                    })}
                />
                <div className="table-foot">
                  <span>
                    <span className="demo-dot" /> Reconciled from{" "}
                    {data.invoices.length} invoices and {data.payments.length}{" "}
                    payments
                  </span>
                  <span>Customer-wise FIFO allocation</span>
                </div>
              </div>
              <div className="bottom-grid">
                <div className="panel">
                  <div className="section-head">
                    <h2>Follow-ups to review</h2>
                    <Icon name="Payment promises" size={17} />
                  </div>
                  {m.promises
                    .filter(
                      (p) => p.status === "Missed" || p.status === "Partial",
                    )
                    .slice(0, 3)
                    .map((p, i) => (
                      <div className="activity" key={i}>
                        <span className="dot">
                          <Icon name="Chat review" size={13} />
                        </span>
                        <div>
                          <strong>{p.customer}</strong>
                          <p>“{p.quote}”</p>
                          <span className="subtle">
                            {p.promised_date} · {p.status} · {money(p.paid)}{" "}
                            received in window
                          </span>
                        </div>
                        <button
                          className="activity-action"
                          aria-label={`Review ${p.customer} promise`}
                          onClick={() => {
                            setChatName(p.customer);
                            navigate("Chat review");
                          }}
                        >
                          <Icon name="chevron" size={15} />
                        </button>
                      </div>
                    ))}
                </div>
                <div className="panel hint-card">
                  <div className="hint-orbit">
                    <Icon name="check" size={21} />
                  </div>
                  <h3>A balance cleared.</h3>
                  <p>
                    Open Verma Garments’ ledger to check the invoices and
                    payments behind the current balance.
                  </p>
                  <button
                    className="text-btn"
                    onClick={() =>
                      setModal({ type: "customer", name: "Verma Garments" })
                    }
                  >
                    View Verma’s ledger <Icon name="arrow" size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
          {page === "Voice transcripts" && (
            <VoiceNotes
              data={operations}
              chats={data.chats}
              onOpenChat={(customer) => {
                setChatName(customer);
                navigate("Chat review");
              }}
            />
          )}
          {page === "Suppliers" && (
            <SupplierSheet data={operations} onDraft={operationsDraft} />
          )}
          {page === "Inventory & growth" && (
            <InventoryGrowth data={operations} onDraft={operationsDraft} />
          )}
          {page === "Customers" && (
            <>
              <CustomerVisuals
                data={operations}
                onSelect={(name) => setModal({ type: "customer", name })}
              />
              <div className="panel customer-ledger">
                <div className="ledger-ribbon">
                  <span>CUSTOMER WORKSPACE</span>
                  <span>Money coming in · invoices include GST</span>
                </div>
                <div className="section-head">
                  <div>
                    <h2>
                      Customer ledger{" "}
                      <span className="count-pill">{m.ledger.length}</span>
                    </h2>
                    <p>
                      Invoices include GST. Payments allocated to oldest invoice
                      first.
                    </p>
                  </div>
                  <div className="tabs">
                    {["All", "Overdue", "Settled"].map((f) => (
                      <button
                        key={f}
                        className={customerFilter === f ? "selected" : ""}
                        onClick={() => setCustomerFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  className="search"
                  aria-label="Search customers"
                  placeholder="Search customer or city…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <DataTable
                  columns={[
                    "CUSTOMER",
                    "TOTAL BILLED",
                    "PAYMENTS",
                    "OUTSTANDING",
                    "OVERDUE",
                    "ACTION",
                  ]}
                  rows={m.ledger
                    .filter((c) =>
                      (c.customer + " " + c.city)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .filter(
                      (c) =>
                        customerFilter === "All" ||
                        (customerFilter === "Overdue" && c.overdue > 0) ||
                        (customerFilter === "Settled" && c.outstanding === 0),
                    )
                    .map((c) => [
                      customerButton(c.customer),
                      money(c.billed),
                      money(c.paid),
                      <strong key="out">{money(c.outstanding)}</strong>,
                      <span
                        key="od"
                        className={c.overdue ? "overdue-money" : "muted"}
                      >
                        {money(c.overdue)}
                      </span>,
                      c.outstanding > 0 ? (
                        <button
                          key="draft"
                          className="text-btn"
                          onClick={() => reminder(c.customer)}
                        >
                          Draft reminder <Icon name="external" size={14} />
                        </button>
                      ) : (
                        <Badge key="paid" status="Kept" />
                      ),
                    ])}
                />
                <div className="ledger-explainer">
                  <strong>Outstanding</strong> = all money still owed.{" "}
                  <strong>Overdue</strong> = the part that is already late.
                  Don’t add them together.
                </div>
              </div>
            </>
          )}
          {page === "Payment promises" && (
            <>
              <PromiseVisuals data={operations} onFilter={setPromiseFilter} />
              <div className="promise-summary">
                {["All", "Missed", "Partial", "Kept", "Pending"].map((s) => (
                  <button
                    className={promiseFilter === s ? "selected" : ""}
                    key={s}
                    onClick={() => setPromiseFilter(s)}
                  >
                    <span>
                      {s === "All"
                        ? "All promises"
                        : s === "Missed"
                          ? "Potentially missed"
                          : s}
                    </span>
                    <strong>
                      {s === "All"
                        ? m.promises.length
                        : m.promises.filter((p) => p.status === s).length}
                    </strong>
                  </button>
                ))}
              </div>
              <div className="panel">
                <div className="section-head">
                  <div>
                    <h2>What was promised. What came in.</h2>
                    <p>
                      Prepared chat annotations + calculated payment evidence.
                    </p>
                  </div>
                  <Badge status="Demo fixture" />
                </div>
                <DataTable
                  columns={[
                    "CUSTOMER",
                    "EXACT PROMISE",
                    "DUE",
                    "PROMISED",
                    "PAID IN WINDOW",
                    "STATUS",
                    "ACTION",
                  ]}
                  rows={promiseRows(
                    m.promises.filter(
                      (p) =>
                        promiseFilter === "All" || p.status === promiseFilter,
                    ),
                  )}
                />
                <p className="methodology">
                  Payment window: made_on → promised date + 2 days, capped at 14
                  Nov. ≥95% paid = kept. A passed date with no payment =
                  potentially missed (review); some payment = partial. Amounts
                  are candidate matches, not verified payment intent;
                  overlapping windows may reuse evidence.
                </p>
              </div>
            </>
          )}
          {page === "Chat review" && (
            <div className="chat-layout">
              <div className="panel chat-list">
                <div className="section-head">
                  <h2>Conversations</h2>
                  <span className="count-pill">{data.chats.length}</span>
                </div>
                {data.chats.map((c) => (
                  <button
                    key={c.filename}
                    className={
                      chosenChat?.filename === c.filename ? "selected" : ""
                    }
                    onClick={() => setChatName(c.customer)}
                  >
                    <span className="avatar">{initials(c.customer)}</span>
                    <span>
                      {c.customer}
                      <small>{c.filename}</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="panel conversation">
                <div className="section-head">
                  <div>
                    <h2>{chosenChat?.customer || "No chat selected"}</h2>
                    <p>Original WhatsApp export · owner: Rakesh</p>
                  </div>
                  <Badge status="Source text" />
                </div>
                <div className="chat-messages">
                  {chosenChat?.text
                    .split("\n")
                    .filter(Boolean)
                    .map((line, i) => {
                      const match = line.match(
                        /^(\d{2}\/\d{2}\/\d{4}), (\d{2}:\d{2}) - ([^:]+): (.*)$/,
                      );
                      return match ? (
                        <div
                          key={i}
                          className={`bubble ${match[3] === "Rakesh" ? "owner" : ""}`}
                        >
                          <div className="bubble-meta">
                            {match[3]}{" "}
                            <span>
                              {match[1]} · {match[2]}
                            </span>
                          </div>
                          {match[4]}
                        </div>
                      ) : (
                        <div className="bubble" key={i}>
                          {line}
                        </div>
                      );
                    })}
                </div>
              </div>
              <div className="panel annotations">
                <h2>From chat to follow-up</h2>
                <p>
                  These annotations were supplied with the dataset. Live
                  extraction is waiting for an API key.
                </p>
                {m.promises
                  .filter((p) => p.customer === chosenChat?.customer)
                  .map((p, i) => (
                    <div className="annotation" key={i}>
                      <Badge status={p.status} />
                      <blockquote>“{p.quote}”</blockquote>
                      <p>
                        {p.via_voice ? "Voice transcript" : "Customer message"}{" "}
                        · {p.made_on}
                      </p>
                      <dl>
                        <dt>Promised date</dt>
                        <dd>{p.promised_date}</dd>
                        <dt>Amount</dt>
                        <dd>
                          {p.amount === null ? "Unknown" : money(p.amount)}
                        </dd>
                        <dt>Payments in window</dt>
                        <dd>{money(p.paid)}</dd>
                      </dl>
                      <button
                        className="text-btn"
                        onClick={() => reminder(p.customer)}
                      >
                        Draft a reminder <Icon name="external" size={14} />
                      </button>
                    </div>
                  ))}
                {!m.promises.some(
                  (p) => p.customer === chosenChat?.customer,
                ) && (
                  <div className="empty">
                    No prepared payment promises.
                    <br />
                    New uploads await AI extraction.
                  </div>
                )}
                <div className="annotation-rule">
                  <Icon name="lock" size={14} />
                  <span>
                    “Woh wala” stays ambiguous. Vague “dekhta hoon” lines are
                    not promises.
                  </span>
                </div>
              </div>
            </div>
          )}
          {page === "Approval queue" && (
            <div className="panel">
              <div className="section-head">
                <div>
                  <h2>
                    Drafts for your review{" "}
                    <span className="count-pill">{pendingCount}</span>
                  </h2>
                  <p>Approval means ready to copy. Sending stays with you.</p>
                </div>
                <button
                  className="text-btn"
                  onClick={() => reminder(m.ledger[0].customer)}
                >
                  + Draft reminder
                </button>
              </div>
              {!queue.length ? (
                <div className="empty queue-empty">
                  <div className="empty-icon">
                    <Icon name="Approval queue" size={32} />
                  </div>
                  <h2>A thoughtful message starts here.</h2>
                  <p>
                    Choose a customer, draft a follow-up, and make it your own.
                  </p>
                  <button
                    className="primary"
                    onClick={() => navigate("Customers")}
                  >
                    Choose a customer <Icon name="arrow" size={14} />
                  </button>
                </div>
              ) : (
                queue.map((q) => (
                  <div className="queue-card" key={q.id}>
                    <div className="section-head">
                      <div>
                        <strong>{q.customer}</strong>
                        <p>{q.type} draft</p>
                      </div>
                      <Badge status={q.status} />
                    </div>
                    {q.status === "Pending" ? (
                      <textarea
                        aria-label={`Edit draft for ${q.customer}`}
                        value={q.text}
                        onChange={(e) =>
                          setQueue((prev) =>
                            prev.map((d) =>
                              d.id === q.id
                                ? { ...d, text: e.target.value }
                                : d,
                            ),
                          )
                        }
                      />
                    ) : (
                      <div className="draft-preview">{q.text}</div>
                    )}
                    <div className="queue-actions">
                      {q.status === "Pending" ? (
                        <>
                          <button
                            className="text-btn"
                            onClick={() =>
                              setQueue((prev) =>
                                prev.map((d) =>
                                  d.id === q.id
                                    ? { ...d, status: "Rejected" }
                                    : d,
                                ),
                              )
                            }
                          >
                            Reject
                          </button>
                          <button
                            className="primary"
                            disabled={!q.text.trim()}
                            onClick={() => {
                              setQueue((prev) =>
                                prev.map((d) =>
                                  d.id === q.id
                                    ? { ...d, status: "Approved" }
                                    : d,
                                ),
                              );
                              setToast(
                                "Approved. Ready to copy; nothing was sent.",
                              );
                            }}
                          >
                            Approve draft <Icon name="check" size={13} />
                          </button>
                        </>
                      ) : q.status === "Approved" ? (
                        <button
                          className="primary"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(q.text);
                              setToast("Copied. Send it yourself when ready.");
                            } catch {
                              setToast(
                                "Clipboard unavailable. Select and copy the approved text.",
                              );
                            }
                          }}
                        >
                          Copy approved message
                        </button>
                      ) : (
                        <span className="muted">Rejected · not sent</span>
                      )}
                      <small>No auto-send · owner controlled</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {page === "Bargaining" && (
            <div className="bargain-grid">
              <div className="panel">
                <div className="section-head">
                  <div>
                    <h2>A price you can stand behind.</h2>
                    <p>
                      Owner-only rules preview. Every price reply needs
                      approval.
                    </p>
                  </div>
                  <Icon name="lock" />
                </div>
                <label className="field">
                  Customer
                  <select
                    value={bargainCustomer}
                    onChange={(e) => {
                      setBargainCustomer(e.target.value);
                      setBargainResult(null);
                    }}
                  >
                    {data.customers.map((c) => (
                      <option key={c.customer}>{c.customer}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Product
                  <select
                    value={sku}
                    onChange={(e) => {
                      setSku(e.target.value);
                      setBargainResult(null);
                    }}
                  >
                    {data.products.map((p) => (
                      <option key={p.sku} value={p.sku}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="two-fields">
                  <label className="field">
                    Customer offer (₹ / {selectedProduct.unit})
                    <input
                      type="number"
                      min="1"
                      value={offer}
                      onChange={(e) => {
                        setOffer(e.target.value);
                        setBargainResult(null);
                      }}
                    />
                  </label>
                  <label className="field">
                    Quantity ({selectedProduct.unit})
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => {
                        setQuantity(e.target.value);
                        setBargainResult(null);
                      }}
                    />
                  </label>
                </div>
                <div className="owner-prices">
                  <span>
                    List price{" "}
                    <strong>{money(selectedProduct.list_price)}</strong>
                  </span>
                  <span>
                    Owner floor{" "}
                    <strong>{money(selectedProduct.floor_price)}</strong>
                    <small>Private · never included in reply</small>
                  </span>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    try {
                      setBargainResult(
                        bargain(
                          selectedProduct,
                          Number(offer),
                          Number(quantity),
                        ),
                      );
                    } catch (e) {
                      setToast(
                        e instanceof Error ? e.message : "Invalid offer",
                      );
                    }
                  }}
                >
                  Check offer <Icon name="arrow" size={14} />
                </button>
              </div>
              <div className="panel hint-card">
                {bargainResult ? (
                  <>
                    <h3>
                      {bargainResult.belowFloor
                        ? "Below floor. Counter suggested."
                        : "Within limits. Ready for review."}
                    </h3>
                    <p>
                      Suggested rate:{" "}
                      <strong>
                        {money(bargainResult.rate)} / {selectedProduct.unit}
                      </strong>
                    </p>
                    <div className="draft-preview">{bargainResult.draft}</div>
                    <button
                      className="primary"
                      onClick={() => {
                        setDraftText(bargainResult.draft);
                        setModal({
                          type: "draft",
                          name: bargainCustomer,
                          text: bargainResult.draft,
                          kind: "Price",
                        });
                      }}
                    >
                      Review reply draft <Icon name="arrow" size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <h3>
                      Keep your floor price
                      <br />
                      off the conversation.
                    </h3>
                    <p>
                      Enter a customer’s offer. Code checks the owner’s price
                      limit and suggests a reply. Below-floor offers receive a
                      counter, with owner approval required.
                    </p>
                    <p>
                      Quantity does not apply a volume discount in this demo.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="data-notice">
            <Icon name="file" size={13} />
            <span>
              Demo data (synthetic) · v2 · 12 customers ·{" "}
              {operations.suppliers.length} suppliers ·{" "}
              {operations.inventory.length} products · as of {TODAY}. Prepared
              annotations, not live AI extraction.
            </span>
          </div>
        </section>
        <footer>
          <span>
            <i /> Numbers are calculated, not generated.
          </span>
          <span>Demo data (synthetic) · Chat se cash tak.</span>
        </footer>
      </main>
      <dialog
        aria-label={
          modal?.type === "customer"
            ? `${modal.name} customer ledger`
            : modal?.type === "draft"
              ? "Review message draft"
              : modal?.type === "import"
                ? "Import business data"
                : "Reset demo data"
        }
        ref={dialogRef}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setModal(null);
        }}
      >
        <button
          className="close"
          aria-label="Close dialog"
          onClick={() => setModal(null)}
        >
          <Icon name="close" size={20} />
        </button>
        {modal?.type === "customer" &&
          (() => {
            const c = m.ledger.find((c) => c.customer === modal.name);
            return c ? (
              <>
                <h2>{c.customer}</h2>
                <div className="customer-summary">
                  <div>
                    <small>Outstanding</small>
                    <strong>{money(c.outstanding)}</strong>
                  </div>
                  <div>
                    <small>Overdue</small>
                    <strong>{money(c.overdue)}</strong>
                  </div>
                  <div>
                    <small>Total paid</small>
                    <strong>{money(c.paid)}</strong>
                  </div>
                </div>
                <h3>Invoice source rows</h3>
                <DataTable
                  columns={[
                    "INVOICE",
                    "DATE",
                    "DUE",
                    "TOTAL",
                    "ALLOCATED",
                    "REMAINING",
                  ]}
                  rows={c.invoices.map((i) => [
                    i.invoice_id,
                    i.date,
                    i.due_date,
                    money(i.total),
                    money(i.allocated),
                    money(i.remaining),
                  ])}
                />
                <h3>Payment source rows</h3>
                <DataTable
                  columns={["PAYMENT", "DATE", "AMOUNT", "MODE"]}
                  rows={c.payments.map((p) => [
                    p.payment_id,
                    p.date,
                    money(p.amount),
                    p.mode || "—",
                  ])}
                />
                <p className="methodology">
                  {money(c.billed)} billed − {money(c.paid)} paid ={" "}
                  {money(c.outstanding)} outstanding. Oldest invoices receive
                  payments first. Credit balance: {money(c.credit)}.
                </p>
                {c.outstanding > 0 && (
                  <button
                    className="primary"
                    onClick={() => reminder(c.customer)}
                  >
                    Draft Hinglish reminder <Icon name="arrow" size={14} />
                  </button>
                )}
              </>
            ) : (
              <p>Customer not found.</p>
            );
          })()}
        {modal?.type === "draft" && (
          <>
            <h2>
              {modal.kind === "Price"
                ? "Price reply"
                : modal.kind === "Supplier"
                  ? "Supplier follow-up"
                  : modal.kind === "Purchase"
                    ? "Stock request"
                    : "Payment reminder"}{" "}
              · {modal.name}
            </h2>
            <p>Edit the draft before adding it to your approval queue.</p>
            <textarea
              aria-label="Edit message draft"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
            />
            <div className="modal-actions">
              <span className="muted">
                <Icon name="lock" size={13} /> Nothing will be sent.
              </span>
              <button
                className="primary"
                disabled={!draftText.trim()}
                onClick={saveDraft}
              >
                Add to approval queue <Icon name="arrow" size={14} />
              </button>
            </div>
          </>
        )}
        {modal?.type === "import" && (
          <>
            <h2>Bring your ledger into focus.</h2>
            <p>
              CSV imports replace the matching table. Upload all related files
              together for a consistent ledger.
            </p>
            <div className="upload-zone">
              <Icon name="upload" size={26} />
              <h3>Choose your files</h3>
              <p>invoices.csv · payments.csv · quotes.csv · chat .txt</p>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".csv,.txt"
                aria-label="Import CSV or chat files"
                onChange={(e) => {
                  void importFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {importError && (
              <div className="error" role="alert">
                Import rejected. No changes were applied.
                <br />
                {importError}
              </div>
            )}
            {importLog.map((log) => (
              <p className="import-log" key={log}>
                <Icon name="check" size={14} /> {log}
              </p>
            ))}
            <details>
              <summary>CSV columns and import behavior</summary>
              <div className="code">
                invoices.csv: invoice_id,customer,date,due_date,total
                <br />
                payments.csv: payment_id,customer,date,amount
                <br />
                quotes.csv: quote_id,customer,date,taxable_value,status,items
              </div>
              <p>
                Dates: YYYY-MM-DD. Amounts: plain numbers in ₹, no currency
                symbols. IDs must be unique.
              </p>
            </details>
            <p className="methodology">
              Files stay in this browser. Uploaded chats are available for
              review but are not extracted. Prepared promise annotations remain
              from the sample dataset. Reset demo data to restore the original
              ledger.
            </p>
            <a
              className="text-btn download"
              href="/flowchat-sample-data.zip"
              download
            >
              <Icon name="file" size={14} /> Download sample files
            </a>
          </>
        )}
        {modal?.type === "reset" && (
          <>
            <h2>Start a fresh demo?</h2>
            <p>
              This clears your local imports and approval drafts, and restores
              the sample dataset.
            </p>
            <button className="text-btn" onClick={() => setModal(null)}>
              Keep my changes
            </button>{" "}
            <button
              className="primary"
              onClick={() => {
                setData(seed as Dataset);
                setQueue([]);
                setAnswer(null);
                setModal(null);
                setToast("Demo reset. Original sample data restored.");
                navigate("Overview");
              }}
            >
              Reset demo
            </button>
          </>
        )}
      </dialog>
      {toast && (
        <div id="toast" style={{ display: "block" }} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
