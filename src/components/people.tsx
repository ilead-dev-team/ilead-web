"use client";
import styles from "./administration.module.css";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import {
  acknowledgeInvitation,
  canManageInvitation,
  deliveryMessage,
  formatPeopleTime,
  invitationInput,
  parseInvitations,
  parsePeople,
  roleHelp,
  roleLabels,
  uncertainResult,
  type Invitation,
  type InvitationInput,
  type InvitationRow,
  type InvitationStatus,
} from "@/lib/people";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";
const viewLabels = {
  FACILITATOR: "Facilitators",
  COORDINATOR: "Coordinators",
  SPONSOR: "Sponsors",
  UNREGISTERED: "Unregistered",
  INVITATIONS: "Invitations",
};
type View = keyof typeof viewLabels;
function Pagination({
  page,
  totalPages,
  busy,
  change,
}: {
  page: number;
  totalPages: number;
  busy: boolean;
  change: (page: number) => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={busy || page <= 1}
        onClick={() => change(page - 1)}
      >
        Previous page
      </Button>
      <p>
        Page {page} of {Math.max(1, totalPages)}
      </p>
      <Button
        variant="outline"
        disabled={busy || page >= totalPages}
        onClick={() => change(page + 1)}
      >
        Next page
      </Button>
    </div>
  );
}
function PeopleList({ view }: { view: Exclude<View, "INVITATIONS"> }) {
  const user = useSession();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["people", user.id, user.role, view, q, page],
    queryFn: async ({ signal }) =>
      parsePeople(
        await api(
          `${view === "UNREGISTERED" ? "/users/unregistered-facilitators" : "/users"}?${new URLSearchParams({ page: String(page), pageSize: "20", ...(view === "UNREGISTERED" ? {} : { role: view, ...(q ? { q } : {}) }) })}`,
          { signal },
        ),
        page,
        view,
      ),
    staleTime: 0,
  });
  return (
    <section className={styles.section} aria-label={viewLabels[view]}>
      <h2 className="my-4 text-lg font-semibold">{viewLabels[view]}</h2>
      {view !== "UNREGISTERED" ? (
        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
            setPage(1);
          }}
        >
          <Field id="people-search" label="Search name or email">
            <Input
              id="people-search"
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Button className="mb-5" variant="outline">
            Search people
          </Button>
        </form>
      ) : (
        <p className="my-4 text-muted-foreground">
          Verified active Facilitators without an active registered roundtable,
          including roundtables moved to trash. No message is sent from this
          list.
        </p>
      )}
      <Pending active={query.isFetching} />
      {query.isError && (
        <>
          <Feedback error={query.error} />
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry people
          </Button>
        </>
      )}
      {query.data && !query.isError && (
        <>
          {query.data.data.length === 0 ? (
            <p className="notice">
              {q
                ? "No people match this search on this page."
                : "No people in this view on this page."}
            </p>
          ) : (
            <section aria-label="People directory">
              <h3 className="mb-5 font-semibold">
                {viewLabels[view]} · {query.data.meta.total} total
              </h3>
              <ul className={styles.recordGrid}>
                {query.data.data.map((person) => (
                  <li key={person.id} className={styles.record}>
                    <h4 className={styles.recordTitle}>{person.name}</h4>
                    <p className={styles.recordMeta}>
                      {roleLabels[person.role]}
                      {person.classYear
                        ? ` · Year ${person.classYear.slice(-1)}`
                        : ""}
                    </p>
                    <details className={styles.personDetails}>
                      <summary>
                        View details
                        <span className="sr-only"> for {person.name}</span>
                      </summary>
                      <p className="break-words text-muted-foreground">
                        {person.email}
                      </p>
                      <p>
                        {person.status === "ACTIVE" ? "Active" : "Deactivated"}
                        {" · "}
                        {person.emailVerifiedAt
                          ? "Email verified"
                          : "Email not verified"}
                      </p>
                      {person.role === "FACILITATOR" && (
                        <p>
                          {person.hasRoundtable
                            ? "Registered"
                            : "Not registered"}
                        </p>
                      )}
                      <p className={styles.recordMeta}>
                        Joined {formatPeopleTime(person.createdAt)} Kigali time
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Pagination
            page={page}
            totalPages={query.data.meta.totalPages}
            busy={query.isFetching}
            change={setPage}
          />
        </>
      )}
    </section>
  );
}
function Review({
  title,
  pending,
  close,
  restoreFocus,
  children,
}: {
  title: string;
  pending: boolean;
  close: () => void;
  restoreFocus: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      restoreFocus();
    };
  }, [restoreFocus]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="invitation-review-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 text-card-foreground backdrop:bg-foreground/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) close();
      }}
    >
      <h2 id="invitation-review-title" className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {children}
      <Button
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
type Action =
  | { kind: "create"; input: InvitationInput }
  | { kind: "resend" | "revoke"; row: InvitationRow };
const mailbox = z.object({
  data: z.object({
    connected: z.boolean(),
    address: z.email().nullable(),
    reconnectRequired: z.boolean(),
    provider: z.enum(["gmail", "brevo"]).nullable().optional(),
    scope: z.enum(["PROGRAM", "COORDINATOR"]).optional(),
  }),
});
function Invitations() {
  const user = useSession(),
    cache = useQueryClient();
  const opener = useRef<HTMLElement | null>(null);
  const inviteButton = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const target = opener.current?.isConnected
        ? opener.current
        : inviteButton.current;
      target?.focus();
    });
  }, []);
  const [page, setPage] = useState(1),
    [status, setStatus] = useState<InvitationStatus | "">("PENDING"),
    [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<InvitationInput["role"]>("FACILITATOR"),
    [invalid, setInvalid] = useState(""),
    [review, setReview] = useState<Action | null>(null),
    [result, setResult] = useState<Invitation | null>(null),
    [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["invitations", user.id, user.role, status, page],
    queryFn: async ({ signal }) =>
      parseInvitations(
        await api(
          `/invitations?${new URLSearchParams({ page: String(page), pageSize: "20", ...(status ? { status } : {}) })}`,
          { signal },
        ),
        page,
        status,
      ),
    staleTime: 0,
  });
  const sender = useQuery({
    queryKey: ["mailbox", "people", user.id],
    queryFn: async ({ signal }) =>
      mailbox.parse(await api("/mailbox", { signal })).data,
    staleTime: 0,
  });
  const action = useMutation({
    retry: false,
    mutationFn: async (change: Action) => {
      if (user.role !== "COORDINATOR")
        throw new Error("Coordinator access required");
      if (change.kind === "create")
        return acknowledgeInvitation(
          (
            await api<{ data: unknown }>("/invitations", {
              method: "POST",
              body: change.input,
            })
          ).data,
          change.input,
        );
      if (!canManageInvitation(change.row))
        throw new Error("This invitation is closed");
      if (change.kind === "resend")
        return acknowledgeInvitation(
          (
            await api<{ data: unknown }>(
              `/invitations/${change.row.id}/resend`,
              { method: "POST", body: {} },
            )
          ).data,
          { email: change.row.email, role: change.row.role },
          change.row.id,
        );
      let responseStatus = 0;
      await api(`/invitations/${change.row.id}`, {
        method: "DELETE",
        body: {},
        onResponse: (response) => {
          responseStatus = response.status;
        },
      });
      if (responseStatus !== 204)
        throw new Error("Unconfirmed invitation revocation");
      return null;
    },
    onSuccess: async (value, change) => {
      setReview(null);
      setResult(value);
      setNotice(
        change.kind === "revoke"
          ? `Invitation revoked for ${change.row.email}. Its link can no longer be accepted.`
          : "",
      );
      if (change.kind === "create") {
        setOpen(false);
        setEmail("");
        setRole("FACILITATOR");
        setStatus("PENDING");
        setPage(1);
      }
      await cache.invalidateQueries({ queryKey: ["invitations", user.id] });
    },
  });
  useEffect(() => {
    if (action.isSuccess && !action.isPending && !review) restoreFocus();
  }, [action.isSuccess, action.isPending, review, restoreFocus]);
  const start = (value: Action) => {
    opener.current = document.activeElement as HTMLElement | null;
    action.reset();
    setResult(null);
    setNotice("");
    setReview(value);
  };
  const refresh = async () => {
    const refreshed = await query.refetch();
    if (!refreshed.isError) {
      setReview(null);
      action.reset();
      setNotice(
        "Invitations refreshed. Check the existing invitation before trying the action again.",
      );
    }
  };
  const target = review?.kind === "create" ? review.input : review?.row;
  return (
    <section className={styles.section} aria-label="Invitations">
      <div className="my-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Invitations</h2>
        <Button
          ref={inviteButton}
          disabled={action.isPending || !!review}
          onClick={() => {
            setOpen(true);
            setResult(null);
            setNotice("");
          }}
        >
          Invite user
        </Button>
      </div>
      <p className="text-muted-foreground">
        A single-use invitation is valid for seven days. Email is attempted
        through the configured account email service; provider acceptance does
        not prove inbox delivery.
      </p>
      <Pending active={sender.isFetching} />
      {sender.isError ? (
        <>
          <Feedback error={sender.error} />
          <Button variant="outline" onClick={() => sender.refetch()}>
            Retry mailbox status
          </Button>
        </>
      ) : (
        sender.data && (
          <p className="notice">
            {sender.data.scope === "PROGRAM"
              ? sender.data.connected
                ? `Program sender configured: ${sender.data.address}`
                : "Program email is unavailable or sending is disabled. Ask the deployment custodian to complete setup, then resend."
              : sender.data.connected
                ? `Connected mailbox: ${sender.data.address}`
                : sender.data.reconnectRequired
                  ? "Reconnect your mailbox before sending invitation emails."
                  : "No mailbox connected. An invitation can be stored, but its email cannot be queued until you connect a mailbox and resend."}{" "}
            <Link href="/mailbox">Manage account email</Link>
          </p>
        )
      )}
      {open && (
        <form
          className={`${styles.panel} ${styles.form}`}
          noValidate
          aria-label="Invite user"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = invitationInput.safeParse({ email, role });
            if (!parsed.success) {
              setInvalid(
                parsed.error.issues[0]?.message ??
                  "Check the invitation details.",
              );
              return;
            }
            setInvalid("");
            start({ kind: "create", input: parsed.data });
          }}
        >
          <h3 className="font-semibold">New invitation</h3>
          <Field
            id="invite-email"
            label="Email address"
            error={invalid || undefined}
          >
            <Input
              id="invite-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              disabled={action.isPending || !!review}
              aria-invalid={!!invalid}
              aria-describedby={invalid ? "invite-email-error" : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setInvalid("");
              }}
            />
          </Field>
          <Field id="invite-role" label="Invitation role">
            <Select
              id="invite-role"
              value={role}
              disabled={action.isPending || !!review}
              onChange={(event) =>
                setRole(event.target.value as InvitationInput["role"])
              }
            >
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-sm text-muted-foreground">{roleHelp[role]}</p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={action.isPending || !!review}>
              Review invitation
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={action.isPending || !!review}
              onClick={() => setOpen(false)}
            >
              Close invitation form
            </Button>
          </div>
        </form>
      )}
      {result && (
        <div role="status" className="notice">
          <p className="font-semibold">
            Invitation stored for {result.email} · {roleLabels[result.role]}
          </p>
          <p>{deliveryMessage(result.deliveryStatus)}</p>
          {result.deliveryStatus === "FAILED" && (
            <Link href="/mailbox">Check mailbox connection</Link>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className={styles.search}>
        <Field id="invitation-status" label="Invitation status">
          <Select
            id="invitation-status"
            value={status}
            disabled={action.isPending || !!review}
            onChange={(event) => {
              setStatus(event.target.value as InvitationStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"].map((value) => (
              <option key={value} value={value}>
                {value[0] + value.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          className="mb-5"
          variant="outline"
          disabled={action.isPending || query.isFetching || !!review}
          onClick={() => query.refetch()}
        >
          Refresh invitations
        </Button>
      </div>
      <Pending active={query.isFetching} />
      {query.isError && (
        <>
          <Feedback error={query.error} />
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry invitations
          </Button>
        </>
      )}
      {query.data && !query.isError && (
        <>
          {query.data.data.length === 0 ? (
            <p className="notice">No invitations in this view on this page.</p>
          ) : (
            <div
              className={styles.tableViewport}
              role="region"
              aria-label="Invitations table"
              tabIndex={0}
            >
              <table className={styles.table}>
                <caption className="p-4 text-left">
                  Invitations · {query.data.meta.total} total · Dates in Kigali
                </caption>
                <thead className="border-y border-border bg-muted">
                  <tr>
                    {[
                      "Recipient and role",
                      "Status",
                      "Expires",
                      "Email delivery",
                      "Actions",
                    ].map((label) => (
                      <th className="p-4" scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((row) => (
                    <tr key={row.id} className="border-b border-border">
                      <td className="max-w-64 break-all p-4">
                        {row.email}
                        <p className="text-muted-foreground">
                          {roleLabels[row.role]}
                        </p>
                      </td>
                      <td className="p-4">
                        {row.status[0] + row.status.slice(1).toLowerCase()}
                      </td>
                      <td className="p-4">{formatPeopleTime(row.expiresAt)}</td>
                      <td className="max-w-72 p-4">
                        <p>
                          {row.deliveryStatus === "ACCEPTED"
                            ? "Provider accepted"
                            : row.deliveryStatus === "PENDING"
                              ? "Queued"
                              : row.deliveryStatus === "FAILED"
                                ? "Not sent"
                                : "Cancelled"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {deliveryMessage(row.deliveryStatus)}
                        </p>
                        <p className="mt-2 text-xs">
                          Attempts: {row.deliveryAttempts}
                          {row.deliveryAcceptedAt
                            ? ` · Provider accepted ${formatPeopleTime(row.deliveryAcceptedAt)}`
                            : ""}
                        </p>
                      </td>
                      <td className="p-4">
                        {canManageInvitation(row) ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              disabled={action.isPending || !!review || open}
                              onClick={() => start({ kind: "resend", row })}
                              aria-label={`Resend invitation to ${row.email}`}
                            >
                              Resend
                            </Button>
                            <Button
                              variant="outline"
                              disabled={action.isPending || !!review || open}
                              onClick={() => start({ kind: "revoke", row })}
                              aria-label={`Revoke invitation for ${row.email}`}
                            >
                              Revoke
                            </Button>
                          </div>
                        ) : (
                          <span>No actions available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={page}
            totalPages={query.data.meta.totalPages}
            busy={query.isFetching || action.isPending || !!review}
            change={setPage}
          />
        </>
      )}
      {review && target && (
        <Review
          title={
            review.kind === "create"
              ? "Review new invitation"
              : review.kind === "resend"
                ? "Review invitation resend"
                : "Review invitation revocation"
          }
          pending={action.isPending}
          restoreFocus={restoreFocus}
          close={() => setReview(null)}
        >
          <p className="break-all font-medium">{target.email}</p>
          <p className="my-3">
            {roleLabels[target.role]} · {roleHelp[target.role]}
          </p>
          <p className="my-3 text-sm">
            {review.kind === "create"
              ? "This grants the selected role when the recipient accepts. An email will be attempted through the configured account email service. Check the address and role before continuing."
              : review.kind === "resend"
                ? "This replaces the old invitation link and extends validity by seven days. The old link stops working. Another email will be attempted through the configured account email service."
                : "The invitation link will stop working. Emails already accepted by the provider cannot be unsent. This does not delete an existing account."}
          </p>
          <Feedback error={action.error} />
          <Pending active={action.isPending} />
          {action.isError && (
            <>
              {uncertainResult(action.error) && (
                <p className="notice">
                  The result is unconfirmed; the action may already have
                  completed. Refresh and inspect the invitation list before
                  trying again. This action is not repeated automatically.
                </p>
              )}
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={refresh}
              >
                Refresh and inspect invitations
              </Button>
              {query.isError && <Feedback error={query.error} />}
            </>
          )}
          <Button
            className="mt-4"
            disabled={
              action.isPending ||
              (action.isError && uncertainResult(action.error))
            }
            onClick={() => action.mutate(review)}
          >
            {review.kind === "create"
              ? "Create and email invitation"
              : review.kind === "resend"
                ? "Replace link and resend"
                : "Revoke invitation"}
          </Button>
        </Review>
      )}
    </section>
  );
}
export function People() {
  const user = useSession();
  const [view, setView] = useState<View>("FACILITATOR");
  if (user.role !== "COORDINATOR") return null;
  return (
    <div className={styles.page}>
      <header>
        <h1>People</h1>
        <p className="text-muted-foreground">
          Inspect program accounts and manage invitation-only access.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link href="/mailbox">Program email</Link>
          <Link href="/people/recovery">Account recovery</Link>
        </div>
      </header>
      <nav aria-label="People views" className={styles.views}>
        {Object.entries(viewLabels).map(([key, label]) => (
          <Button
            key={key}
            variant={view === key ? "default" : "outline"}
            aria-pressed={view === key}
            onClick={() => setView(key as View)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {view === "INVITATIONS" ? (
        <Invitations />
      ) : (
        <PeopleList key={view} view={view} />
      )}
    </div>
  );
}
