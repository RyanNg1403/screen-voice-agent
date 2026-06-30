import type { SessionReportData } from "../hooks/useLessonState";

interface SessionReportProps {
  report: SessionReportData;
  onDismiss: () => void;
}

export function SessionReport({ report, onDismiss }: SessionReportProps) {
  const stageLabel = report.stage
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");

  return (
    <aside className="session-report" role="dialog" aria-label="Session report">
      <div className="session-report-header">
        <div>
          <span className="session-report-kicker">Session report</span>
          <h2>{stageLabel}</h2>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss session report">
          <CloseIcon />
        </button>
      </div>

      <p className="session-report-outcome">{report.outcome}</p>

      <dl className="session-report-stats">
        <div>
          <dt>Time</dt>
          <dd>{report.durationLabel}</dd>
        </div>
        <div>
          <dt>Hints</dt>
          <dd>{report.hintsNeeded}</dd>
        </div>
        <div>
          <dt>Nudges</dt>
          <dd>{report.interventions}</dd>
        </div>
      </dl>

      <div className="session-report-section">
        <h3>Skills</h3>
        <p>
          {report.skillsDemonstrated.length > 0
            ? report.skillsDemonstrated.join(", ")
            : "No skill was marked demonstrated yet."}
        </p>
      </div>

      <div className="session-report-section">
        <h3>Concepts</h3>
        <p>{report.conceptsEncountered.join(", ")}</p>
      </div>

      <div className="session-report-section">
        <h3>Principle</h3>
        <p>{report.transferablePrinciple}</p>
      </div>

      <div className="session-report-section">
        <h3>Next focus</h3>
        <p>{report.nextFocus}</p>
      </div>
    </aside>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
