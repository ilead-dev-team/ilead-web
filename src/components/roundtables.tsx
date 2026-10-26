"use client";
import Link from "next/link";
import styles from "./roundtables.module.css";
import { RoundtableProgress } from "./roundtable-progress";
import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  readRoundtablePage,
  readRoundtableDetail,
  progressResponse,
  levelLabels,
} from "@/lib/roundtables";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";
import {
  DetailsEditor,
  Lifecycle,
  RoundtableRefresh,
  useRoundtableViews,
} from "./roundtable-actions";

export function RoundtableList({ trash = false }: { trash?: boolean }) {
  const user = useSession();
  const views = useRoundtableViews();
  const heading = useRef<HTMLHeadingElement>(null);
  const focusFallback = useCallback(() => heading.current?.focus(), []);
  const [notice, setNotice] = useState<string>();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("ACTIVE"),
    [level, setLevel] = useState(""),
    [classYear, setClassYear] = useState(""),
    [sort, setSort] = useState("name:asc");
  const query = useQuery({
    queryKey: [
      "roundtables",
      "list",
      user.id,
      user.role,
      trash,
      page,
      q,
      status,
      level,
      classYear,
      sort,
    ],
    enabled:
      user.role !== "FACILITATOR" && (!trash || user.role === "COORDINATOR"),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        sort,
      });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (level) params.set("level", level);
      if (classYear) params.set("classYear", classYear);
      return readRoundtablePage(
        await api(`/roundtables${trash ? "/trash" : ""}?${params}`),
        page,
        trash,
      );
    },
  });
  return (
    <section className={styles.page}>
      <h1 ref={heading} tabIndex={-1}>
        {trash ? "Roundtable trash" : "Roundtables"}
      </h1>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <RoundtableRefresh views={views} />

      {user.role === "COORDINATOR" && (
        <Button asChild variant="outline">
          <Link href={trash ? "/roundtables" : "/roundtables/trash"}>
            {trash ? "Back to roundtables" : "View trash"}
          </Link>
        </Button>
      )}
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <div className="min-w-0 flex-1">
          <Field id="rt-search" label="Search name or slogan">
            <Input
              id="rt-search"
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
        <Button>Search</Button>
      </form>
      <div className={styles.filters}>
        <Field id="rt-status" label="Status">
          <Select
            id="rt-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {trash && <option value="">All</option>}
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </Select>
        </Field>
        <Field id="rt-level" label="Level">
          <Select
            id="rt-level"
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All levels</option>
            {Object.entries(levelLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="rt-filter-class" label="Class">
          <Select
            id="rt-filter-class"
            value={classYear}
            onChange={(e) => {
              setClassYear(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All classes</option>
            {["YEAR_1", "YEAR_2", "YEAR_3"].map((value, i) => (
              <option key={value} value={value}>
                Year {i + 1}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="rt-sort" label="Sort">
          <Select
            id="rt-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="name:asc">Name A–Z</option>
            <option value="name:desc">Name Z–A</option>
            <option value="enrolledAt:desc">Newest first</option>
            <option value="enrolledAt:asc">Oldest first</option>
          </Select>
        </Field>
      </div>
      <Pending active={query.isFetching} />
      <Feedback error={query.error} />
      {query.isError && (
        <Button disabled={query.isFetching} onClick={() => query.refetch()}>
          Try again
        </Button>
      )}
      {query.isError && query.data && (
        <p className="notice">
          Showing the last loaded list. Refresh before changing a roundtable.
        </p>
      )}
      {query.data && (
        <>
          {query.data.data.length ? (
            <div
              className={styles.tableViewport}
              role="region"
              aria-label="Roundtables list"
              tabIndex={0}
            >
              <table className={styles.table}>
                <caption className="sr-only">
                  {trash ? "Trashed roundtables" : "Roundtables"} ·{" "}
                  {query.data.meta.total} total
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Roundtable</th>
                    <th scope="col">Class</th>
                    <th scope="col">Current level</th>
                    <th scope="col">Facilitator</th>
                    <th scope="col">Status</th>
                    {user.role === "COORDINATOR" && (
                      <th scope="col">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className={styles.tableIdentity}>
                          <div>
                            <h2>
                              {trash ? (
                                row.name
                              ) : (
                                <Link href={`/roundtables/${row.id}`}>
                                  {row.name}
                                </Link>
                              )}
                            </h2>
                            <p>
                              {row.lastLesson
                                ? `Lesson ${row.lastLesson.number}: ${row.lastLesson.title}`
                                : "No lesson completed yet"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {row.classYear === "YEAR_1"
                          ? "Year 1"
                          : row.classYear === "YEAR_2"
                            ? "Year 2"
                            : "Year 3"}
                      </td>
                      <td>
                        <span className={styles.badge}>
                          {levelLabels[row.currentLevel]}
                        </span>
                      </td>
                      <td>{row.facilitator?.name ?? "Detached"}</td>
                      <td>
                        <span className={styles.badge}>
                          {row.status === "COMPLETED" ? "Completed" : "Active"}
                        </span>
                      </td>
                      {user.role === "COORDINATOR" && (
                        <td>
                          {" "}
                          {user.role === "COORDINATOR" && (
                            <Lifecycle
                              row={row}
                              trash={trash}
                              blocked={
                                query.isError ||
                                query.isFetching ||
                                views.isPending
                              }
                              focusFallback={focusFallback}
                              onSaved={async (message) => {
                                if (message) setNotice(message);
                                await views.mutateAsync().catch(() => {});
                              }}
                              onCheck={async () => {
                                await query.refetch({ throwOnError: true });
                                setNotice(
                                  "Roundtables refreshed. Inspect the live and trash views; a missing row alone does not confirm the earlier action.",
                                );
                                focusFallback();
                              }}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              <h2>No matching roundtables.</h2>
              <p>Try another name, class, level or status.</p>
            </div>
          )}
        </>
      )}
      {(query.data || page > 1) && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <p>
            Page {page}
            {query.data && !query.isError
              ? ` of ${Math.max(1, query.data.meta.totalPages)}`
              : ""}
          </p>
          <Button
            variant="outline"
            disabled={
              !query.data ||
              query.isError ||
              page >= query.data.meta.totalPages ||
              query.isFetching
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
export function RoundtableDetail({
  id,
  own = false,
}: {
  id?: string;
  own?: boolean;
}) {
  const user = useSession(),
    target = own ? user.roundtableId : id;
  const views = useRoundtableViews();
  const [level, setLevel] = useState("ICHOOSE");
  const [showAllLessons, setShowAllLessons] = useState(false);
  const details = useQuery({
    queryKey: ["roundtables", "detail", user.id, user.role, target],
    enabled: !!target,
    queryFn: async () => {
      if (!target) throw new Error("Roundtable unavailable");
      return readRoundtableDetail(
        await api(`/roundtables/${target}`),
        target,
        own ? user.id : undefined,
      );
    },
  });
  const progress = useQuery({
    queryKey: ["roundtables", "progress", user.id, user.role, target],
    enabled: !!target && !!details.data && !details.isError,
    queryFn: async () =>
      progressResponse.parse(await api(`/roundtables/${target}/progress`)),
  });
  const row = details.data?.data;
  const completedLessons =
    progress.data?.data.completed.filter((item) => item.level === level) ?? [];
  return (
    <section className={own ? styles.ownPage : styles.page}>
      <h1>{own ? "My roundtable" : "Roundtable details"}</h1>
      <RoundtableRefresh views={views} />
      <Pending active={details.isFetching} />
      <Feedback error={details.error} />
      {details.isError && (
        <Button onClick={() => details.refetch()}>Try again</Button>
      )}
      {details.isError && row && (
        <p className="notice">
          Showing the last loaded details. Refresh before editing.
        </p>
      )}
      {row && (
        <>
          <section
            className={styles.summary}
            aria-label="Roundtable progress summary"
          >
            <div className={styles.identity}>
              <RoundtableProgress
                level={row.currentLevel}
                latestLesson={row.lastLesson?.number ?? 0}
                large
              />
              <div>
                <p className={styles.eyebrow}>
                  {row.classYear === "YEAR_1"
                    ? "Year 1"
                    : row.classYear === "YEAR_2"
                      ? "Year 2"
                      : "Year 3"}{" "}
                  / {levelLabels[row.currentLevel]}
                </p>
                <h2>{row.name}</h2>
                <p>{row.slogan}</p>
                <span className={styles.badge}>
                  {row.status === "COMPLETED" ? "Program completed" : "Active"}
                </span>
              </div>
            </div>
            <div className={styles.lessonGrid}>
              <p className={styles.lessonPanel}>
                Last completed:{" "}
                {row.lastLesson
                  ? `${row.lastLesson.number}. ${row.lastLesson.title}`
                  : "No lesson completed yet."}
              </p>
              <p className={styles.lessonPanel}>
                Next lesson:{" "}
                {row.nextLesson
                  ? `${levelLabels[row.nextLesson.level]} ${row.nextLesson.number}. ${row.nextLesson.title}`
                  : "Program complete."}
              </p>
            </div>
            <p className={styles.attendanceSummary}>
              Attendance: {row.attendance.met} met · {row.attendance.didNotMeet}{" "}
              did not meet
            </p>
          </section>
          <div className={styles.historyGrid}>
            <section className={styles.panel}>
              <h2>Completed lessons</h2>
              <Field id="history-level" label="History level">
                <Select
                  id="history-level"
                  value={level}
                  onChange={(e) => {
                    setLevel(e.target.value);
                    setShowAllLessons(false);
                  }}
                >
                  {Object.entries(levelLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Pending active={progress.isPending} />
              <Feedback error={progress.error} />
              {progress.isError && (
                <Button onClick={() => progress.refetch()}>
                  Retry progress
                </Button>
              )}
              {progress.data && (
                <ul id="completed-lessons-list" className="my-4 grid gap-3">
                  {completedLessons.length ? (
                    completedLessons
                      .slice(0, showAllLessons ? undefined : 3)
                      .map((item) => (
                        <li
                          className="border-b border-border pb-3"
                          key={item.lessonId}
                        >
                          {item.number}. {item.title} ·{" "}
                          {item.source === "ENROLLMENT_BASELINE"
                            ? "Before registration"
                            : (item.completedOn ??
                              item.sessionDate ??
                              "Date unavailable")}
                        </li>
                      ))
                  ) : (
                    <li>No completed lessons at this level.</li>
                  )}
                </ul>
              )}
              {progress.data && completedLessons.length > 3 && (
                <Button
                  variant="ghost"
                  aria-expanded={showAllLessons}
                  aria-controls="completed-lessons-list"
                  onClick={() => setShowAllLessons((expanded) => !expanded)}
                >
                  {showAllLessons
                    ? "View less"
                    : `View more (${completedLessons.length - 3} more)`}
                </Button>
              )}
            </section>
            <section className={styles.panel}>
              <h2>Attendance history</h2>
              <ul className="my-4 grid gap-2">
                {row.attendance.history.length ? (
                  row.attendance.history.map((item) => (
                    <li key={item.entryId}>
                      {item.sessionDate ?? "Date unavailable"} ·{" "}
                      {item.met ? "Met" : "Did not meet"} ·{" "}
                      {item.status === "CANCELLED"
                        ? "Cancelled session"
                        : "Held session"}
                    </li>
                  ))
                ) : (
                  <li>No session entries yet.</li>
                )}
              </ul>
            </section>
          </div>
          {user.role !== "SPONSOR" && (
            <DetailsEditor
              key={row.id}
              row={row}
              blocked={details.isError || details.isFetching || views.isPending}
              onSaved={async () => {
                await views.mutateAsync().catch(() => {});
              }}
            />
          )}
          {own && (
            <Link className={styles.issueLink} href="/issues">
              Raise or follow an issue
            </Link>
          )}
        </>
      )}
    </section>
  );
}
