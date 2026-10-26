"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  FileText,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { loadAcademicYears } from "@/lib/academic";
import { roundtablePage, levelLabels } from "@/lib/roundtables";
import {
  chartGradient,
  dashboardFilters,
  emptyFilters,
  exportKinds,
  exportLabels,
  exportPath,
  filterQuery,
  parseFilters,
  parseSummary,
  statusLabels,
  validateXlsx,
  type DashboardFilters,
  type FilterDraft,
  type ExportKind,
  type DashboardSummary,
} from "@/lib/dashboard";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";
import styles from "./dashboard.module.css";
import { Reminders } from "./notifications";
const classes: Record<string, string> = {
  YEAR_1: "Year 1",
  YEAR_2: "Year 2",
  YEAR_3: "Year 3",
};
function Pie({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; value: number }[];
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <section className={styles.panel} aria-label={title}>
      <h2>{title}</h2>
      {total === 0 ? (
        <p className="text-muted-foreground">No data for this selection.</p>
      ) : (
        <div className={styles.chart}>
          <div
            aria-hidden="true"
            className={styles.donut}
            style={{ background: chartGradient(rows.map((row) => row.value)) }}
          >
            <span className={styles.donutLabel}>
              <strong>{total}</strong>
              <span>Total</span>
            </span>
          </div>
          <dl className="grid min-w-0 gap-3">
            {rows.map((row, index) => (
              <div key={row.key} className="flex justify-between gap-4">
                <dt className="min-w-0 break-words">
                  <span
                    aria-hidden="true"
                    className={styles.swatch}
                    style={{ background: `var(--chart-${index + 1})` }}
                  />
                  {row.label}
                </dt>
                <dd className="font-semibold">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
function ExportControls({
  filters,
  blocked,
}: {
  filters: DashboardFilters;
  blocked: boolean;
}) {
  const [kind, setKind] = useState<ExportKind>("roundtables"),
    [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const download = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      active.current = controller;
      let type: string | null = null;
      const blob = await api<Blob>(exportPath(kind, filters), {
        responseType: "blob",
        signal: controller.signal,
        onResponse: (response) => {
          type = response.headers.get("content-type");
        },
      });
      await validateXlsx(blob, type);
      if (controller.signal.aborted) throw new Error("Download cancelled");
      return { blob, kind };
    },
    onSuccess: ({ blob, kind }) => {
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `iLead_${kind}.xlsx`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`${exportLabels[kind]} download started.`);
    },
  });
  return (
    <section className={styles.panel} aria-label="Excel downloads">
      <h2>Excel downloads</h2>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field id="export-kind" label="Download">
          <Select
            id="export-kind"
            value={kind}
            disabled={download.isPending}
            onChange={(e) => {
              setKind(e.target.value as ExportKind);
              setNotice("");
              download.reset();
            }}
          >
            {exportKinds.map((k) => (
              <option key={k} value={k}>
                {exportLabels[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          className="mb-5"
          disabled={blocked || download.isPending}
          onClick={() => {
            setNotice("");
            download.reset();
            download.mutate();
          }}
        >
          Download Excel
        </Button>
      </div>
      <Pending active={download.isPending} />
      <Feedback error={download.error} />
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
function SummaryCards({
  data,
  role,
}: {
  data: DashboardSummary;
  role: "COORDINATOR" | "SPONSOR";
}) {
  const reportCount =
    "reportsAwaitingSend" in data.cards
      ? data.cards.reportsAwaitingSend
      : data.cards.reportsReceived;
  const cards = [
    {
      label: "Active roundtables",
      value: data.cards.activeRoundtables,
      icon: UsersRound,
    },
    {
      label: "Sessions held",
      value: data.cards.sessionsHeld,
      icon: CalendarDays,
    },
    {
      label: "Stale roundtables",
      value: data.cards.staleRoundtables,
      icon: Clock3,
    },
    role === "COORDINATOR"
      ? {
          label: "Reports awaiting sending",
          value: reportCount,
          icon: FileText,
        }
      : {
          label: "Reports received",
          value: reportCount,
          icon: FileText,
        },
  ];
  return (
    <section aria-label="Program overview">
      <dl className={styles.cards}>
        {cards.map(({ label, value, icon: Icon }) => (
          <div className={`${styles.panel} ${styles.summaryCard}`} key={label}>
            <dt>
              <span>{label}</span>
              <Icon aria-hidden size={18} />
            </dt>
            <dd>
              <span>{value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function Results({
  data,
  role,
}: {
  data: DashboardSummary;
  role: "COORDINATOR" | "SPONSOR";
}) {
  const attendance = data.pies.lastSessionAttendance;
  return (
    <>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <p>Completed roundtables: {data.cards.completedRoundtables}</p>
        <p>Cancelled sessions: {data.cards.sessionsCancelled}</p>
        <p>Reports flagged for changes: {data.cards.reportsFlagged}</p>
        <p>Unregistered Facilitators: {data.cards.unregisteredFacilitators}</p>
        <Link href="/roundtables">View roundtables</Link>
        <Link href="/reports">View reports</Link>
      </div>
      <div className={styles.analysisGrid}>
        {attendance ? (
          <Pie
            title={`Last held session attendance · ${attendance.date}`}
            rows={[
              { key: "met", label: "Met", value: attendance.met },
              {
                key: "notMet",
                label: "Did not meet",
                value: attendance.notMet,
              },
              {
                key: "unrecorded",
                label: "Not recorded",
                value: attendance.unrecorded,
              },
            ]}
          />
        ) : (
          <section
            className={styles.panel}
            aria-label="Last held session attendance"
          >
            <h2>Last held session attendance</h2>
            <p>No held sessions in this period.</p>
          </section>
        )}
        <Pie
          title={role === "SPONSOR" ? "Received reports" : "Reports by status"}
          rows={data.pies.reportsByStatus.map((r) => ({
            ...r,
            label:
              role === "COORDINATOR" && r.key === "SENT"
                ? "Sent"
                : statusLabels[r.key]!,
          }))}
        />
        <Pie
          title="Roundtables by level"
          rows={data.pies.roundtablesByLevel.map((r) => ({
            ...r,
            label: levelLabels[r.key],
          }))}
        />
        <Pie
          title="Roundtables by class"
          rows={data.pies.roundtablesByClass.map((r) => ({
            ...r,
            label: classes[r.key]!,
          }))}
        />
      </div>
      <div className={styles.operationsGrid}>
        <section className={styles.panel} aria-label="Stale roundtables">
          <h2>Stale roundtables</h2>

          <ul className={styles.list}>
            {data.stale.length ? (
              data.stale.map((r) => (
                <li key={r.roundtableId}>
                  <Link href={`/roundtables/${r.roundtableId}`}>{r.name}</Link>
                  <p className="text-sm text-muted-foreground">
                    {r.lastProgressOn
                      ? `Last recorded progress: ${r.lastProgressOn}`
                      : "No dated session progress recorded"}
                  </p>
                </li>
              ))
            ) : (
              <li>No stale roundtables.</li>
            )}
          </ul>
        </section>
        <section className={styles.panel} aria-label="Latest sessions">
          <h2>Latest sessions</h2>

          <ul className={styles.list}>
            {data.latestSessions.length ? (
              data.latestSessions.map((s) => (
                <li key={s.id}>
                  {role === "COORDINATOR" ? (
                    <Link href={`/sessions/${s.id}`}>{s.date}</Link>
                  ) : (
                    <span>{s.date}</span>
                  )}
                  <span className="ml-3 text-sm">
                    {s.status === "HELD" ? "Held" : "Cancelled"}
                  </span>
                </li>
              ))
            ) : (
              <li>No sessions in this selection.</li>
            )}
          </ul>
        </section>
        {"unregisteredFacilitators" in data && role === "COORDINATOR" && (
          <section
            className={styles.panel}
            aria-label="Unregistered Facilitators"
          >
            <h2>Unregistered Facilitators</h2>

            <ul className={styles.list}>
              {data.unregisteredFacilitators.length ? (
                data.unregisteredFacilitators.map((person) => (
                  <li key={person.id}>
                    {person.name} ·{" "}
                    {person.classYear
                      ? classes[person.classYear]
                      : "No class recorded"}
                  </li>
                ))
              ) : (
                <li>No unregistered Facilitators in this selection.</li>
              )}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
export function Dashboard() {
  const user = useSession(),
    staff = user.role !== "FACILITATOR";
  const [draft, setDraft] = useState<FilterDraft>(emptyFilters),
    [applied, setApplied] = useState<DashboardFilters>({}),
    [invalid, setInvalid] = useState("");
  const [search, setSearch] = useState(""),
    [searchQuery, setSearchQuery] = useState(""),
    [page, setPage] = useState(1),
    [selectedName, setSelectedName] = useState("");
  const years = useQuery({
    queryKey: ["academic-years", "dashboard", user.id, user.role],
    enabled: staff,
    queryFn: ({ signal }) => loadAcademicYears(signal),
  });
  const selectedYear = years.data?.find((y) =>
    draft.academicYearId ? y.id === draft.academicYearId : y.isCurrent,
  );
  const options = useQuery({
    queryKey: [
      "dashboard-roundtable-options",
      user.id,
      user.role,
      searchQuery,
      page,
    ],
    enabled: staff,
    queryFn: async ({ signal }) =>
      roundtablePage.parse(
        await api(
          `/roundtables?${new URLSearchParams({ page: String(page), pageSize: "20", status: "ACTIVE", ...(searchQuery ? { q: searchQuery } : {}) })}`,
          { signal },
        ),
      ),
  });
  const params = filterQuery(applied);
  const summary = useQuery({
    queryKey: ["dashboard", user.id, user.role, params],
    enabled: staff,
    queryFn: async ({ signal }) =>
      parseSummary(
        (
          await api<{ data: unknown }>(
            `/dashboard/summary${params ? `?${params}` : ""}`,
            { signal },
          )
        ).data,
        user.role,
        applied.academicYearId,
      ),
    staleTime: 0,
  });
  const parsed = dashboardFilters.safeParse(
    Object.fromEntries(
      Object.entries(draft).filter(([, value]) => value !== ""),
    ),
  );
  const dirty = !parsed.success || filterQuery(parsed.data) !== params;
  const change = (key: keyof FilterDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === "academicYearId" ? { termId: "" } : {}),
    }));
    setInvalid("");
  };
  if (!staff) return null;
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1>Welcome back, {user.name}.</h1>
        </div>
        <Button asChild>
          <Link
            href={user.role === "COORDINATOR" ? "/sessions/new" : "/reports"}
          >
            {user.role === "COORDINATOR"
              ? "Create session"
              : "View received reports"}
            <ArrowUpRight aria-hidden size={18} />
          </Link>
        </Button>
      </header>
      {summary.data && !summary.isError && (
        <SummaryCards
          data={summary.data}
          role={user.role as "COORDINATOR" | "SPONSOR"}
        />
      )}
      {summary.isPending && (
        <section
          role="status"
          aria-label="Loading program overview"
          className={styles.loadingOverview}
        >
          Loading program overview...
        </section>
      )}
      <section className={styles.filterBar} aria-labelledby="dashboard-filters">
        <div className={styles.panelHeading}>
          <h2 id="dashboard-filters">
            <SlidersHorizontal aria-hidden size={18} />
            Program filters
          </h2>
        </div>
        <Pending active={years.isPending} />
        {years.isError && (
          <>
            <Feedback error={years.error} />
            <Button variant="outline" onClick={() => years.refetch()}>
              Retry academic years
            </Button>
          </>
        )}
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setApplied(parseFilters(draft));
              setInvalid("");
            } catch {
              setInvalid(
                "Check the filters. Use valid dates with From date on or before To date.",
              );
            }
          }}
        >
          <div className={styles.filters}>
            <Field id="dashboard-year" label="Academic year">
              <Select
                id="dashboard-year"
                value={draft.academicYearId}
                disabled={!years.data}
                onChange={(e) => change("academicYearId", e.target.value)}
              >
                <option value="">Current academic year</option>
                {years.data?.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="dashboard-term" label="Term">
              <Select
                id="dashboard-term"
                value={draft.termId}
                disabled={!selectedYear}
                onChange={(e) => change("termId", e.target.value)}
              >
                <option value="">All terms</option>
                {selectedYear?.terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="dashboard-class" label="Class">
              <Select
                id="dashboard-class"
                value={draft.classYear}
                onChange={(e) => change("classYear", e.target.value)}
              >
                <option value="">All classes</option>
                {Object.entries(classes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="dashboard-level" label="Level">
              <Select
                id="dashboard-level"
                value={draft.level}
                onChange={(e) => change("level", e.target.value)}
              >
                <option value="">All levels</option>
                {Object.entries(levelLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <details className={styles.advancedFilters}>
            <summary>More filters</summary>
            <div className={styles.secondaryFilters}>
              <Field id="dashboard-from" label="From date">
                <Input
                  id="dashboard-from"
                  type="date"
                  value={draft.from}
                  onChange={(e) => change("from", e.target.value)}
                  aria-invalid={!!invalid}
                />
              </Field>
              <Field id="dashboard-to" label="To date">
                <Input
                  id="dashboard-to"
                  type="date"
                  value={draft.to}
                  onChange={(e) => change("to", e.target.value)}
                  aria-invalid={!!invalid}
                />
              </Field>
              <Field id="dashboard-roundtable" label="Roundtable">
                <Select
                  id="dashboard-roundtable"
                  value={draft.roundtableId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedName(
                      options.data?.data.find((r) => r.id === value)?.name ??
                        selectedName,
                    );
                    change("roundtableId", value);
                  }}
                >
                  <option value="">All active roundtables</option>
                  {draft.roundtableId &&
                    !options.data?.data.some(
                      (r) => r.id === draft.roundtableId,
                    ) && (
                      <option value={draft.roundtableId}>{selectedName}</option>
                    )}
                  {options.data?.data.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </details>
          {invalid && (
            <p role="alert" className="mb-4 text-destructive">
              {invalid}
            </p>
          )}
          <div className={styles.filterActions}>
            <Button>Apply filters</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(emptyFilters);
                setApplied({});
                setInvalid("");
                setSelectedName("");
                setPage(1);
                setSearch("");
                setSearchQuery("");
              }}
            >
              Clear filters
            </Button>
          </div>
        </form>
        <details className="mt-5">
          <summary className="cursor-pointer">Find roundtable</summary>
          <form
            className="search-toolbar mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSearchQuery(search.trim());
              setPage(1);
            }}
          >
            <Field id="roundtable-search" label="Search roundtable names">
              <Input
                id="roundtable-search"
                maxLength={100}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
            <Button variant="outline">Search roundtables</Button>
          </form>
          <Pending active={options.isFetching} />
          {options.isError && (
            <>
              <Feedback error={options.error} />
              <Button variant="outline" onClick={() => options.refetch()}>
                Retry roundtables
              </Button>
            </>
          )}
          {options.data && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={options.isFetching || page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous roundtables
              </Button>
              <p>
                Roundtable page {page} of{" "}
                {Math.max(1, options.data.meta.totalPages)}
              </p>
              <Button
                variant="outline"
                disabled={
                  options.isFetching || page >= options.data.meta.totalPages
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Next roundtables
              </Button>
              {options.data.data.length === 0 && (
                <p>No matching roundtables.</p>
              )}
            </div>
          )}
        </details>
        {dirty && (
          <p role="status" className="mt-4">
            Unapplied filters.
          </p>
        )}
      </section>
      <Pending active={summary.isFetching} />
      {summary.isError && (
        <section className={styles.panel}>
          <h2>Could not load the dashboard.</h2>
          <Feedback error={summary.error} />
          {summary.error instanceof ApiError &&
            summary.error.code === "ACADEMIC_YEAR_NOT_FOUND" && (
              <p>
                Select an existing academic year above. If none is configured,
                ask a Coordinator to configure the program calendar.
              </p>
            )}
          <Button variant="outline" onClick={() => summary.refetch()}>
            Retry dashboard
          </Button>
        </section>
      )}
      {summary.data && !summary.isError && (
        <Results
          data={summary.data}
          role={user.role as "COORDINATOR" | "SPONSOR"}
        />
      )}
      <div className={styles.utilityGrid}>
        {summary.data && !summary.isError && (
          <ExportControls
            key={`${user.id}:${user.role}:${params}:${summary.data.academicYear.id}`}
            filters={{
              ...applied,
              academicYearId: summary.data.academicYear.id,
            }}
            blocked={dirty || summary.isFetching}
          />
        )}
        {user.role === "COORDINATOR" && <Reminders />}
      </div>
    </div>
  );
}
