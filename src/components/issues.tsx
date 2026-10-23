"use client";
import Link from "next/link";
import styles from "./roundtables.module.css";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useIsMutating,
} from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import {
  categories,
  issueInput,
  createdIssue,
  resolvedIssue,
  readIssuePage,
  uncertainIssueWrite,
  type Issue,
} from "@/lib/issues";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Field, Select } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";
const textClass =
  "min-h-28 w-full rounded-lg border border-input bg-background p-3 text-foreground disabled:opacity-70";
function Resolve({
  issue,
  onSaved,
  blocked,
}: {
  issue: Issue;
  onSaved: (row: Issue, note: string | null) => Promise<void>;
  blocked: boolean;
}) {
  const [note, setNote] = useState("");
  const writing = useRef(false);
  const mutation = useMutation({
    mutationKey: ["issue-write"],
    retry: false,
    mutationFn: async () =>
      resolvedIssue(
        await api(`/issues/${issue.id}/resolve`, {
          method: "POST",
          body: { resolutionNote: note.trim() || null },
        }),
        issue,
      ),
    onSuccess: (row) => onSaved(row, note.trim() || null),
    onSettled: () => {
      writing.current = false;
    },
  });
  return (
    <form
      className="mt-4 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (writing.current || blocked || mutation.isSuccess) return;
        writing.current = true;
        mutation.mutate();
      }}
    >
      <Field id={`resolution-${issue.id}`} label="Resolution note (optional)">
        <textarea
          id={`resolution-${issue.id}`}
          className={textClass}
          value={note}
          maxLength={5000}
          disabled={
            blocked ||
            mutation.isPending ||
            mutation.isSuccess ||
            (uncertainIssueWrite(mutation.error) && mutation.isError)
          }
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <Feedback error={mutation.error} />
      {mutation.isError && uncertainIssueWrite(mutation.error) && (
        <p className="notice">
          Resolution is unconfirmed. Your note is retained. Retry resolution
          checks or completes the same operation; an existing resolution is
          returned unchanged.
        </p>
      )}
      <Pending active={mutation.isPending} />
      {mutation.isSuccess ? (
        <p role="status">Issue resolved.</p>
      ) : (
        <Button disabled={blocked || mutation.isPending} type="submit">
          {mutation.isPending
            ? "Resolving…"
            : mutation.isError && uncertainIssueWrite(mutation.error)
              ? "Retry resolution"
              : "Resolve issue"}
        </Button>
      )}
    </form>
  );
}
export function Issues() {
  const user = useSession(),
    cache = useQueryClient();
  const [status, setStatus] = useState<"OPEN" | "RESOLVED" | "">("OPEN"),
    [page, setPage] = useState(1);
  const eligible =
    user.role === "COORDINATOR" ||
    (user.role === "FACILITATOR" && user.hasRoundtable);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [checking, setChecking] = useState(false);
  const writing = useRef(false);
  const writes = useIsMutating({ mutationKey: ["issue-write"] });
  const read = async (requestedPage: number, requestedStatus: typeof status) =>
    readIssuePage(
      await api(
        `/issues?page=${requestedPage}&pageSize=20${requestedStatus ? `&status=${requestedStatus}` : ""}`,
      ),
      requestedPage,
      requestedStatus,
      user.role === "FACILITATOR" ? user : undefined,
    );
  const query = useQuery({
    queryKey: ["issues", user.id, user.role, status, page],
    enabled: eligible,
    queryFn: () => read(page, status),
  });
  const form = useForm<z.infer<typeof issueInput>>({
    resolver: zodResolver(issueInput),
    defaultValues: { category: "WRONG_LESSON", message: "" },
  });
  const refresh = async () => {
    setRefreshError(null);
    try {
      await cache.invalidateQueries(
        { queryKey: ["issues", user.id] },
        { throwOnError: true },
      );
    } catch (error) {
      setRefreshError(error);
    }
  };
  const raise = useMutation({
    mutationKey: ["issue-write"],
    retry: false,
    mutationFn: async (value: z.infer<typeof issueInput>) =>
      createdIssue(
        await api("/issues", { method: "POST", body: value }),
        value,
        user,
      ),
    onError: (error) => {
      if (uncertainIssueWrite(error)) {
        setUncertain(true);
        setReviewed(false);
      }
    },
    onSuccess: async () => {
      setNotice(
        "Your issue was recorded. Coordinators have been notified in the app.",
      );
      form.reset();
      await refresh();
    },
    onSettled: () => {
      writing.current = false;
    },
  });
  const inspect = async () => {
    setChecking(true);
    setRefreshError(null);
    try {
      await cache.fetchQuery({
        queryKey: ["issues", user.id, user.role, "", 1],
        queryFn: () => read(1, ""),
        staleTime: 0,
      });
      setStatus("");
      setPage(1);
      setReviewed(true);
    } catch (error) {
      setRefreshError(error);
    } finally {
      setChecking(false);
    }
  };
  const blocked = query.isError || query.isFetching || checking || writes > 0;
  if (!eligible)
    return (
      <>
        <h1>Issues</h1>
        <p>Register a roundtable before raising an issue.</p>
        <Link href="/register-roundtable">Register roundtable</Link>
      </>
    );
  return (
    <section
      className={`${styles.issuePage} ${user.role === "FACILITATOR" ? styles.ownPage : ""}`}
    >
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {user.role === "FACILITATOR" ? "My issues" : "Roundtable issues"}
        </h1>
        <p className="text-muted-foreground">
          {user.role === "FACILITATOR"
            ? "Ask a Coordinator to correct recorded progress or roundtable details."
            : "Review the issue, make any required correction, then record its resolution."}
        </p>
      </header>
      {user.role === "FACILITATOR" && (
        <form
          className="rounded-xl border border-border bg-card p-6"
          onSubmit={(event) => {
            void form.handleSubmit((value) => {
              if (writing.current || uncertain || blocked) return;
              writing.current = true;
              setNotice("");
              raise.mutate(value);
            })(event);
          }}
        >
          <h2 className="mb-4 text-lg font-semibold">Raise an issue</h2>
          <Field id="issue-category" label="Category">
            <Select
              id="issue-category"
              disabled={raise.isPending || uncertain || blocked}
              {...form.register("category")}
            >
              {Object.entries(categories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="issue-message"
            label="Describe the issue"
            error={form.formState.errors.message?.message}
            help="A Coordinator can correct the record. This does not change your level or lesson automatically."
          >
            <textarea
              id="issue-message"
              className={textClass}
              maxLength={5000}
              disabled={raise.isPending || uncertain || blocked}
              aria-invalid={!!form.formState.errors.message}
              aria-describedby={`issue-message-help${form.formState.errors.message ? " issue-message-error" : ""}`}
              {...form.register("message")}
            />
          </Field>
          <Feedback error={raise.error} />
          <Pending active={raise.isPending} />
          {uncertain && (
            <div className="notice space-y-3">
              <p>
                Sending is unconfirmed. Your text is retained. Inspect all issue
                pages before sending anything again; a missing or matching row
                alone does not prove what happened.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={checking || writes > 0}
                onClick={() => void inspect()}
              >
                Check existing issues
              </Button>
              {reviewed && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={blocked}
                  onClick={() => {
                    setUncertain(false);
                    setReviewed(false);
                    raise.reset();
                  }}
                >
                  I reviewed the list; allow a new issue
                </Button>
              )}
            </div>
          )}
          <Button
            type="submit"
            disabled={raise.isPending || uncertain || blocked}
          >
            {raise.isPending ? "Sending…" : "Send issue"}
          </Button>
        </form>
      )}
      {notice && (
        <p className="notice whitespace-pre-wrap break-words" role="status">
          {notice}
        </p>
      )}
      {refreshError != null && (
        <div className="space-y-3">
          <p className="notice">
            The latest issue views could not be loaded. Retrying the refresh
            only reads issues; it does not send or resolve one again.
          </p>
          <Feedback error={refreshError} />
          <Button
            variant="outline"
            disabled={query.isFetching || checking || writes > 0}
            onClick={() => void refresh()}
          >
            Retry refreshing issues
          </Button>
        </div>
      )}
      <div className="max-w-xs">
        <Field id="issue-status" label="Issue status">
          <Select
            id="issue-status"
            value={status}
            disabled={writes > 0 || checking}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
            <option value="">All issues</option>
          </Select>
        </Field>
      </div>
      <Feedback error={query.error} />
      <Pending active={query.isFetching} />
      {query.isError && (
        <Button variant="outline" onClick={() => query.refetch()}>
          Try again
        </Button>
      )}
      {query.isError && query.data && (
        <p className="notice">
          Last loaded issues are shown. Actions are disabled until a successful
          read.
        </p>
      )}
      {!query.data && page > 1 && (
        <Button
          variant="outline"
          disabled={query.isFetching || writes > 0}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </Button>
      )}
      {query.data && (
        <>
          <p className="text-sm text-muted-foreground">
            {query.data.meta.total}{" "}
            {query.data.meta.total === 1 ? "issue" : "issues"}
          </p>
          {query.data.data.length === 0 && (
            <p className="notice">No issues match this filter.</p>
          )}
          <div className="grid gap-4">
            {query.data.data.map((issue) => (
              <article
                key={issue.id}
                aria-labelledby={`issue-${issue.id}`}
                className="min-w-0 rounded-xl border border-border bg-card p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2
                    id={`issue-${issue.id}`}
                    className="text-lg font-semibold"
                  >
                    {categories[issue.category]}
                  </h2>
                  <span className="rounded-full border border-border px-3 py-1 text-xs">
                    {issue.status === "OPEN" ? "Open" : "Resolved"}
                  </span>
                </div>
                {user.role === "COORDINATOR" && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <Link
                      className="underline"
                      href={`/roundtables/${encodeURIComponent(issue.roundtable.id)}`}
                    >
                      {issue.roundtable.name}
                    </Link>{" "}
                    · {issue.raisedBy.name}
                  </p>
                )}
                <p className="mt-3 whitespace-pre-wrap break-words">
                  {issue.message}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Raised{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeZone: "Africa/Kigali",
                  }).format(new Date(issue.createdAt))}
                </p>
                {issue.status === "RESOLVED" && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-sm font-semibold">
                      Resolution
                      {issue.resolvedBy ? ` by ${issue.resolvedBy.name}` : ""}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {issue.resolutionNote || "Resolved without a note."}
                    </p>
                  </div>
                )}
                {user.role === "COORDINATOR" && issue.status === "OPEN" && (
                  <Resolve
                    issue={issue}
                    blocked={blocked}
                    onSaved={async (row, note) => {
                      setNotice(
                        `${row.resolvedBy?.id === user.id && row.resolutionNote === note ? "Issue resolved." : "An existing resolution was returned; your note did not replace it."} ${row.roundtable.name} · ${row.resolvedBy?.name}\n${row.resolutionNote || "Resolved without a note."}`,
                      );
                      await refresh();
                      heading.current?.focus();
                    }}
                  />
                )}
              </article>
            ))}
          </div>
          <nav
            aria-label="Issue pages"
            className="flex flex-wrap items-center gap-4"
          >
            <Button
              variant="outline"
              disabled={page <= 1 || query.isFetching || writes > 0 || checking}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {Math.max(1, query.data.meta.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={
                page >= query.data.meta.totalPages ||
                query.isFetching ||
                query.isError ||
                writes > 0 ||
                checking
              }
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
