import {
  COMPETENCIES,
  formatLearningStage,
  type LessonState,
} from "../lib/tutor-types";

interface ProgressViewProps {
  lessonState: LessonState;
}

export function ProgressView({ lessonState }: ProgressViewProps) {
  const demonstrated = COMPETENCIES.filter(
    ({ id }) => lessonState.competencies[id] === "demonstrated",
  ).length;
  const attempted = COMPETENCIES.filter(
    ({ id }) => lessonState.competencies[id] !== "unseen",
  ).length;

  return (
    <section className="tutor-progress" aria-label="Learning progress">
      <div className="tutor-progress-main">
        <span className="tutor-progress-kicker">Stage</span>
        <strong>{formatLearningStage(lessonState.stage)}</strong>
      </div>
      <div className="tutor-progress-metrics" aria-label="Session counters">
        <span title="Skills touched this session">{attempted}/{COMPETENCIES.length}</span>
        <span title="Skills demonstrated">{demonstrated} done</span>
        <span title="Hints used">{lessonState.hintsUsed} hints</span>
        <span title="Proactive nudges">{lessonState.interventions} nudges</span>
      </div>
      <div className="tutor-progress-skills">
        {COMPETENCIES.map(({ id, label }) => (
          <span
            key={id}
            className="tutor-progress-skill"
            data-status={lessonState.competencies[id]}
            title={label}
            aria-label={`${label}: ${lessonState.competencies[id]}`}
          />
        ))}
      </div>
    </section>
  );
}
