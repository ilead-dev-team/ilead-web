"use client";
import type { ReportSection } from "@/lib/reports";
import { Field, Input } from "./ui/field";
import { Button } from "./ui/button";
import { ReportContent } from "./report-content";
const area = "min-h-28 w-full rounded-lg border border-input bg-background p-3";
export function ReportSectionEditor({
  section,
  change,
  disabled,
}: {
  section: ReportSection;
  change: (section: ReportSection) => void;
  disabled: boolean;
}) {
  if (section.autoSource === "PROGRESS")
    return (
      <>
        <p>
          Progress rows are read-only. Correct session entries, save other
          edits, then refresh this section from session data.
        </p>
        <ReportContent sections={[section]} />
      </>
    );
  return (
    <fieldset disabled={disabled} className="grid gap-3">
      <legend className="sr-only">{section.title} content</legend>
      {section.key === null && (
        <Field id={`title-${section.id}`} label="Custom section title">
          <Input
            id={`title-${section.id}`}
            maxLength={120}
            value={section.title}
            onChange={(event) =>
              change({ ...section, title: event.target.value })
            }
          />
        </Field>
      )}
      {section.kind === "TEXT" && (
        <Field id={`text-${section.id}`} label={`${section.title} text`}>
          <textarea
            id={`text-${section.id}`}
            className={area}
            maxLength={20000}
            value={section.content.text}
            onChange={(event) =>
              change({ ...section, content: { text: event.target.value } })
            }
          />
        </Field>
      )}
      {section.kind === "BULLETS" && (
        <>
          {section.content.items.map((item, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg border border-border p-3"
            >
              <Field
                id={`lead-${section.id}-${index}`}
                label={`Bullet ${index + 1} lead-in`}
              >
                <Input
                  id={`lead-${section.id}-${index}`}
                  maxLength={200}
                  value={item.lead ?? ""}
                  onChange={(event) =>
                    change({
                      ...section,
                      content: {
                        items: section.content.items.map((current, i) =>
                          i === index
                            ? { ...current, lead: event.target.value }
                            : current,
                        ),
                      },
                    })
                  }
                />
              </Field>
              <Field
                id={`bullet-${section.id}-${index}`}
                label={`Bullet ${index + 1} text`}
              >
                <textarea
                  id={`bullet-${section.id}-${index}`}
                  className={area}
                  maxLength={4000}
                  value={item.text}
                  onChange={(event) =>
                    change({
                      ...section,
                      content: {
                        items: section.content.items.map((current, i) =>
                          i === index
                            ? { ...current, text: event.target.value }
                            : current,
                        ),
                      },
                    })
                  }
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  change({
                    ...section,
                    content: {
                      items: section.content.items.filter(
                        (_, i) => i !== index,
                      ),
                    },
                  })
                }
              >
                Remove bullet {index + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={disabled || section.content.items.length >= 100}
            onClick={() =>
              change({
                ...section,
                content: { items: [...section.content.items, { text: "" }] },
              })
            }
          >
            Add bullet
          </Button>
        </>
      )}
      {section.kind === "TABLE" && (
        <>
          <p>Custom tables support up to eight columns and 500 rows.</p>
          {section.content.columns.map((column, index) => (
            <Field
              key={index}
              id={`column-${section.id}-${index}`}
              label={`Column ${index + 1} heading`}
            >
              <Input
                id={`column-${section.id}-${index}`}
                maxLength={200}
                value={column}
                onChange={(event) =>
                  change({
                    ...section,
                    content: {
                      ...section.content,
                      columns: section.content.columns.map((current, i) =>
                        i === index ? event.target.value : current,
                      ),
                    },
                  })
                }
              />
            </Field>
          ))}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={section.content.columns.length >= 8}
              onClick={() =>
                change({
                  ...section,
                  content: {
                    columns: [...section.content.columns, "Column"],
                    rows: section.content.rows.map((row) => [...row, ""]),
                  },
                })
              }
            >
              Add column
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={section.content.columns.length <= 1}
              onClick={() =>
                change({
                  ...section,
                  content: {
                    columns: section.content.columns.slice(0, -1),
                    rows: section.content.rows.map((row) => row.slice(0, -1)),
                  },
                })
              }
            >
              Remove last column
            </Button>
          </div>
          {section.content.rows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="grid gap-3 rounded-lg border border-border p-3"
            >
              {row.map((cell, cellIndex) => (
                <Field
                  key={cellIndex}
                  id={`cell-${section.id}-${rowIndex}-${cellIndex}`}
                  label={`Row ${rowIndex + 1}, ${section.content.columns[cellIndex] || `column ${cellIndex + 1}`}`}
                >
                  <Input
                    id={`cell-${section.id}-${rowIndex}-${cellIndex}`}
                    maxLength={4000}
                    value={cell}
                    onChange={(event) =>
                      change({
                        ...section,
                        content: {
                          ...section.content,
                          rows: section.content.rows.map((current, i) =>
                            i === rowIndex
                              ? current.map((value, j) =>
                                  j === cellIndex ? event.target.value : value,
                                )
                              : current,
                          ),
                        },
                      })
                    }
                  />
                </Field>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  change({
                    ...section,
                    content: {
                      ...section.content,
                      rows: section.content.rows.filter(
                        (_, i) => i !== rowIndex,
                      ),
                    },
                  })
                }
              >
                Remove row {rowIndex + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={section.content.rows.length >= 500}
            onClick={() =>
              change({
                ...section,
                content: {
                  ...section.content,
                  rows: [
                    ...section.content.rows,
                    section.content.columns.map(() => ""),
                  ],
                },
              })
            }
          >
            Add row
          </Button>
        </>
      )}
    </fieldset>
  );
}
