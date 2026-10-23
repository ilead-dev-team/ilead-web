"use client";
import styles from "./reports.module.css";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Report } from "@/lib/reports";
import {
  commentPayload,
  feedbackBody,
  parseComment,
  parseCommentPage,
  type ReportComment,
} from "@/lib/report-feedback";
import { useSession } from "./session";
import { Field, Select } from "./ui/field";
import { Button } from "./ui/button";
import { Feedback, Pending } from "./account/feedback";
const area = "min-h-28 w-full rounded-lg border border-input bg-background p-3";
function CommentContent({
  comment,
  report,
}: {
  comment: ReportComment;
  report: Report;
}) {
  return (
    <>
      <p className="font-semibold">
        {comment.author.name} ·{" "}
        {comment.author.role === "SPONSOR" ? "Sponsor" : "Coordinator"}
      </p>
      <p className="text-sm text-muted-foreground">
        {comment.createdAt.slice(0, 10)} ·{" "}
        {comment.visibleToSponsor
          ? "Visible to Sponsors"
          : "Private to Coordinators"}
        {comment.kind === "CHANGE_REQUEST"
          ? comment.resolvedAt
            ? " · Change request resolved"
            : " · Open change request"
          : ""}
      </p>
      {comment.sectionId && (
        <p className="text-sm">
          Section:{" "}
          {report.sections.find((section) => section.id === comment.sectionId)
            ?.title ?? "Section from an earlier version"}
        </p>
      )}
      <p className="my-3 whitespace-pre-wrap break-words">{comment.body}</p>
    </>
  );
}
function Replies({
  root,
  report,
  busy,
}: {
  root: ReportComment;
  report: Report;
  busy: boolean;
}) {
  const user = useSession(),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [
      "report-feedback",
      report.id,
      user.id,
      user.role,
      "replies",
      root.id,
      page,
    ],
    queryFn: async () =>
      parseCommentPage(
        await api(
          `/reports/${report.id}/comments?parentId=${root.id}&page=${page}&pageSize=20`,
        ),
        user.role,
        root.id,
      ),
  });
  return (
    <div
      className="my-4 grid gap-3 border-l border-border pl-4"
      role="group"
      aria-label={`Replies to ${root.author.name}`}
    >
      <Pending active={query.isPending} />
      <Feedback error={query.error} />
      {query.isError && (
        <Button variant="outline" onClick={() => query.refetch()}>
          Retry replies
        </Button>
      )}
      {query.data && (
        <>
          <ul className="grid gap-3">
            {query.data.data.length ? (
              query.data.data.map((comment) => (
                <li key={comment.id} className="min-w-0">
                  <CommentContent comment={comment} report={report} />
                </li>
              ))
            ) : (
              <li>No replies yet.</li>
            )}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={busy || query.isFetching || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous replies
            </Button>
            <p>
              Reply page {page} of {Math.max(1, query.data.meta.totalPages)}
            </p>
            <Button
              variant="outline"
              disabled={
                busy || query.isFetching || page >= query.data.meta.totalPages
              }
              onClick={() => setPage((value) => value + 1)}
            >
              Next replies
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
function FeedbackFeed({ report }: { report: Report }) {
  const user = useSession(),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [body, setBody] = useState(""),
    [sectionId, setSectionId] = useState(""),
    [replyBodies, setReplyBodies] = useState<Record<string, string>>({}),
    [opened, setOpened] = useState<Record<string, boolean>>({}),
    [replying, setReplying] = useState<Record<string, boolean>>({}),
    [flagBody, setFlagBody] = useState(""),
    [flagReview, setFlagReview] = useState(false),
    [resolveId, setResolveId] = useState<string>(),
    [invalid, setInvalid] = useState<string>(),
    [notice, setNotice] = useState("");
  const hasDraft = !!(
    body ||
    flagBody ||
    Object.values(replyBodies).some(Boolean)
  );
  useEffect(() => {
    if (!hasDraft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDraft]);
  const query = useQuery({
    queryKey: ["report-feedback", report.id, user.id, user.role, "roots", page],
    queryFn: async () =>
      parseCommentPage(
        await api(`/reports/${report.id}/comments?page=${page}&pageSize=20`),
        user.role,
      ),
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["report-feedback", report.id] }),
      cache.invalidateQueries({ queryKey: ["reports"] }),
    ]);
  };
  const post = useMutation({
    mutationFn: async (input: ReturnType<typeof commentPayload>) => {
      if (report.archivedAt) throw new Error("Archived report is read only");
      const comment = parseComment(
        (
          await api<{ data: unknown }>(`/reports/${report.id}/comments`, {
            method: "POST",
            body: input,
          })
        ).data,
        user.role,
      );
      if (
        comment.kind !== "COMMENT" ||
        comment.parentId !== (input.parentId ?? null) ||
        (!input.parentId && comment.sectionId !== (input.sectionId ?? null)) ||
        comment.author.id !== user.id ||
        comment.body !== input.body
      )
        throw new Error("Unexpected comment acknowledgement");
      return comment;
    },
    onSuccess: async (_comment, input) => {
      if (input.parentId) {
        setReplyBodies((previous) => ({ ...previous, [input.parentId!]: "" }));
        setOpened((previous) => ({ ...previous, [input.parentId!]: true }));
      } else {
        setBody("");
        setSectionId("");
        setPage(1);
      }
      setNotice("Comment recorded.");
      await refresh();
    },
  });
  const flag = useMutation({
    mutationFn: async (message: string) => {
      if (report.archivedAt || user.role !== "SPONSOR")
        throw new Error("Change request unavailable");
      const response = await api<{
        data: { id: string; status: string; comment: unknown };
      }>(`/reports/${report.id}/flag`, {
        method: "POST",
        body: { body: message },
      });
      const comment = parseComment(response.data.comment, user.role);
      if (
        response.data.id !== report.id ||
        response.data.status !== "CHANGES_REQUESTED" ||
        comment.kind !== "CHANGE_REQUEST" ||
        comment.parentId !== null ||
        comment.resolvedAt !== null ||
        !comment.visibleToSponsor ||
        comment.author.id !== user.id ||
        comment.body !== message
      )
        throw new Error("Unexpected change request acknowledgement");
      return comment;
    },
    onSuccess: async () => {
      setFlagBody("");
      setFlagReview(false);
      setNotice("Change request recorded.");
      await refresh();
    },
  });
  const resolve = useMutation({
    mutationFn: async (id: string) => {
      if (report.archivedAt || user.role !== "COORDINATOR")
        throw new Error("Resolution unavailable");
      const comment = parseComment(
        (
          await api<{ data: unknown }>(
            `/reports/${report.id}/comments/${id}/resolve`,
            { method: "POST", body: {} },
          )
        ).data,
        user.role,
      );
      if (
        comment.id !== id ||
        comment.kind !== "CHANGE_REQUEST" ||
        !comment.resolvedAt
      )
        throw new Error("Unexpected resolution acknowledgement");
      return comment;
    },
    onSuccess: async () => {
      setResolveId(undefined);
      setNotice("Change request resolved.");
      await refresh();
    },
  });
  const busy = post.isPending || flag.isPending || resolve.isPending,
    archived = !!report.archivedAt;
  const prepare = (message: string, parentId?: string, anchor?: string) => {
    setInvalid(undefined);
    setNotice("");
    post.reset();
    flag.reset();
    resolve.reset();
    try {
      post.mutate(commentPayload(message, parentId, anchor));
    } catch {
      setInvalid(
        "Enter a message of up to 5,000 characters and choose a valid section.",
      );
    }
  };
  const privateDraft =
    user.role === "COORDINATOR" && ["DRAFT", "FINAL"].includes(report.status);
  return (
    <div className="mt-4 grid gap-4">
      <p className="text-muted-foreground">
        Private threads stay private after sending. Replies follow the server’s
        visibility rules. A failed post keeps your message; it is never retried
        automatically. Save messages before leaving; drafts stay only on this
        page.
      </p>
      {archived && hasDraft && (
        <section
          aria-label="Unsent discussion drafts"
          className={`${styles.panel} grid gap-4`}
        >
          <h3 className="font-semibold">Unsent discussion drafts</h3>
          <p>
            These messages have not been posted. Copy them, discard them here,
            or unarchive the report before posting. They stay only on this page.
          </p>
          {body && (
            <p className="whitespace-pre-wrap break-words">Comment: {body}</p>
          )}
          {flagBody && (
            <p className="whitespace-pre-wrap break-words">
              Change request: {flagBody}
            </p>
          )}
          {Object.entries(replyBodies)
            .filter(([, message]) => message)
            .map(([parent, message]) => (
              <p key={parent} className="whitespace-pre-wrap break-words">
                Reply: {message}
              </p>
            ))}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBody("");
              setSectionId("");
              setFlagBody("");
              setFlagReview(false);
              setReplyBodies({});
            }}
          >
            Discard unsent discussion drafts
          </Button>
        </section>
      )}
      {archived ? (
        <p role="status">Archived report discussions are read only.</p>
      ) : (
        <form
          className={`${styles.panel} grid gap-4`}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            prepare(body, undefined, sectionId || undefined);
          }}
        >
          <h3 className="font-semibold">Add a comment</h3>
          <p>
            {privateDraft
              ? "This comment is private to Coordinators."
              : "New comments are visible to Sponsors when feedback is available. The server may temporarily restrict posting."}
          </p>
          <Field id="report-comment-body" label="Comment message">
            <textarea
              id="report-comment-body"
              className={area}
              maxLength={5000}
              value={body}
              disabled={busy}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          <Field id="report-comment-section" label="Section reference">
            <Select
              id="report-comment-section"
              value={sectionId}
              disabled={busy}
              onChange={(event) => setSectionId(event.target.value)}
            >
              <option value="">Whole report</option>
              {report.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </Select>
          </Field>
          <Button disabled={busy}>Post comment</Button>
        </form>
      )}
      {user.role === "SPONSOR" && !archived && (
        <form
          className={`${styles.panel} grid gap-4`}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setNotice("");
            post.reset();
            flag.reset();
            resolve.reset();
            const result = feedbackBody.safeParse(flagBody);
            setInvalid(
              result.success ? undefined : result.error.issues[0]?.message,
            );
            if (result.success) setFlagReview(true);
          }}
        >
          <h3 className="font-semibold">Request report changes</h3>
          <Field id="report-flag-body" label="Required change-request message">
            <textarea
              id="report-flag-body"
              className={area}
              maxLength={5000}
              value={flagBody}
              disabled={busy}
              onChange={(event) => {
                setFlagBody(event.target.value);
                setFlagReview(false);
              }}
            />
          </Field>
          <Button disabled={busy}>Flag for changes</Button>
          {flagReview && (
            <div
              role="group"
              aria-label="Confirm change request"
              className="grid gap-3"
            >
              <p>
                This records an open change request and notifies the report’s
                Coordinators.
              </p>
              <p className="whitespace-pre-wrap break-words">
                {flagBody.trim()}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => flag.mutate(feedbackBody.parse(flagBody))}
                >
                  Confirm change request
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setFlagReview(false)}
                >
                  Back to message
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
      {invalid && (
        <p className="field-error" role="alert">
          {invalid}
        </p>
      )}
      <Feedback error={post.error || flag.error || resolve.error} />
      <Pending active={busy} />
      {notice && <p role="status">{notice}</p>}
      <Pending active={query.isPending} />
      <Feedback error={query.error} />
      {query.isError && (
        <Button variant="outline" onClick={() => query.refetch()}>
          Retry comments
        </Button>
      )}
      {query.data && (
        <>
          <div className="grid gap-4">
            {query.data.data.length ? (
              query.data.data.map((comment) => (
                <article
                  key={comment.id}
                  className={`${styles.panel} grid gap-4`}
                >
                  <CommentContent comment={comment} report={report} />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setOpened((previous) => ({
                          ...previous,
                          [comment.id]: !previous[comment.id],
                        }))
                      }
                    >
                      {opened[comment.id]
                        ? "Hide replies"
                        : `View replies (${comment.replyCount})`}
                    </Button>
                    {!archived && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setReplying((previous) => ({
                            ...previous,
                            [comment.id]: true,
                          }));
                          setOpened((previous) => ({
                            ...previous,
                            [comment.id]: true,
                          }));
                        }}
                      >
                        Reply to thread
                      </Button>
                    )}
                    {user.role === "COORDINATOR" &&
                      comment.kind === "CHANGE_REQUEST" &&
                      !comment.resolvedAt &&
                      !archived && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setResolveId(comment.id);
                            post.reset();
                            flag.reset();
                            resolve.reset();
                          }}
                        >
                          Resolve change request
                        </Button>
                      )}
                  </div>
                  {opened[comment.id] && (
                    <Replies root={comment} report={report} busy={busy} />
                  )}
                  {!archived &&
                    (replying[comment.id] || !!replyBodies[comment.id]) && (
                      <form
                        className="mt-4 grid gap-3"
                        noValidate
                        onSubmit={(event) => {
                          event.preventDefault();
                          prepare(replyBodies[comment.id] ?? "", comment.id);
                        }}
                      >
                        <p>
                          {privateDraft || !comment.visibleToSponsor
                            ? "This reply is private to Coordinators."
                            : "This reply follows the thread’s Sponsor visibility."}
                        </p>
                        <Field
                          id={`reply-${comment.id}`}
                          label={`Reply to ${comment.author.name}`}
                        >
                          <textarea
                            id={`reply-${comment.id}`}
                            className={area}
                            maxLength={5000}
                            value={replyBodies[comment.id] ?? ""}
                            disabled={busy}
                            onChange={(event) =>
                              setReplyBodies((previous) => ({
                                ...previous,
                                [comment.id]: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Button disabled={busy}>Post reply</Button>
                      </form>
                    )}
                  {resolveId === comment.id &&
                    user.role === "COORDINATOR" &&
                    !archived && (
                      <div
                        role="group"
                        aria-label="Confirm resolution"
                        className="mt-4 grid gap-3"
                      >
                        <p>
                          Resolve this change request? The server recomputes the
                          report’s effective status.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            disabled={busy}
                            onClick={() => resolve.mutate(comment.id)}
                          >
                            Confirm resolution
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setResolveId(undefined)}
                          >
                            Keep request open
                          </Button>
                        </div>
                      </div>
                    )}
                </article>
              ))
            ) : (
              <p>No comments yet.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={busy || query.isFetching || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous comments
            </Button>
            <p>
              Comment page {page} of {Math.max(1, query.data.meta.totalPages)}
            </p>
            <Button
              variant="outline"
              disabled={
                busy || query.isFetching || page >= query.data.meta.totalPages
              }
              onClick={() => setPage((value) => value + 1)}
            >
              Next comments
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
export function ReportFeedback({ report }: { report: Report }) {
  const user = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#comments") setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  return (
    <section
      id="comments"
      aria-labelledby="report-comments-heading"
      className="my-7"
    >
      <h2 id="report-comments-heading">Comments and change requests</h2>
      {open ? (
        <FeedbackFeed
          key={`${report.id}-${user.id}-${user.role}`}
          report={report}
        />
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Show comments and feedback
        </Button>
      )}
    </section>
  );
}
