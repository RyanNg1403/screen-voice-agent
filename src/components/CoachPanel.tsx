import { useEffect, useRef, useState } from "react";
import type { TranscriptEntry } from "../hooks/useRealtime";

type AgentState = "idle" | "listening" | "thinking" | "speaking";
type Status = "disconnected" | "connecting" | "connected";

interface CoachPanelProps {
  status: Status;
  agentState: AgentState;
  awaitingWake: boolean;
  screenTarget: string | null;
  /** True when continuous screen observation is actually on (durable), as
   *  opposed to screenTarget which is a brief last-captured-app toast. */
  watching: boolean;
  transcript: TranscriptEntry[];
  onSend: (text: string) => void;
  onWake: () => void;
}

// The lightweight controls from FR-3. Each maps to a learner intent and is
// rendered as plain text into the session, so they work with today's agent
// and with the future tutor decision engine without changes here.
const PROMPTS = {
  done: "I think I've finished this step. Check what I did and tell me what's next.",
  stuck: "I'm stuck on the current step. Help me move forward.",
  why: "Why is this the right next step?",
  hint: "Give me another, more specific hint.",
} as const;

export function CoachPanel({
  status,
  agentState,
  awaitingWake,
  screenTarget,
  watching,
  transcript,
  onSend,
  onWake,
}: CoachPanelProps) {
  const [draft, setDraft] = useState("");
  const stepRef = useRef<HTMLDivElement>(null);

  const connected = status === "connected";
  const active = connected && !awaitingWake;

  const latestAssistant = [...transcript]
    .reverse()
    .find((e) => e.role === "assistant");
  const stepText = latestAssistant?.text ?? "";

  // Keep the newest guidance scrolled into view as it streams in.
  useEffect(() => {
    const el = stepRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [stepText]);

  // Resolve the panel's state once — it drives the eyebrow label, the spine
  // colour, and which body copy shows. Order matters: a pending decision
  // outranks everything, then sleep/offline, then live activity.
  let state: "offline" | "asleep" | "thinking" | "active" | "ready";
  if (!connected) state = "offline";
  else if (awaitingWake) state = "asleep";
  else if (agentState === "thinking") state = "thinking";
  else if (stepText) state = "active";
  else state = "ready";

  const eyebrow: Record<typeof state, string> = {
    offline: "Asleep",
    asleep: "Paused",
    thinking: "Thinking",
    active: "Next step",
    ready: "Ready",
  };

  const emptyCopy: Record<typeof state, string> = {
    offline: "Husky is asleep. Tap Start to begin.",
    asleep: "Paused. Tap Start whenever you want guidance.",
    thinking: "Looking at your screen and working out the next step…",
    ready: "Open Codex and tell me what you're building. I'll watch and point you to the next step.",
    active: "", // never rendered — the live step text shows instead
  };

  // While thinking we keep the prior step visible (with the thinking bar) so
  // the user still has context; only fall back to empty copy when there's none.
  const showStep = state === "active" || (state === "thinking" && !!stepText);
  // The persistent indicator reflects the durable observation mode, not the
  // transient capture toast. screenTarget only refines the label with the
  // app name when one was just captured.
  const observing = watching;
  const observeLabel = watching
    ? screenTarget
      ? `Watching ${screenTarget}`
      : "Watching your screen"
    : connected
      ? "On-demand — reads your screen when asked"
      : "Not observing";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="coach">
      <div className="coach-guidance" data-state={state}>
        <div className="coach-eyebrow">{eyebrow[state]}</div>
        {showStep ? (
          <div ref={stepRef} className="coach-step" key={stepText}>
            {stepText}
          </div>
        ) : (
          <div className="coach-step is-empty">{emptyCopy[state]}</div>
        )}
        {state === "thinking" && <div className="coach-thinking" aria-hidden="true" />}
      </div>

      {active ? (
        <div className="coach-controls">
          <button className="coach-btn coach-btn-primary" onClick={() => onSend(PROMPTS.done)}>
            Done
          </button>
          <button className="coach-btn" onClick={() => onSend(PROMPTS.stuck)}>
            I'm stuck
          </button>
          <button className="coach-btn" onClick={() => onSend(PROMPTS.why)}>
            Why?
          </button>
          <button className="coach-btn" onClick={() => onSend(PROMPTS.hint)}>
            Another hint
          </button>
        </div>
      ) : (
        <button className="coach-start" onClick={onWake}>
          <PawIcon /> Start Husky
        </button>
      )}

      <div className="coach-spacer" />

      <form className="coach-ask" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Ask Husky…" : "Start Husky to ask a question"}
          disabled={!connected}
          aria-label="Ask Husky a question"
        />
        <button type="submit" className="coach-send" disabled={!connected || !draft.trim()} aria-label="Send">
          <SendIcon />
        </button>
      </form>

      <div className="coach-observe" data-active={observing}>
        <span className="coach-dot" />
        <span>{observeLabel}</span>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function PawIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5.5" cy="11" r="1.8" />
      <circle cx="9.5" cy="6.5" r="1.9" />
      <circle cx="14.5" cy="6.5" r="1.9" />
      <circle cx="18.5" cy="11" r="1.8" />
      <path d="M12 11.5c-2.6 0-4.7 2-4.7 4.2 0 1.6 1.3 2.3 2.7 2.3.9 0 1.4-.4 2-.4s1.1.4 2 .4c1.4 0 2.7-.7 2.7-2.3 0-2.2-2.1-4.2-4.7-4.2Z" />
    </svg>
  );
}
