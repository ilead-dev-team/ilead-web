"use client";
import Image from "next/image";
import { useId, useState } from "react";
import {
  documentSections,
  documentState,
  formatReportDate,
  type DocumentReport,
} from "@/lib/report-document";
import type { ReportSection } from "@/lib/reports";
import styles from "./report-document.module.css";
export function ReportDocument({
  report,
  label = "Current report",
  workingSections,
  unsaved = false,
  historical = false,
}: {
  report: DocumentReport;
  label?: string;
  workingSections?: ReportSection[];
  unsaved?: boolean;
  historical?: boolean;
}) {
  const [actual, setActual] = useState(false);
  const control = useId();
  let sections: ReportSection[], date: string;
  try {
    sections = documentSections(
      workingSections ?? report.sections,
      !!workingSections,
    );
    date = formatReportDate(report.session.date);
  } catch {
    return (
      <p role="alert">
        Document preview unavailable: the report format is invalid. Reload the
        report before exporting.
      </p>
    );
  }
  return (
    <div className="my-5 min-w-0 space-y-3">
      {historical && (
        <p className="text-sm">
          Formatted with the current approved document style; the published
          content is unchanged.
        </p>
      )}
      {unsaved && (
        <p role="status">
          This preview includes unsaved edits. Save the report before
          downloading Word.
        </p>
      )}
      <label htmlFor={control} className="flex items-center gap-2 text-sm">
        <input
          id={control}
          type="checkbox"
          checked={actual}
          onChange={(e) => setActual(e.target.checked)}
        />
        Use A4 page width
      </label>
      <div
        role="region"
        aria-label={`${label} document preview`}
        tabIndex={0}
        className={styles.viewport}
      >
        <article
          aria-label={`${label} document`}
          className={`${styles.paper} ${actual ? styles.actual : ""}`}
        >
          <header className={styles.header}>
            <Image
              src="/report-assets/rca-shield.png"
              width={65}
              height={65}
              alt="Rwanda Coding Academy shield"
            />
            <p className={styles.academy}>RWANDA CODING ACADEMY</p>
            <p className={styles.program}>iLead Leadership Program</p>
            <h3>iLead Session Report</h3>
            <p className={styles.metadata}>
              {report.academicYear} · {report.term.name} · {date}
            </p>
            <p className={styles.metadata}>{documentState(report)}</p>
          </header>
          {sections.map((section, sectionIndex) => (
            <section key={section.id}>
              <h4>{section.title}</h4>
              {section.kind === "TEXT" ? (
                section.content.text
                  .split("\n")
                  .map((line, i) => <p key={i}>{line || <br />}</p>)
              ) : section.kind === "BULLETS" ? (
                <ul>
                  {section.content.items.map((item, i) => (
                    <li key={i}>
                      {item.lead && <strong>{item.lead}: </strong>}
                      {item.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className={styles.tableViewport}
                  role="region"
                  tabIndex={0}
                  aria-label={`${label} · ${section.title} table, section ${sectionIndex + 1}`}
                >
                  <table
                    className={
                      section.key === "progress" ? styles.progress : ""
                    }
                  >
                    <colgroup>
                      {section.content.columns.map((_, i) => (
                        <col
                          key={i}
                          style={{
                            width:
                              section.key === "progress"
                                ? ["24%", "12%", "48%", "16%"][i]
                                : `${100 / section.content.columns.length}%`,
                          }}
                        />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {section.content.columns.map((column, i) => (
                          <th scope="col" key={i}>
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.content.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
