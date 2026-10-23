"use client";
import styles from "./administration.module.css";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import {
  blankCalendar,
  calendarAcknowledgement,
  calendarDraft,
  calendarForm,
  calendarPatch,
  managedYear,
  parseManagedPage,
  rebaseCalendar,
  uncertainCalendar,
  type CalendarInput,
  type CalendarPatch,
  type ManagedYear,
} from "@/lib/academic-management";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";
type Action =
  | { kind: "create"; input: CalendarInput }
  | {
      kind: "edit";
      original: ManagedYear;
      input: CalendarInput;
      patch: CalendarPatch;
    }
  | { kind: "current"; original: ManagedYear };
function CalendarSummary({ year }: { year: CalendarInput }) {
  return (
    <div className="my-4 grid min-w-0 gap-2 [overflow-wrap:anywhere]">
      <p className="font-semibold">{year.label}</p>
      <p>
        {year.startsOn} to {year.endsOn}
      </p>
      <ul className="grid gap-2">
        {[...year.terms]
          .sort((a, b) => a.number - b.number)
          .map((t) => (
            <li key={t.number}>
              <span className="font-semibold">
                Term {t.number}: {t.name}
              </span>
              <p>
                {t.startsOn} to {t.endsOn}
              </p>
            </li>
          ))}
      </ul>
    </div>
  );
}
function CalendarReview({
  children,
  pending,
  close,
}: {
  children: ReactNode;
  pending: boolean;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    cancelButton.current?.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby="calendar-review-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-6 text-card-foreground [overflow-wrap:anywhere] backdrop:bg-foreground/40"
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) close();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)",
          ),
        ];
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          e.preventDefault();
          e.currentTarget.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <h2 id="calendar-review-title" className="text-lg font-semibold">
        Review calendar changes
      </h2>
      {children}
      <Button
        ref={cancelButton}
        autoFocus
        variant="ghost"
        className="mt-4"
        disabled={pending}
        onClick={close}
      >
        Cancel review
      </Button>
    </dialog>
  );
}
export function AcademicYears() {
  const user = useSession(),
    cache = useQueryClient(),
    addButton = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const [page, setPage] = useState(1),
    [sort, setSort] = useState("startsOn:desc"),
    [editor, setEditor] = useState<{
      original: ManagedYear | null;
      draft: CalendarInput;
    } | null>(null),
    [review, setReview] = useState<Action | null>(null),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [notice, setNotice] = useState("");
  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const target =
        opener.current?.isConnected && !opener.current.hasAttribute("disabled")
          ? opener.current
          : addButton.current;
      target?.focus();
    });
  }, []);
  const years = useQuery({
    queryKey: ["academic-years", "management", user.id, page, sort],
    enabled: user.role === "COORDINATOR",
    staleTime: 0,
    queryFn: async ({ signal }) =>
      parseManagedPage(
        await api(
          `/academic-years?${new URLSearchParams({ page: String(page), pageSize: "20", sort })}`,
          { signal },
        ),
        page,
      ),
  });
  const current = useQuery({
    queryKey: ["academic-years", "current", user.id],
    enabled: user.role === "COORDINATOR",
    staleTime: 0,
    queryFn: async ({ signal }) => {
      try {
        return z
          .object({ data: managedYear })
          .parse(await api("/academic-years/current", { signal })).data;
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 404 &&
          error.code === "CURRENT_ACADEMIC_YEAR_NOT_FOUND"
        )
          return null;
        throw error;
      }
    },
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async (change: Action) => {
      if (user.role !== "COORDINATOR")
        throw new Error("Coordinator access required");
      const expected =
        change.kind === "current"
          ? { makeCurrent: true }
          : change.kind === "create"
            ? { ...change.input, makeCurrent: false }
            : change.patch;
      const response = await api<{ data: unknown }>(
        change.kind === "create"
          ? "/academic-years"
          : `/academic-years/${change.original.id}`,
        { method: change.kind === "create" ? "POST" : "PATCH", body: expected },
      );
      return calendarAcknowledgement(
        response.data,
        expected,
        change.kind === "create" ? undefined : change.original,
      );
    },
    onSuccess: async (saved, change) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["academic-years"] }),
        cache.invalidateQueries({ queryKey: ["dashboard"] }),
        cache.invalidateQueries({ queryKey: ["sessions"] }),
        cache.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      setNotice(
        change.kind === "current"
          ? `${saved.label} is now the current academic year. Default filters will use it; historical sessions remain assigned to their existing year and term.`
          : `${saved.label} saved.${change.kind === "create" ? " Choose Set current year when it should become the default." : ""}`,
      );
      if (change.kind !== "current") {
        setEditor(null);
        setErrors({});
      }
      setReview(null);
    },
  });
  const unconfirmed = mutation.isError && uncertainCalendar(mutation.error),
    pending = mutation.isPending;
  useEffect(() => {
    if (mutation.isSuccess && !pending && !review) restoreFocus();
  }, [mutation.isSuccess, pending, review, restoreFocus]);
  async function refresh() {
    const [list, active] = await Promise.all([
      years.refetch(),
      current.refetch(),
    ]);
    if (!list.isError && !active.isError) {
      setEditor((previous) => {
        const latest =
          previous?.original &&
          list.data?.data.find((y) => y.id === previous.original!.id);
        return previous?.original && latest
          ? {
              original: latest,
              draft: rebaseCalendar(previous.original, previous.draft, latest),
            }
          : previous;
      });
      setReview(null);
      mutation.reset();
      setNotice(
        "Years refreshed. Inspect the saved calendars before repeating an unconfirmed change. Your form values have been kept.",
      );
      restoreFocus();
    }
  }
  function start(action: Action) {
    if (pending || unconfirmed) return;
    opener.current = document.activeElement as HTMLElement | null;
    mutation.reset();
    setNotice("");
    setReview(action);
  }
  if (user.role !== "COORDINATOR") return <p>Coordinator access required.</p>;
  const frozen = pending || !!review;
  function input(
    key: string,
    label: string,
    value: string,
    update: (value: string) => void,
    type = "text",
  ) {
    const id = `calendar-${key.replaceAll(".", "-")}`;
    return (
      <Field id={id} label={label} error={errors[key]}>
        <Input
          id={id}
          autoFocus={key === "label"}
          type={type}
          value={value}
          onChange={(e) => update(e.target.value)}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${id}-error` : undefined}
        />
      </Field>
    );
  }
  return (
    <div className={styles.page}>
      <header>
        <h1>Academic years</h1>
        <p className="text-muted-foreground">
          Configure the approved NESA year and all three terms. Dates are
          calendar dates; holidays between terms are allowed.
        </p>
      </header>
      <section
        aria-labelledby="current-calendar-title"
        className={styles.panel}
      >
        <h2 id="current-calendar-title" className="font-semibold">
          Current academic year
        </h2>
        <Pending active={current.isFetching} />
        {current.isError ? (
          <>
            <Feedback error={current.error} />
            <Button variant="outline" onClick={() => current.refetch()}>
              Retry current year
            </Button>
          </>
        ) : current.data === null ? (
          <p>
            No current academic year is configured. Add a year, then choose Set
            current year.
          </p>
        ) : current.data ? (
          <p>
            {current.data.label} · {current.data.startsOn} to{" "}
            {current.data.endsOn}
          </p>
        ) : null}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          ref={addButton}
          disabled={frozen || !!editor || unconfirmed}
          onClick={() => {
            setEditor({ original: null, draft: blankCalendar() });
            setErrors({});
            setNotice("");
            mutation.reset();
          }}
        >
          Add academic year
        </Button>
        <Button
          variant="outline"
          disabled={pending || years.isFetching || current.isFetching}
          onClick={refresh}
        >
          Refresh years
        </Button>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!review && <Feedback error={mutation.error} />}
      {unconfirmed && (
        <p role="alert">
          This change is unconfirmed. Refresh years and inspect the saved
          calendar before trying again. No write will be retried automatically.
        </p>
      )}
      {editor && (
        <section aria-labelledby="calendar-form-title" className={styles.panel}>
          <h2 id="calendar-form-title" className="text-lg font-semibold">
            {editor.original ? "Edit academic year" : "New academic year"}
          </h2>
          <p className="my-3 text-sm text-muted-foreground">
            {editor.original
              ? "Only changed fields will be sent. Existing term IDs and the current-year flag are preserved. The server rejects dates that would exclude historical sessions."
              : "A new year is saved as not current. Set it current separately after reviewing its dates."}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = calendarForm.safeParse(editor.draft);
              if (!parsed.success) {
                const next: Record<string, string> = {};
                for (const issue of parsed.error.issues)
                  next[issue.path.join(".")] ??= issue.message;
                setErrors(next);
                return;
              }
              setErrors({});
              const patch = editor.original
                ? calendarPatch(editor.original, parsed.data)
                : null;
              if (patch && !Object.keys(patch).length) {
                setNotice("No changes to save.");
                return;
              }
              start(
                editor.original
                  ? {
                      kind: "edit",
                      original: editor.original,
                      input: parsed.data,
                      patch: patch!,
                    }
                  : { kind: "create", input: parsed.data },
              );
            }}
          >
            <fieldset disabled={frozen} className="min-w-0">
              <legend className="sr-only">Year and term dates</legend>
              {Object.keys(errors).length > 0 && (
                <p role="alert" className="notice notice-error">
                  Check the highlighted fields. {errors.terms ?? ""}
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                {input("label", "Year label", editor.draft.label, (label) =>
                  setEditor({ ...editor, draft: { ...editor.draft, label } }),
                )}
                {input(
                  "startsOn",
                  "Year start date",
                  editor.draft.startsOn,
                  (startsOn) =>
                    setEditor({
                      ...editor,
                      draft: { ...editor.draft, startsOn },
                    }),
                  "date",
                )}
                {input(
                  "endsOn",
                  "Year end date",
                  editor.draft.endsOn,
                  (endsOn) =>
                    setEditor({
                      ...editor,
                      draft: { ...editor.draft, endsOn },
                    }),
                  "date",
                )}
              </div>
              {editor.draft.terms.map((t, index) => (
                <fieldset
                  key={t.number}
                  className="mt-4 min-w-0 rounded-lg border border-border p-4"
                >
                  <legend className="px-2 font-semibold">
                    Term {t.number}
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {(
                      [
                        ["name", "name", "text"],
                        ["startsOn", "start date", "date"],
                        ["endsOn", "end date", "date"],
                      ] as const
                    ).map(([key, label, type]) => (
                      <div key={key}>
                        {input(
                          `terms.${index}.${key}`,
                          `Term ${t.number} ${label}`,
                          t[key],
                          (value) =>
                            setEditor({
                              ...editor,
                              draft: {
                                ...editor.draft,
                                terms: editor.draft.terms.map((row, i) =>
                                  i === index ? { ...row, [key]: value } : row,
                                ),
                              },
                            }),
                          type,
                        )}
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="submit" disabled={unconfirmed}>
                  Review changes
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditor(null);
                    setErrors({});
                    addButton.current?.focus();
                  }}
                >
                  Discard form
                </Button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      <section aria-label="Saved academic years" className="min-w-0">
        <div className="max-w-sm">
          <Field id="calendar-sort" label="Sort academic years">
            <Select
              id="calendar-sort"
              value={sort}
              disabled={pending || !!editor || !!review}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="startsOn:desc">Newest start date</option>
              <option value="startsOn:asc">Oldest start date</option>
              <option value="label:asc">Label A–Z</option>
              <option value="label:desc">Label Z–A</option>
            </Select>
          </Field>
        </div>
        {editor && (
          <p className="text-sm text-muted-foreground">
            Finish or discard the form before changing the list page or sort
            order.
          </p>
        )}
        <Pending active={years.isFetching || pending} />
        {years.isError && (
          <>
            <Feedback error={years.error} />
            <Button variant="outline" onClick={() => years.refetch()}>
              Retry years
            </Button>
          </>
        )}
        {years.data && !years.isError && (
          <>
            {years.data.data.length ? (
              <ul className="grid gap-4 lg:grid-cols-2">
                {years.data.data.map((year) => (
                  <li key={year.id}>
                    <article
                      aria-label={`Academic year ${year.label}`}
                      className={styles.panel}
                    >
                      <h2 className="text-lg font-semibold">{year.label}</h2>
                      <p className="text-sm">
                        {year.isCurrent ? "Current year" : "Not current"}
                      </p>
                      <CalendarSummary year={calendarDraft(year)} />
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          disabled={frozen || !!editor || unconfirmed}
                          onClick={() => {
                            opener.current =
                              document.activeElement as HTMLElement;
                            setEditor({
                              original: year,
                              draft: calendarDraft(year),
                            });
                            setErrors({});
                            setNotice("");
                            mutation.reset();
                          }}
                        >
                          Edit {year.label}
                        </Button>
                        {!year.isCurrent && (
                          <Button
                            variant="outline"
                            disabled={
                              frozen ||
                              !!editor ||
                              unconfirmed ||
                              current.data === undefined ||
                              current.isError ||
                              current.isFetching
                            }
                            onClick={() =>
                              start({ kind: "current", original: year })
                            }
                          >
                            Set {year.label} current
                          </Button>
                        )}
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice">No academic years on this page.</p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={frozen || !!editor || years.isFetching || page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous years
              </Button>
              <p>
                Page {page} of {Math.max(1, years.data.meta.totalPages)}
              </p>
              <Button
                variant="outline"
                disabled={
                  frozen ||
                  !!editor ||
                  years.isFetching ||
                  page >= years.data.meta.totalPages
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Next years
              </Button>
            </div>
          </>
        )}
      </section>
      {review && (
        <CalendarReview
          pending={pending}
          close={() => {
            setReview(null);
            restoreFocus();
          }}
        >
          <p className="mt-3">
            {review.kind === "current"
              ? `Switch the default academic year from ${current.data?.label ?? "none configured"} to ${review.original.label}? Existing sessions keep their assigned year and term.`
              : review.kind === "create"
                ? "Create this year and its three terms? It will not become current automatically."
                : "Save these calendar changes? Existing sessions must remain inside their assigned year and term."}
          </p>
          <CalendarSummary
            year={
              review.kind === "current"
                ? calendarDraft(review.original)
                : review.input
            }
          />
          <Pending active={pending} />
          <Feedback error={mutation.error} />
          {unconfirmed && <Feedback error={years.error || current.error} />}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              disabled={pending || unconfirmed}
              onClick={() => mutation.mutate(review)}
            >
              {review.kind === "current"
                ? "Set current year"
                : "Save academic year"}
            </Button>
            {unconfirmed && (
              <Button
                variant="outline"
                disabled={years.isFetching || current.isFetching}
                onClick={refresh}
              >
                Refresh years before retrying
              </Button>
            )}
          </div>
        </CalendarReview>
      )}
    </div>
  );
}
