import styles from "./roundtables.module.css";
import { levelLabels } from "@/lib/roundtables";
export function RoundtableProgress({
  level,
  latestLesson,
  large = false,
}: {
  level: keyof typeof levelLabels;
  latestLesson: number;
  large?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        role="img"
        aria-label={`${levelLabels[level]}: latest completed lesson ${latestLesson} of 16`}
        className={`${styles.ring} ${large ? styles.largeRing : ""}`}
        style={{
          background: `conic-gradient(var(--primary) ${(latestLesson / 16) * 100}%, var(--muted) 0)`,
        }}
      >
        <span aria-hidden="true">{latestLesson}</span>
      </div>
      <span className="text-xs text-muted-foreground">Latest lesson</span>
    </div>
  );
}
