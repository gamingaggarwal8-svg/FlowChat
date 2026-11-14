"use client";
import { useEffect, useRef, useState } from "react";
import { apiRequest, postJSON } from "../lib/integrations/browser";
import { answerQuestion, metrics, money, type Dataset } from "../lib/business";
import { AppIcon } from "./ui";
type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  facts?: unknown;
};
type Thread = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};
type LocalThread = Thread & { messages: Turn[] };
const HISTORY_KEY = "flowchat-demo-ai-history-v1";
function readLocal(): LocalThread[] {
  const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  if (!Array.isArray(value))
    throw new Error("Saved demo conversations are invalid.");
  return value;
}
export default function Copilot({
  connected,
  data,
  onReminder,
}: {
  connected: boolean;
  data: Dataset;
  onReminder?: (party: string, text: string) => void;
}) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState<Thread[]>([]),
    [conversationId, setConversationId] = useState<string | null>(null),
    [messages, setMessages] = useState<Turn[]>([]),
    [question, setQuestion] = useState(""),
    [task, setTask] = useState<"ask" | "reminder">("ask"),
    [draft, setDraft] = useState(""),
    [draftParty, setDraftParty] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages]);
  async function selectThread(id: string) {
    const result = connected
      ? await apiRequest(`/api/conversations?id=${id}`)
      : { messages: readLocal().find((t) => t.id === id)?.messages || [] };
    setConversationId(id);
    setMessages(result.messages);
    setDraft("");
    setConfirmDelete(false);
  }
  useEffect(() => {
    let active = true;
    setMessages([]);
    setConversationId(null);
    setError("");
    async function load() {
      const records: Thread[] = connected
        ? (await apiRequest("/api/conversations")).threads
        : readLocal().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      if (!active) return;
      setThreads(records);
      if (records[0]) {
        const result = connected
          ? await apiRequest(`/api/conversations?id=${records[0].id}`)
          : {
              messages:
                readLocal().find((t) => t.id === records[0].id)?.messages || [],
            };
        if (active) {
          setConversationId(records[0].id);
          setMessages(result.messages);
        }
      }
    }
    void load().catch((e) => {
      if (active)
        setError(
          e instanceof Error ? e.message : "Unable to load conversations.",
        );
    });
    return () => {
      active = false;
    };
  }, [connected]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete the request.",
      );
    } finally {
      setBusy(false);
    }
  }
  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setQuestion("");
    setConfirmDelete(false);
    setNotice("New conversation. Earlier conversations are still saved.");
  }
  async function send() {
    const prompt = question.trim();
    if (!prompt) return;
    if (task === "reminder") {
      let text: string;
      if (connected) {
        const response = await postJSON("/api/ai", {
          task: "reminder",
          party: prompt,
        });
        text = response.result.text;
      } else {
        const row = metrics(data).ledger.find(
          (r) => r.customer.toLowerCase() === prompt.toLowerCase(),
        );
        if (!row || row.outstanding <= 0)
          throw new Error(
            "Enter the exact name of a customer with a recorded outstanding balance.",
          );
        text = `${row.customer} ji, aapke ledger mein ${money(row.outstanding)} outstanding hai. Payment ki date confirm kar denge? Dhanyavaad.`;
      }
      setDraft(text);
      setDraftParty(prompt);
      setNotice(
        connected
          ? "Gemini draft ready for your review."
          : "Offline template. No Gemini request was made.",
      );
      return;
    }
    if (connected) {
      const response = await postJSON("/api/ai", {
        task: "ask",
        question: prompt,
        conversationId,
      });
      const records = await apiRequest("/api/conversations");
      setThreads(records.threads);
      await selectThread(response.conversationId);
      setNotice("Conversation saved privately to your business account.");
    } else {
      const response = answerQuestion(prompt, data);
      const time = new Date().toISOString();
      const id = conversationId || crypto.randomUUID();
      const next = [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "user" as const,
          content: prompt,
          created_at: time,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: `${response.title}\n\n${response.explanation}`,
          created_at: time,
          facts: {
            columns: response.columns,
            rows: response.rows,
            methodology: response.methodology,
          },
        },
      ];
      const all = readLocal();
      const old = all.find((t) => t.id === id);
      const record: LocalThread = {
        id,
        title: old?.title || prompt.slice(0, 90),
        created_at: old?.created_at || time,
        updated_at: time,
        messages: next,
      };
      const records = [record, ...all.filter((t) => t.id !== id)];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
      setThreads(records);
      setConversationId(id);
      setMessages(next);
      setNotice(
        "Saved in this browser. This is a deterministic demo answer, not Gemini.",
      );
    }
    setQuestion("");
  }
  async function removeConversation() {
    if (!conversationId) return;
    if (connected)
      await postJSON("/api/conversations", { id: conversationId }, "DELETE");
    else
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(readLocal().filter((t) => t.id !== conversationId)),
      );
    setThreads(threads.filter((t) => t.id !== conversationId));
    newConversation();
    setNotice(
      "Conversation deleted. Imported chats, documents and financial records were retained.",
    );
  }
  const filtered = threads.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section
      className="copilot-layout"
      aria-label="AI Copilot conversation workspace"
    >
      <aside className="copilot-history" aria-label="Your saved conversations">
        <div className="copilot-history-heading">
          <h2>Conversations</h2>
          <button
            className="text-btn"
            disabled={busy}
            onClick={newConversation}
          >
            New <AppIcon name="spark" size={16} />
          </button>
        </div>
        <label className="copilot-search">
          Find a conversation
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved titles"
          />
        </label>
        <nav aria-label="Conversation history">
          {filtered.map((t) => (
            <button
              key={t.id}
              className={conversationId === t.id ? "selected" : ""}
              disabled={busy}
              onClick={() => run(() => selectThread(t.id))}
            >
              <AppIcon name="Chat review" size={17} />
              <span>
                {t.title}
                <small>{new Date(t.updated_at).toLocaleDateString()}</small>
              </span>
            </button>
          ))}
        </nav>
        {!filtered.length && (
          <p className="copilot-history-empty">
            Your next conversation starts here. Saved chats will appear in this
            list.
          </p>
        )}
        <p className="copilot-memory-label">
          <AppIcon name="lock" size={14} />
          {connected ? "Private account history" : "Saved in this browser"}
        </p>
      </aside>
      <div className="copilot-main">
        <header className="copilot-header">
          <div>
            <h2>Keep the conversation going.</h2>
            <p>
              {connected
                ? "Pick up a saved conversation. Gemini recalls recent context and checks fresh business facts."
                : "Explore calculated demo answers. Connect Gemini and Supabase for AI follow-ups across visits."}
            </p>
          </div>
          {conversationId && (
            <button
              className="text-btn"
              disabled={busy}
              onClick={() => setConfirmDelete(!confirmDelete)}
            >
              Delete conversation
            </button>
          )}
        </header>
        {confirmDelete && (
          <div className="copilot-delete-confirm">
            <p>
              Delete this saved conversation? Business records, imported chats
              and PDFs stay in place.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => run(removeConversation)}
            >
              Delete this conversation
            </button>
            <button
              className="text-btn"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              Keep conversation
            </button>
          </div>
        )}
        <div
          ref={transcriptRef}
          className="copilot-messages"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {!messages.length ? (
            <div className="copilot-empty">
              <span>
                <AppIcon name="spark" size={32} />
              </span>
              <h3>A little context goes a long way.</h3>
              <p>
                Ask about a balance, a stock decision or a commitment in your
                imported conversations.
              </p>
              <div className="copilot-starters">
                {[
                  "Show overdue payments",
                  connected
                    ? "Which products need attention?"
                    : "Highest outstanding balance",
                  connected
                    ? "What did the customer promise?"
                    : "Which promises were missed?",
                ].map((prompt) => (
                  <button
                    className="secondary"
                    key={prompt}
                    onClick={() => {
                      setQuestion(prompt);
                      setTask("ask");
                    }}
                  >
                    {prompt}
                    <AppIcon name="arrow" size={16} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <article key={m.id} className={`copilot-message ${m.role}`}>
                <div className="copilot-message-author">
                  <AppIcon
                    name={m.role === "assistant" ? "brand" : "Customers"}
                    size={17}
                  />
                  <strong>{m.role === "assistant" ? "FlowChat" : "You"}</strong>
                  <time dateTime={m.created_at}>
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p>{m.content}</p>
                {m.role === "assistant" && m.facts !== undefined && (
                  <details>
                    <summary>View the evidence used for this answer</summary>
                    <pre className="integration-json">
                      {JSON.stringify(m.facts, null, 2)}
                    </pre>
                    <small>
                      These facts were captured when the answer was written. New
                      questions recheck the current ledger.
                    </small>
                  </details>
                )}
              </article>
            ))
          )}
        </div>
        {error && (
          <p role="alert" className="integration-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="copilot-notice">
            {notice}
          </p>
        )}
        {busy && (
          <p role="status" className="copilot-notice">
            Working on it…
          </p>
        )}
        <form
          className="copilot-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void run(send);
          }}
        >
          <label>
            What would you like to do?
            <select
              value={task}
              onChange={(e) => {
                setTask(e.target.value as "ask" | "reminder");
                setDraft("");
              }}
            >
              <option value="ask">Ask FlowChat</option>
              <option value="reminder">Draft a payment reminder</option>
            </select>
          </label>
          <label>
            {task === "ask" ? "Your question" : "Exact customer name"}
            <textarea
              maxLength={1000}
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                task === "ask"
                  ? "Ask a question, then follow up naturally…"
                  : "Customer name from your ledger"
              }
            />
          </label>
          <div className="copilot-composer-actions">
            <span>
              {connected
                ? "Recent messages provide context. Money is calculated in code."
                : "Offline synthetic/local data. No AI request."}
            </span>
            <button className="primary" disabled={busy || !question.trim()}>
              {task === "ask" ? "Ask FlowChat" : "Create draft"}
              <AppIcon name="arrow" size={18} />
            </button>
          </div>
        </form>
        {draft && (
          <section className="copilot-draft">
            <h3>Your reminder draft</h3>
            <label>
              Review the wording
              <textarea
                rows={5}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !draft.trim()}
              onClick={() => onReminder?.(draftParty, draft)}
            >
              Add to approval queue
            </button>
            <p>Nothing is sent automatically.</p>
          </section>
        )}
      </div>
    </section>
  );
}
