"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { curriculumResponse } from "@/lib/curriculum";
import { levelLabels } from "@/lib/roundtables";
import {
  entryPage,
  entryProblems,
  entryAcknowledgement,
  draftFrom,
  needsConfirmation,
  entryPayload,
  entryErrorText,
  type Draft,
} from "@/lib/entries";
import { useSession } from "./session";
import { Field, Input, Select } from "./ui/field";
import { Button } from "./ui/button";
import { Feedback, Pending } from "./account/feedback";

export function Entries({
  sessionId,
  onDirty,
}: {
  sessionId: string;
  onDirty: (dirty: boolean) => void;
}) {
  const user = useSession(),
    cache = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [page, setPage] = useState(1),
    [pending, setPending] = useState(false),
    [levelFilter, setLevelFilter] = useState(""),
    [classFilter, setClassFilter] = useState(""),
    [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [review, setReview] = useState<string[]>([]),
    [invalid, setInvalid] = useState<string>(),
    [saved, setSaved] = useState(false);
  const count = Object.keys(drafts).length;
  useEffect(() => {
    onDirty(count > 0);
    return () => onDirty(false);
  }, [count, onDirty]);
  useEffect(() => {
    if (!count) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [count]);
  const query = useQuery({
    queryKey: [
      "entry-rows",
      sessionId,
      user.id,
      page,
      pending,
      levelFilter,
      classFilter,
      q,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        onlyPending: String(pending),
      });
      if (levelFilter) params.set("level", levelFilter);
      if (classFilter) params.set("classYear", classFilter);
      if (q) params.set("q", q);
      return entryPage.parse(
        await api(`/sessions/${sessionId}/entries?${params}`),
      );
    },
  });
  const curriculum = useQuery({
    queryKey: ["curriculum", user.id, user.role],
    queryFn: async () => curriculumResponse.parse(await api("/curriculum")),
  });
  const mutation = useMutation({
    mutationFn: async ({
      values,
      confirmed,
    }: {
      values: Draft[];
      confirmed: string[];
    }) => {
      const response = entryAcknowledgement.parse(
        await api(`/sessions/${sessionId}/entries`, {
          method: "PUT",
          body: entryPayload(values, confirmed),
        }),
      );
      if (response.data.saved > values.length)
        throw new Error("Unexpected entry acknowledgement");
      return response;
    },
    onSuccess: async () => {
      setDrafts({});
      setReview([]);
      setSaved(true);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["entry-rows", sessionId] }),
        cache.invalidateQueries({ queryKey: ["sessions"] }),
        cache.invalidateQueries({ queryKey: ["roundtables"] }),
        cache.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        const parsed = entryProblems.safeParse(error.details);
        if (parsed.success && !parsed.data.errors.length)
          setReview(
            parsed.data.warnings
              .filter(
                (w) => w.code === "LESSON_NOT_NEXT" && drafts[w.roundtableId],
              )
              .map((w) => w.roundtableId),
          );
      }
    },
  });
  const parsedProblems =
    mutation.error instanceof ApiError && mutation.error.status === 422
      ? entryProblems.safeParse(mutation.error.details)
      : undefined;
  const problems = parsedProblems?.success
    ? [...parsedProblems.data.errors, ...parsedProblems.data.warnings]
    : [];
  const change = (id: string, draft: Draft | undefined) => {
    setDrafts((previous) => {
      const next = { ...previous };
      if (draft) next[id] = draft;
      else delete next[id];
      return next;
    });
    setSaved(false);
    setInvalid(undefined);
    setReview([]);
    mutation.reset();
  };
  const save = () => {
    setSaved(false);
    mutation.reset();
    setInvalid(undefined);
    const values = Object.values(drafts);
    try {
      entryPayload(values);
    } catch {
      setInvalid(
        "Choose a valid lesson for every Met row, and save between 1 and 100 changed rows at a time.",
      );
      return;
    }
    const nonNext = values
      .filter(needsConfirmation)
      .map((draft) => draft.row.roundtable.id);
    if (nonNext.length) setReview(nonNext);
    else mutation.mutate({ values, confirmed: [] });
  };
  return (
    <section aria-labelledby="entries-heading" className="my-7">
      <h2 id="entries-heading">Attendance and lesson entries</h2>
      <p className="mb-4 text-muted-foreground">
        Untouched rows remain pending. Drafts stay while changing pages and
        filters on this session. Save before leaving this page; drafts are not
        stored after navigation.
      </p>
      <form
        className="my-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <div className="min-w-0 flex-1">
          <Field id="entry-search" label="Find roundtable">
            <Input
              id="entry-search"
              value={search}
              maxLength={100}
              disabled={mutation.isPending}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
        <Button disabled={mutation.isPending}>Find</Button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="entry-level-filter" label="Filter by current level">
          <Select
            id="entry-level-filter"
            value={levelFilter}
            disabled={mutation.isPending}
            onChange={(e) => {
              setLevelFilter(e.target.value);
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
        <Field id="entry-class-filter" label="Filter by class">
          <Select
            id="entry-class-filter"
            value={classFilter}
            disabled={mutation.isPending}
            onChange={(e) => {
              setClassFilter(e.target.value);
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
      </div>
      <label className="my-4 flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={pending}
          disabled={mutation.isPending}
          onChange={(e) => {
            setPending(e.target.checked);
            setPage(1);
          }}
        />
        Only pending
      </label>
      <Pending active={query.isPending || curriculum.isPending} />
      <Feedback error={query.error || curriculum.error} />
      {(query.isError || curriculum.isError) && (
        <Button
          variant="outline"
          onClick={() => {
            void query.refetch();
            void curriculum.refetch();
          }}
        >
          Retry entries and lessons
        </Button>
      )}
      <div className="my-5 grid gap-4">
        {query.data &&
          curriculum.data &&
          (query.data.data.length ? (
            query.data.data.map((row) => {
              const id = row.roundtable.id,
                draft = drafts[id],
                value = draft ?? draftFrom(row, row.entry?.met ?? false),
                state = draft
                  ? String(draft.met)
                  : row.entry
                    ? String(row.entry.met)
                    : "";
              const levels = curriculum.data.data.levels;
              return (
                <fieldset
                  key={id}
                  className="min-w-0 rounded-xl border border-border p-4"
                  disabled={mutation.isPending}
                >
                  <legend className="break-words px-2 font-semibold">
                    {row.roundtable.name}
                  </legend>
                  <p className="mb-3 text-sm">
                    {draft
                      ? "Unsaved change"
                      : row.entry
                        ? "Saved entry"
                        : "Pending entry"}{" "}
                    · Expected:{" "}
                    {row.suggested
                      ? `${levelLabels[row.suggested.level]} ${row.suggested.number}. ${row.suggested.title}`
                      : "No next lesson"}
                  </p>
                  <Field id={`met-${id}`} label="Attendance">
                    <Select
                      id={`met-${id}`}
                      value={state}
                      onChange={(e) =>
                        change(
                          id,
                          e.target.value === ""
                            ? undefined
                            : { ...value, row, met: e.target.value === "true" },
                        )
                      }
                    >
                      <option value="">
                        {row.entry ? "Keep saved entry" : "Leave pending"}
                      </option>
                      <option value="true">Met</option>
                      <option value="false">Did not meet</option>
                    </Select>
                  </Field>
                  {state === "true" && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Field id={`level-${id}`} label="Recorded level">
                        <Select
                          id={`level-${id}`}
                          value={value.level}
                          onChange={(e) =>
                            change(id, {
                              ...value,
                              row,
                              level: e.target.value as Draft["level"],
                              lessonId: "",
                            })
                          }
                        >
                          {levels.map((level) => (
                            <option key={level.key} value={level.key}>
                              {level.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field id={`lesson-${id}`} label="Recorded lesson">
                        <Select
                          id={`lesson-${id}`}
                          value={value.lessonId}
                          onChange={(e) =>
                            change(id, {
                              ...value,
                              row,
                              lessonId: e.target.value,
                            })
                          }
                        >
                          <option value="">Choose a lesson</option>
                          {levels
                            .find((level) => level.key === value.level)
                            ?.lessons.map((lesson) => (
                              <option key={lesson.id} value={lesson.id}>
                                {lesson.number}. {lesson.title}
                              </option>
                            ))}
                        </Select>
                      </Field>
                    </div>
                  )}
                  {draft && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => change(id, undefined)}
                    >
                      Discard row change
                    </Button>
                  )}
                </fieldset>
              );
            })
          ) : (
            <p>No matching roundtables.</p>
          ))}
      </div>
      {query.data && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={page <= 1 || query.isFetching || mutation.isPending}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous entries
          </Button>
          <p>
            Entry page {page} of {Math.max(1, query.data.meta.totalPages)}
          </p>
          <Button
            variant="outline"
            disabled={
              page >= query.data.meta.totalPages ||
              query.isFetching ||
              mutation.isPending
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Next entries
          </Button>
        </div>
      )}
      <p role="status">
        {count} unsaved row{count === 1 ? "" : "s"}, including other pages and
        filters.
      </p>
      {count > 0 && (
        <ul className="my-3 grid gap-2">
          {Object.values(drafts).map((draft) => (
            <li key={draft.row.roundtable.id} className="break-words">
              {draft.row.roundtable.name}: {draft.met ? "Met" : "Did not meet"}
              <Button
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() => change(draft.row.roundtable.id, undefined)}
                aria-label={`Discard change for ${draft.row.roundtable.name}`}
              >
                Discard
              </Button>
            </li>
          ))}
        </ul>
      )}
      {invalid && (
        <p role="alert" className="field-error">
          {invalid}
        </p>
      )}
      <Feedback error={mutation.error} />
      {problems.length > 0 && (
        <ul className="my-3 grid gap-2" aria-label="Entry validation problems">
          {problems.map((problem, index) => (
            <li
              key={`${problem.roundtableId}-${index}`}
              className="break-words"
            >
              {drafts[problem.roundtableId]?.row.roundtable.name ??
                "Roundtable"}
              :{" "}
              {entryErrorText[problem.code] ??
                "The server rejected this row. Review it before saving."}
            </li>
          ))}
        </ul>
      )}
      {review.length > 0 && (
        <div
          role="group"
          aria-label="Confirm non-next lessons"
          className="my-4 grid gap-3 rounded-xl border border-border p-4"
        >
          <h3>Review non-next lessons</h3>
          <p>
            These choices differ from the loaded expectation or require server
            confirmation. Confirming records only the chosen lessons; skipped
            lessons stay incomplete.
          </p>
          <ul>
            {review.map((id) => {
              const draft = drafts[id];
              if (!draft) return null;
              const chosen = curriculum.data?.data.levels
                .find((level) => level.key === draft.level)
                ?.lessons.find((lesson) => lesson.id === draft.lessonId);
              return (
                <li key={id}>
                  {draft.row.roundtable.name}: expected{" "}
                  {draft.row.suggested
                    ? `${levelLabels[draft.row.suggested.level]} ${draft.row.suggested.number}. ${draft.row.suggested.title}`
                    : "no next lesson"}
                  ; chosen {levelLabels[draft.level]} {chosen?.number}.{" "}
                  {chosen?.title}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  values: Object.values(drafts),
                  confirmed: review,
                })
              }
            >
              Confirm lessons and save
            </Button>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setReview([])}
            >
              Back to entries
            </Button>
          </div>
        </div>
      )}
      <Pending active={mutation.isPending} />
      <Button
        disabled={
          !count || mutation.isPending || !curriculum.data || review.length > 0
        }
        onClick={save}
      >
        Save changed entries
      </Button>
      {saved && (
        <p role="status">
          Entries saved. Progress and attendance have been refreshed.
        </p>
      )}
    </section>
  );
}
