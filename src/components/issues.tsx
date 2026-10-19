"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import {
  categories,
  issueInput,
  issuePage,
  issueSchema,
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
}: {
  issue: Issue;
  onSaved: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: async () =>
      issueSchema.parse(
        (
          await api<{ data: unknown }>(`/issues/${issue.id}/resolve`, {
            method: "POST",
            body: { resolutionNote: note.trim() || null },
          })
        ).data,
      ),
    onSuccess: onSaved,
  });
  return (
    <form
      className="mt-4 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Field id={`resolution-${issue.id}`} label="Resolution note (optional)">
        <textarea
          id={`resolution-${issue.id}`}
          className={textClass}
          value={note}
          maxLength={5000}
          disabled={mutation.isPending || mutation.isSuccess}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <Feedback error={mutation.error} />
      <Pending active={mutation.isPending} />
      {mutation.isSuccess ? (
        <p role="status">Issue resolved.</p>
      ) : (
        <Button disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Resolving…" : "Resolve issue"}
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
  const query = useQuery({
    queryKey: ["issues", user.id, user.role, status, page],
    enabled: eligible,
    queryFn: async () =>
      issuePage.parse(
        await api(
          `/issues?page=${page}&pageSize=20${status ? `&status=${status}` : ""}`,
        ),
      ),
  });
  const form = useForm<z.infer<typeof issueInput>>({
    resolver: zodResolver(issueInput),
    defaultValues: { category: "WRONG_LESSON", message: "" },
  });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["issues", user.id] });
  };
  const raise = useMutation({
    mutationFn: async (value: z.infer<typeof issueInput>) =>
      issueSchema.parse(
        (
          await api<{ data: unknown }>("/issues", {
            method: "POST",
            body: value,
          })
        ).data,
      ),
    onSuccess: async () => {
      form.reset();
      setPage(1);
      await refresh();
    },
  });
  if (!eligible)
    return (
      <>
        <h1>Issues</h1>
        <p>Register a roundtable before raising an issue.</p>
        <Link href="/register-roundtable">Register roundtable</Link>
      </>
    );
  return (
    <section className="space-y-6">
      <header>
        <h1>
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
          onSubmit={form.handleSubmit((value) => raise.mutate(value))}
        >
          <h2 className="mb-4 text-lg font-semibold">Raise an issue</h2>
          <Field id="issue-category" label="Category">
            <Select
              id="issue-category"
              disabled={raise.isPending}
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
              disabled={raise.isPending}
              aria-invalid={!!form.formState.errors.message}
              aria-describedby={`issue-message-help${form.formState.errors.message ? " issue-message-error" : ""}`}
              {...form.register("message")}
            />
          </Field>
          <Feedback error={raise.error} />
          <Pending active={raise.isPending} />
          {raise.isSuccess && (
            <p className="notice" role="status">
              Your issue was recorded. Coordinators have been notified in the
              app.
            </p>
          )}
          <Button type="submit" disabled={raise.isPending}>
            {raise.isPending ? "Sending…" : "Send issue"}
          </Button>
        </form>
      )}
      <div className="max-w-xs">
        <Field id="issue-status" label="Issue status">
          <Select
            id="issue-status"
            value={status}
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
                    {issue.roundtable.name} · {issue.raisedBy.name}
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
                  <Resolve issue={issue} onSaved={refresh} />
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
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {Math.max(1, query.data.meta.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={page >= query.data.meta.totalPages || query.isFetching}
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
