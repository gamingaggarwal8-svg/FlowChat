import { AppIcon } from "./ui";
import WorkflowMap from "./WorkflowMap";
import type { Page } from "./Demo";
export default function OverviewWelcome({
  onOpen,
}: {
  onOpen: (page: Page) => void;
}) {
  return (
    <section
      className="overview-welcome"
      aria-label="Your business at a glance"
    >
      <div className="welcome-story">
        <div>
          <h2>
            Less chasing.
            <br />
            <span>More clarity.</span>
          </h2>
          <p>
            Conversations, stock and your next move—brought together, so you can
            get on with business.
          </p>
        </div>
        <div className="welcome-actions">
          <button className="primary" onClick={() => onOpen("AI Copilot")}>
            Ask FlowChat <AppIcon name="spark" size={18} />
          </button>
          <button
            className="welcome-text-action"
            onClick={() => onOpen("Import Chats")}
          >
            Bring in a conversation <AppIcon name="arrow" size={18} />
          </button>
        </div>
      </div>
      <WorkflowMap onOpen={onOpen} />
      <a className="welcome-scroll" href="#business-details">
        <span>Explore the numbers behind the day</span>
        <AppIcon name="down" size={20} />
      </a>
    </section>
  );
}
