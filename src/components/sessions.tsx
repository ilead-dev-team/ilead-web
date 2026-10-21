"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useIsMutating,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { activityPage } from "@/lib/configuration";
import { loadAcademicYears } from "@/lib/academic";
import {
  sessionPage,
  sessionInput,
  sessionRange,
  cancellation,
  savedSession,
  changedSession,
  readSession,
  sessionOnDate,
  uncertainSessionWrite,
  type SessionInput,
  type SessionRecord,
} from "@/lib/sessions";
import { useSession } from "./session";
import { Entries } from "./entries";
import { SessionReport } from "./reports";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";

function useRefreshSessions() {
  const cache = useQueryClient();
  return async () => {
    await cache.invalidateQueries({ queryKey: ["sessions"] });
    await cache.invalidateQueries({ queryKey: ["dashboard"] });
  };
}
function SessionForm({
  row,
  blocked = false,
  onUncertain,
}: {
  row?: SessionRecord;
  blocked?: boolean;
  onUncertain?: (value: boolean) => void;
}) {
  const user = useSession(),
    router = useRouter(),
    refresh = useRefreshSessions();
  const cache = useQueryClient();
  const writes = useIsMutating({
    mutationKey: ["session-write", row?.id ?? "new"],
  });
  const [uncertain, setUncertain] = useState(false),
    [existing, setExisting] = useState<SessionRecord | null>(null);
  const [date, setDate] = useState(row?.date ?? ""),
    [notes, setNotes] = useState(row?.notes ?? ""),
    [selected, setSelected] = useState<Record<string, boolean>>(
      Object.fromEntries(
        row?.activities.map((a) => [a.activityTypeId, a.held]) ?? [],
      ),
    ),
    [invalid, setInvalid] = useState<string>(),
    [saved, setSaved] = useState(false);
  const activities = useQuery({
    queryKey: ["configuration", "activities", "session-options", user.id],
    queryFn: async () => {
      const first = activityPage.parse(
        await api("/activity-types?isActive=true&page=1&pageSize=100"),
      );
      const records = [...first.data];
      for (let page = 2; page <= first.meta.totalPages; page++)
        records.push(
          ...activityPage.parse(
            await api(
              `/activity-types?isActive=true&page=${page}&pageSize=100`,
            ),
          ).data,
        );
      return records;
    },
  });
  const options = new Map(
    activities.data?.map((a) => [
      a.id,
      { id: a.id, name: a.name, inactive: false },
    ]) ?? [],
  );
  row?.activities.forEach((a) => {
    if (!options.has(a.activityTypeId))
      options.set(a.activityTypeId, {
        id: a.activityTypeId,
        name: a.name,
        inactive: true,
      });
  });
  const mutation = useMutation({
    mutationKey: ["session-write", row?.id ?? "new"],
    retry: false,
    mutationFn: async (body: SessionInput) => {
      return savedSession(
        await api(row ? `/sessions/${row.id}` : "/sessions", {
          method: row ? "PATCH" : "POST",
          body,
        }),
        body,
        row?.id,
      );
    },
    onError: (error) => {
      if (uncertainSessionWrite(error)) {
        setUncertain(true);
        onUncertain?.(true);
      }
    },
    onSuccess: async (result) => {
      setDate(result.date);
      setNotes(result.notes ?? "");
      setSelected(
        Object.fromEntries(
          result.activities.map((a) => [a.activityTypeId, a.held]),
        ),
      );
      setSaved(true);
      if (!row) router.push(`/sessions/${result.id}`);
      await refresh();
    },
  });
  const check = useMutation({
    retry: false,
    mutationFn: async () =>
      row
        ? readSession(await api(`/sessions/${row.id}`), row.id)
        : sessionOnDate(
            await api(`/sessions?from=${date}&to=${date}&page=1&pageSize=20`),
            date,
          ),
    onSuccess: (result) => {
      mutation.reset();
      if (row && result) {
        onUncertain?.(false);
        cache.setQueryData(["sessions", "detail", user.id, row.id], result);
        setUncertain(false);
      } else {
        setExisting(result);
        setUncertain(Boolean(result));
      }
    },
  });
  const busy = mutation.isPending || writes > 0 || check.isPending;
  const needsCheck = row ? blocked : uncertain;
  const locked = busy || needsCheck;
  return (
    <form
      className="my-6 grid max-w-2xl gap-4 rounded-xl border border-border p-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (
          locked ||
          !activities.data ||
          activities.isError ||
          activities.isFetching
        )
          return;
        setSaved(false);
        mutation.reset();
        check.reset();
        const parsed = sessionInput.safeParse({
          date,
          notes,
          activities: Object.entries(selected).map(
            ([activityTypeId, held]) => ({ activityTypeId, held }),
          ),
        });
        setInvalid(
          parsed.success ? undefined : parsed.error.issues[0]?.message,
        );
        if (parsed.success) mutation.mutate(parsed.data);
      }}
    >
      <h2>{row ? "Edit session" : "Session details"}</h2>
      <Field
        id="session-date"
        label="Session date"
        help="The server checks the academic year and term. Dates with entries or a report cannot be moved."
      >
        <Input
          id="session-date"
          type="date"
          aria-describedby="session-date-help"
          value={date}
          disabled={locked}
          onChange={(e) => {
            setDate(e.target.value);
            check.reset();
            setSaved(false);
          }}
        />
      </Field>
      <fieldset className="grid gap-3">
        <legend>Activities held</legend>
        <p className="text-sm text-muted-foreground">
          Tick activities that happened. Existing inactive activities are
          retained when editing.
        </p>
        <Pending active={activities.isPending} />
        <Feedback error={activities.error} />
        {activities.isError && (
          <Button
            type="button"
            variant="outline"
            onClick={() => activities.refetch()}
          >
            Retry activities
          </Button>
        )}
        {activities.data && options.size === 0 && (
          <p>
            No active activity types. You can still record a session without
            activities.
          </p>
        )}
        {[...options.values()].map((a) => (
          <label key={a.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={selected[a.id] ?? false}
              disabled={locked}
              onChange={(e) => {
                setSelected((previous) => ({
                  ...previous,
                  [a.id]: e.target.checked,
                }));
                setSaved(false);
              }}
            />
            {a.name}
            {a.inactive ? " (inactive, retained)" : ""}
          </label>
        ))}
      </fieldset>
      <Field id="session-notes" label="Notes">
        <textarea
          id="session-notes"
          className="min-h-28 w-full rounded-lg border border-input bg-background p-3"
          maxLength={5000}
          value={notes}
          disabled={locked}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
        />
      </Field>
      {invalid && (
        <p className="field-error" role="alert">
          {invalid}
        </p>
      )}
      <Feedback error={mutation.error} />
      {needsCheck && (
        <p className="notice" role="status">
          The save result is uncertain. Your entries are retained. Check saved
          state before making another change.
        </p>
      )}
      {existing && (
        <p className="notice">
          A session exists on this date.{" "}
          <Link href={`/sessions/${existing.id}`}>Open saved session</Link> and
          review it before making changes.
        </p>
      )}
      {(needsCheck || check.isSuccess) && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => check.mutate()}
          >
            Check saved state
          </Button>
          <Feedback error={check.error} />
          {check.isSuccess && !existing && (
            <p role="status">
              {row
                ? "Saved state refreshed above. Review it against your retained form before saving again."
                : "No session was found on this date. You may review and retry creation; the server checks date uniqueness."}
            </p>
          )}
        </>
      )}
      <Pending active={busy} />
      <Button
        disabled={
          locked ||
          !activities.data ||
          activities.isError ||
          activities.isFetching ||
          (!row && saved)
        }
      >
        {row ? "Save session" : "Create session"}
      </Button>
      {saved && <p role="status">Session saved.</p>}
    </form>
  );
}
function SessionLifecycle({
  row,
  blocked,
  onUncertain,
}: {
  row: SessionRecord;
  blocked: boolean;
  onUncertain: (value: boolean) => void;
}) {
  const user = useSession(),
    cache = useQueryClient();
  const writes = useIsMutating({ mutationKey: ["session-write", row.id] });
  const refresh = useRefreshSessions(),
    [confirm, setConfirm] = useState(false),
    [reason, setReason] = useState(""),
    [invalid, setInvalid] = useState<string>();
  const mutation = useMutation({
    mutationKey: ["session-write", row.id],
    retry: false,
    mutationFn: async (body: { reason: string } | { status: "HELD" }) => {
      return changedSession(
        await api(
          `/sessions/${row.id}${row.status === "HELD" ? "/cancel" : ""}`,
          { method: row.status === "HELD" ? "POST" : "PATCH", body },
        ),
        row.id,
        body,
      );
    },
    onError: (error) => {
      if (uncertainSessionWrite(error)) {
        onUncertain(true);
      }
    },
    onSuccess: async () => {
      setConfirm(false);
      setReason("");
      await refresh();
    },
  });
  const check = useMutation({
    retry: false,
    mutationFn: async () =>
      readSession(await api(`/sessions/${row.id}`), row.id),
    onSuccess: (result) => {
      onUncertain(false);
      cache.setQueryData(["sessions", "detail", user.id, row.id], result);
      mutation.reset();
      setConfirm(false);
    },
  });
  const busy = mutation.isPending || writes > 0 || check.isPending;
  return (
    <div className="my-6 rounded-xl border border-border p-5">
      <h2>{row.status === "HELD" ? "Cancel session" : "Reopen session"}</h2>
      <p>
        {row.status === "HELD"
          ? "Cancellation is blocked when a report or entries exist. Recorded history is never removed by this action."
          : "Mark held again to resume recording. The server rechecks the academic calendar."}
      </p>
      {!confirm ? (
        <Button
          className="mt-4"
          variant="outline"
          disabled={busy || blocked}
          onClick={() => {
            mutation.reset();
            setConfirm(true);
            check.reset();
          }}
        >
          {" "}
          {row.status === "HELD" ? "Mark as cancelled" : "Mark held again"}
        </Button>
      ) : (
        <form
          className="mt-4 grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || blocked) return;
            setInvalid(undefined);
            mutation.reset();
            if (row.status === "HELD") {
              const value = cancellation.safeParse(reason);
              if (!value.success) {
                setInvalid(value.error.issues[0]?.message);
                return;
              }
              mutation.mutate({ reason: value.data });
            } else mutation.mutate({ status: "HELD" });
          }}
        >
          {row.status === "HELD" && (
            <Field
              id="cancel-reason"
              label="Cancellation reason"
              error={invalid}
            >
              <Input
                id="cancel-reason"
                value={reason}
                maxLength={1000}
                disabled={busy || blocked}
                aria-invalid={!!invalid}
                aria-describedby={invalid ? "cancel-reason-error" : undefined}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy || blocked}>
              {row.status === "HELD"
                ? "Confirm cancellation"
                : "Confirm held session"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep current state
            </Button>
          </div>
        </form>
      )}
      {blocked && (
        <p className="notice" role="status">
          The status change is uncertain. Check saved state before cancelling or
          reopening again.
        </p>
      )}
      {(blocked || check.isSuccess) && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => check.mutate()}
          >
            Check session status
          </Button>
          <Feedback error={check.error} />
          {check.isSuccess && (
            <p role="status">
              Session status refreshed. Review it before making another change.
            </p>
          )}
        </>
      )}
      <Pending active={busy} />
      <Feedback error={mutation.error} />
    </div>
  );
}
export function Sessions() {
  const user = useSession(),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [academicYearId, setAcademicYearId] = useState(""),
    [termId, setTermId] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [range, setRange] = useState({ from: "", to: "" }),
    [invalid, setInvalid] = useState<string>();
  const calendar = useQuery({
    queryKey: ["academic-years", user.id, user.role],
    queryFn: ({ signal }) => loadAcademicYears(signal),
  });
  const selectedYear = calendar.data?.find(
    (year) => year.id === academicYearId,
  );
  const query = useQuery({
    queryKey: [
      "sessions",
      "list",
      user.id,
      page,
      status,
      range,
      academicYearId,
      termId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (status) params.set("status", status);
      if (academicYearId) params.set("academicYearId", academicYearId);
      if (termId) params.set("termId", termId);
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      return sessionPage.parse(await api(`/sessions?${params}`));
    },
  });
  return (
    <section>
      <h1>Sessions</h1>
      <p className="mb-5 text-muted-foreground">
        Record held sessions and inspect entry completion. Cancellation retains
        the session with its reason.
      </p>
      <Link className="underline" href="/sessions/new">
        New session
      </Link>
      <div className="my-5 grid gap-4 sm:grid-cols-2">
        <Field id="sessions-year" label="Academic year">
          <Select
            id="sessions-year"
            value={academicYearId}
            disabled={!calendar.data}
            onChange={(event) => {
              setAcademicYearId(event.target.value);
              setTermId("");
              setPage(1);
            }}
          >
            <option value="">All academic years</option>
            {calendar.data?.map((year) => (
              <option key={year.id} value={year.id}>
                {year.label}
                {year.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="sessions-term"
          label="Term"
          help="Choose an academic year to filter by one of its terms."
        >
          <Select
            id="sessions-term"
            value={termId}
            disabled={!selectedYear}
            aria-describedby="sessions-term-help"
            onChange={(event) => {
              setTermId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All terms</option>
            {selectedYear?.terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Pending active={calendar.isPending} />
      <Feedback error={calendar.error} />
      {calendar.isError && (
        <div className="my-3 flex flex-wrap items-center gap-3">
          <p>
            Calendar filters are unavailable. You can still browse sessions.
          </p>
          <Button variant="outline" onClick={() => calendar.refetch()}>
            Retry calendar
          </Button>
        </div>
      )}
      {calendar.data?.length === 0 && (
        <p role="status">
          No academic years configured. Calendar filters will appear after
          setup.
        </p>
      )}
      {(academicYearId || termId) && (
        <Button
          variant="outline"
          onClick={() => {
            setAcademicYearId("");
            setTermId("");
            setPage(1);
          }}
        >
          Clear calendar filters
        </Button>
      )}
      <form
        className="my-5 grid gap-4 sm:grid-cols-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = sessionRange.safeParse({ from, to });
          setInvalid(
            parsed.success ? undefined : parsed.error.issues[0]?.message,
          );
          if (parsed.success) {
            setRange(parsed.data);
            setPage(1);
          }
        }}
      >
        <Field id="sessions-from" label="From date">
          <Input
            id="sessions-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field id="sessions-to" label="To date">
          <Input
            id="sessions-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Button className="self-end">Apply dates</Button>
        {invalid && (
          <p role="alert" className="field-error">
            {invalid}
          </p>
        )}
      </form>
      <Field id="sessions-status" label="Status">
        <Select
          id="sessions-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="HELD">Held</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </Field>
      <Pending active={query.isPending} />
      <Feedback error={query.error} />
      {query.isError && (
        <Button onClick={() => query.refetch()}>Try again</Button>
      )}
      {query.data && (
        <>
          <div className="my-6 grid gap-4 sm:grid-cols-2">
            {query.data.data.length ? (
              query.data.data.map((row) => (
                <article
                  key={row.id}
                  className="rounded-xl border border-border p-5"
                >
                  <h2>
                    <Link className="underline" href={`/sessions/${row.id}`}>
                      {row.date}
                    </Link>
                  </h2>
                  <p>
                    {row.status === "HELD" ? "Held" : "Cancelled"} ·{" "}
                    {row.academicYear.label} · {row.term.name}
                  </p>
                  <p>
                    {row.counts.met} met · {row.counts.notMet} did not meet ·{" "}
                    {row.counts.pending} pending
                  </p>
                  {row.cancellationReason && (
                    <p className="break-words">
                      Reason: {row.cancellationReason}
                    </p>
                  )}
                </article>
              ))
            ) : (
              <p>No matching sessions.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <p>
              Page {page} of {Math.max(1, query.data.meta.totalPages)}
            </p>
            <Button
              variant="outline"
              disabled={page >= query.data.meta.totalPages || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
export function NewSession() {
  return (
    <section>
      <h1>New session</h1>
      <p>
        Choose a date covered by the configured academic calendar. A new session
        starts as held.
      </p>
      <SessionForm />
    </section>
  );
}
export function SessionDetail({ id }: { id: string }) {
  const user = useSession();
  const [showEntries, setShowEntries] = useState(false),
    [entriesDirty, setEntriesDirty] = useState(false),
    [uncertainWrite, setUncertainWrite] = useState(false);
  const query = useQuery({
    queryKey: ["sessions", "detail", user.id, id],
    queryFn: async () => readSession(await api(`/sessions/${id}`), id),
  });
  const row = query.data;
  return (
    <section>
      <h1>Session details</h1>
      <Pending active={query.isPending} />
      <Feedback error={query.error} />
      {query.isError && (
        <Button onClick={() => query.refetch()}>Try again</Button>
      )}
      {row && (
        <>
          <div className="my-5 rounded-xl border border-border p-5">
            <h2>
              {row.date} · {row.status === "HELD" ? "Held" : "Cancelled"}
            </h2>
            <p>
              {row.academicYear.label} · {row.term.name}
            </p>
            <p>Recorded by {row.createdBy.name}</p>
            {row.notes && (
              <p className="whitespace-pre-wrap break-words">{row.notes}</p>
            )}
            {row.cancellationReason && (
              <p className="break-words">
                Cancellation reason: {row.cancellationReason}
              </p>
            )}
            <p>
              {row.counts.met} met · {row.counts.notMet} did not meet ·{" "}
              {row.counts.pending} pending
            </p>
            <ul>
              {row.activities.map((a) => (
                <li key={a.activityTypeId}>
                  {a.name}: {a.held ? "Held" : "Not held"}
                </li>
              ))}
            </ul>
          </div>
          {row.status === "HELD" ? (
            <SessionForm
              key={`metadata-${row.id}`}
              row={row}
              blocked={uncertainWrite}
              onUncertain={setUncertainWrite}
            />
          ) : (
            <p role="status">
              This session is cancelled. Reopen it before editing or recording
              entries.
            </p>
          )}
          {row.status === "HELD" &&
            (showEntries ? (
              <Entries
                key={`entries-${row.id}`}
                sessionId={row.id}
                onDirty={setEntriesDirty}
              />
            ) : (
              <Button onClick={() => setShowEntries(true)}>
                Record or correct entries
              </Button>
            ))}
          <SessionReport session={row} disabled={entriesDirty} />
          {entriesDirty ? (
            <p role="status">
              Save or discard entry changes before cancelling this session.
            </p>
          ) : (
            <SessionLifecycle
              key={`${row.id}-${row.status}`}
              row={row}
              blocked={uncertainWrite}
              onUncertain={setUncertainWrite}
            />
          )}
        </>
      )}
    </section>
  );
}
