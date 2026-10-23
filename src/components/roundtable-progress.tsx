import styles from "./roundtables.module.css";
import { levelLabels } from "@/lib/roundtables";
export function RoundtableProgress({
  level,
  completed,
  large = false,
}: {
  level: keyof typeof levelLabels;
  completed: number;
  large?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={`${levelLabels[level]}: ${completed} of 16 lessons completed`}
      className={`${styles.ring} ${large ? styles.largeRing : ""}`}
      style={{
        background: `conic-gradient(var(--primary) ${(completed / 16) * 100}%, var(--muted) 0)`,
      }}
    >
      <span aria-hidden="true">{completed}</span>
    </div>
  );
}
