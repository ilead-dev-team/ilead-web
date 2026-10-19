import type { ReportSection } from "@/lib/reports";
export function ReportContent({
  sections,
  context,
}: {
  sections: ReportSection[];
  context?: string;
}) {
  return (
    <div className="my-5 grid gap-6">
      {sections.map((section) => (
        <section key={section.id} className="min-w-0 break-words">
          <h3 className="mb-3 font-semibold">{section.title}</h3>
          {section.kind === "TEXT" ? (
            <p className="whitespace-pre-wrap">
              {section.content.text || "No content."}
            </p>
          ) : section.kind === "BULLETS" ? (
            <ul className="list-inside list-disc space-y-2">
              {section.content.items.map((item, index) => (
                <li key={index}>
                  {item.lead && <strong>{item.lead}: </strong>}
                  {item.text}
                </li>
              ))}
            </ul>
          ) : (
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={`${context ? `${context} · ` : ""}${section.title} table`}
            >
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {section.content.columns.map((column, index) => (
                      <th
                        className="border border-border p-2"
                        scope="col"
                        key={index}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.content.rows.map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, cellIndex) => (
                        <td
                          className="border border-border p-2"
                          key={cellIndex}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {section.content.rows.length === 0 && <p>No rows recorded.</p>}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
