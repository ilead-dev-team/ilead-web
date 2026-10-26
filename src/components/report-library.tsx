"use client";
import styles from "./reports.module.css";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { metadata, sectionKindLabels } from "@/lib/configuration";
import { librarySection, newReportSection } from "@/lib/report-library";
import type { ReportSection } from "@/lib/reports";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Feedback, Pending } from "./account/feedback";
export function ReportLibrary({
  sections,
  disabled,
  add,
}: {
  sections: ReportSection[];
  disabled: boolean;
  add: (section: ReportSection) => void;
}) {
  const user = useSession();
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [
      "configuration",
      "sections",
      user.id,
      user.role,
      "report-library",
      page,
    ],
    enabled: open && user.role === "COORDINATOR",
    queryFn: async () => {
      const result = z
        .object({ data: z.array(librarySection), meta: metadata })
        .parse(
          await api(
            `/section-templates?isArchived=false&page=${page}&pageSize=20`,
          ),
        );
      if (result.data.some((item) => item.isArchived))
        throw new Error("Unavailable section returned");
      return result;
    },
  });
  return (
    <section
      aria-labelledby="report-library-heading"
      className={`${styles.panel} grid gap-4`}
    >
      <h2 id="report-library-heading">Add from section library</h2>
      <p>
        Choose a section structure, then write its content and save the report.
        Each library section can appear once.
      </p>
      {!open ? (
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          Browse section library
        </Button>
      ) : (
        <>
          <Pending active={query.isPending} />
          <Feedback error={query.error} />
          {query.isError && (
            <Button variant="outline" onClick={() => query.refetch()}>
              Retry section library
            </Button>
          )}
          {query.data && (
            <>
              <ul className="compact-records">
                {query.data.data.length ? (
                  query.data.data.map((template) => {
                    const used = sections.some(
                      (item) => item.key === template.key,
                    );
                    return (
                      <li
                        key={template.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"
                      >
                        <span>
                          {template.title} · {sectionKindLabels[template.kind]}
                          {used
                            ? " · Already included"
                            : template.isMandatory
                              ? " · Mandatory section"
                              : ""}
                        </span>
                        <Button
                          variant="outline"
                          aria-label={`Add library section ${template.title}`}
                          disabled={
                            disabled ||
                            used ||
                            template.isMandatory ||
                            template.autoSource === "PROGRESS" ||
                            sections.length >= 30
                          }
                          onClick={() =>
                            add(
                              newReportSection(
                                template.title,
                                template.kind,
                                sections.length + 1,
                                template,
                              ),
                            )
                          }
                        >
                          Add section
                        </Button>
                      </li>
                    );
                  })
                ) : (
                  <li>No available library sections.</li>
                )}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={disabled || query.isFetching || page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous library sections
                </Button>
                <p>
                  Library page {page} of{" "}
                  {Math.max(1, query.data.meta.totalPages)}
                </p>
                <Button
                  variant="outline"
                  disabled={
                    disabled ||
                    query.isFetching ||
                    page >= query.data.meta.totalPages
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next library sections
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
