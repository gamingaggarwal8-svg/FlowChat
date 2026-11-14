import { AppIcon } from "./ui";
import type { Page } from "./Demo";
const destinations: [Page, string, string, string][] = [
  [
    "Import Chats",
    "Conversations",
    "Keep the original context.",
    "conversation",
  ],
  [
    "Inventory & growth",
    "Stock & orders",
    "See what needs attention.",
    "stock",
  ],
  ["Suppliers", "Suppliers", "Keep the next delivery in view.", "supplier"],
  [
    "Accounting & Documents",
    "Documents",
    "Keep the evidence close.",
    "document",
  ],
];
export default function WorkflowMap({
  onOpen,
  compact = false,
}: {
  onOpen?: (page: Page) => void;
  compact?: boolean;
}) {
  return (
    <figure
      className={`workflow-map ${compact ? "workflow-map-compact" : ""}`}
      aria-label="Conversations connect to stock, suppliers and accounting documents"
    >
      <svg
        className="workflow-connections"
        viewBox="0 0 840 440"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M230 220H340Q365 220 365 195V113Q365 95 390 95H720 M365 220V325Q365 345 390 345H720" />
        <path
          className="workflow-route"
          d="M230 220H340Q365 220 365 195V113Q365 95 390 95H720"
        />
      </svg>
      <div className="workflow-source">
        <span className="workflow-source-mark">
          <AppIcon name="Chat review" size={30} />
        </span>
        <p>
          It starts with
          <br />
          <strong>a conversation.</strong>
        </p>
        <div className="workflow-message">
          <span />
          <span />
          <span />
        </div>
        <small>Bring the next step into focus.</small>
      </div>
      <div className="workflow-destinations">
        {destinations.map(([page, title, description, color]) => {
          const body = (
            <>
              <span className={`workflow-node-icon ${color}`}>
                <AppIcon name={page} size={24} />
              </span>
              <strong>{title}</strong>
              <span>{description}</span>
              {onOpen && <AppIcon name="arrow" size={17} />}
            </>
          );
          return onOpen ? (
            <button
              className={`workflow-node ${color}`}
              key={page}
              onClick={() => onOpen(page)}
            >
              {body}
            </button>
          ) : (
            <div className={`workflow-node ${color}`} key={page}>
              {body}
            </div>
          );
        })}
      </div>
      <figcaption>One connected view of the trading day.</figcaption>
    </figure>
  );
}
