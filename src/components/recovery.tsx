"use client";
import styles from "./administration.module.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  canSendRecovery,
  parseRecovery,
  parseRecoveryDetail,
  recoveryAcknowledgement,
  recoveryDeliveryMessage,
  verifyCoordinatorAccount,
  type RecoveryRequest,
} from "@/lib/account-delivery";
import { formatPeopleTime } from "@/lib/people";
import { Button } from "./ui/button";
import { containDialogFocus } from "./ui/dialog-focus";
import { Feedback, Pending } from "./account/feedback";
import { useSession } from "./session";
export function Recovery({ requestId }: { requestId?: string | null }) {
  const user = useSession();
  const [page, setPage] = useState(1),
    [review, setReview] = useState<RecoveryRequest | null>(null);
  const keys = useRef(new Map<string, string>()),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    refreshButton = useRef<HTMLButtonElement>(null);
  const query = useQuery({
    queryKey: [
      "recovery",
      user.id,
      requestId === null ? "invalid" : (requestId ?? "queue"),
      page,
    ],
    enabled: requestId !== null,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (requestId) {
        const detail = parseRecoveryDetail(
          await api(`/account-recovery/${requestId}`),
          requestId,
        );
        return {
          data: [detail],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          detail,
        };
      }
      return {
        ...parseRecovery(
          await api(`/account-recovery?page=${page}&pageSize=20`),
          page,
        ),
        detail: null,
      };
    },
  });
  function restoreFocus() {
    if (trigger.current?.isConnected && !trigger.current.disabled)
      trigger.current.focus();
    else refreshButton.current?.focus();
  }
  const send = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      await verifyCoordinatorAccount(user.id);
      let key = keys.current.get(id);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(id, key);
      }
      const status = recoveryAcknowledgement.parse(
        await api(`/account-recovery/${id}/send-reset`, {
          method: "POST",
          body: {},
          headers: { "Idempotency-Key": key },
        }),
      ).data.deliveryStatus;
      // An unverified response must retain this key so an explicit retry refers
      // to the same delivery, rather than issuing another reset link.
      keys.current.delete(id);
      return status;
    },
    onSuccess: async () => {
      await query.refetch();
      setReview(null);
    },
  });
  useEffect(() => {
    if (send.isSuccess && !send.isPending) {
      dialog.current?.close();
      restoreFocus();
    }
  }, [send.isSuccess, send.isPending]);
  const busy = send.isPending;
  return (
    <div className={styles.page}>
      <h1>Account recovery</h1>
      <p className="text-muted-foreground">
        Send a one-hour reset link to the account’s stored email through the
        configured <Link href="/mailbox">account email service</Link>.
      </p>
      {requestId !== undefined && (
        <p className="my-4">
          <Link href="/people/recovery">Back to recovery queue</Link>
        </p>
      )}
      {requestId === null && (
        <p className="notice" role="alert">
          This recovery link is invalid. Open the recovery queue to find the
          request.
        </p>
      )}
      <Feedback error={query.error} />
      <Pending
        active={requestId !== null && (query.isPending || query.isFetching)}
      />
      {query.data?.detail && !query.isError && (
        <section aria-label="Recovery request details" className={styles.panel}>
          <h2 className="text-xl font-semibold">Request details</h2>
          <p className="break-all text-sm">Request {query.data.detail.id}</p>
          <p>
            Issued:{" "}
            {query.data.detail.issuedAt
              ? `${formatPeopleTime(query.data.detail.issuedAt)} Kigali time`
              : "Not issued"}
          </p>
          <p>
            Resolved:{" "}
            {query.data.detail.resolvedAt
              ? `${formatPeopleTime(query.data.detail.resolvedAt)} Kigali time`
              : "Not resolved"}
          </p>
          {!query.data.detail.mailboxConnected && (
            <p className="notice">
              Account email is unavailable. Check the configured sender before
              sending a reset email.{" "}
              <Link href="/mailbox">Open email settings</Link>, then refresh
              this request.
            </p>
          )}
          <h3 className="mt-4 font-semibold">Delivery history</h3>
          {query.data.detail.deliveries.length === 0 ? (
            <p>No delivery attempts.</p>
          ) : (
            <ol className="space-y-3">
              {query.data.detail.deliveries.map((delivery) => (
                <li
                  key={delivery.id}
                  className="break-words border-t border-border pt-2"
                >
                  <p>{recoveryDeliveryMessage(delivery.status)}</p>
                  <p>
                    Attempts: {delivery.attempts} · Expires{" "}
                    {formatPeopleTime(delivery.expiresAt)} Kigali time
                  </p>
                  {delivery.acceptedAt && (
                    <p>
                      Provider accepted {formatPeopleTime(delivery.acceptedAt)}{" "}
                      Kigali time
                    </p>
                  )}
                  {delivery.lastErrorCode && (
                    <p>Error code: {delivery.lastErrorCode}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      {query.isError && (
        <Button
          disabled={busy || query.isFetching}
          onClick={() => query.refetch()}
        >
          Try again
        </Button>
      )}
      {send.isSuccess && (
        <p className="notice" role="status">
          {recoveryDeliveryMessage(send.data)}
        </p>
      )}
      {query.data &&
        !query.isError &&
        (query.data.data.length === 0 ? (
          <p className="notice">No recovery requests on this page.</p>
        ) : (
          <div
            role="region"
            aria-label="Recovery requests table"
            tabIndex={0}
            className={styles.tableViewport}
          >
            <table className={styles.table}>
              <caption className="p-3 text-left">
                Recovery requests · {query.data.meta.total} total
              </caption>
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th scope="col" className="p-3">
                    Account
                  </th>
                  <th scope="col" className="p-3">
                    Status
                  </th>
                  <th scope="col" className="p-3">
                    Delivery
                  </th>
                  <th scope="col" className="p-3">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="max-w-xs break-words p-3">
                      {row.user.name}
                      <br />
                      <span className="text-muted-foreground">
                        {row.user.email}
                      </span>
                      <p className="mt-1 text-xs">
                        Requested {formatPeopleTime(row.requestedAt)} Kigali
                        time
                      </p>
                      {!requestId && (
                        <Link href={`/people/recovery?request=${row.id}`}>
                          View request
                        </Link>
                      )}
                    </td>
                    <td className="p-3">{row.status}</td>
                    <td className="p-3">
                      {row.deliveries[0]?.status ?? "Not issued"}
                    </td>
                    <td className="p-3">
                      <Button
                        aria-label={`Send reset email to ${row.user.name}`}
                        disabled={
                          busy ||
                          query.isFetching ||
                          query.data.detail?.mailboxConnected === false ||
                          !canSendRecovery(row, query.dataUpdatedAt)
                        }
                        onClick={(event) => {
                          trigger.current = event.currentTarget;
                          send.reset();
                          setReview(row);
                          dialog.current?.showModal();
                        }}
                      >
                        Send reset email
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {requestId !== null && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={busy || query.isFetching || page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page}
            {query.data && !query.isError
              ? ` of ${Math.max(1, query.data.meta.totalPages)}`
              : ""}
          </span>
          <Button
            variant="outline"
            disabled={
              busy ||
              query.isFetching ||
              !query.data ||
              query.isError ||
              page >= query.data.meta.totalPages
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
          <Button
            ref={refreshButton}
            variant="outline"
            disabled={busy || query.isFetching}
            onClick={() => query.refetch()}
          >
            Refresh status
          </Button>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="send-reset-title"
        aria-describedby="send-reset-help"
        onKeyDown={containDialogFocus}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        onClose={restoreFocus}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 text-card-foreground backdrop:bg-foreground/30"
      >
        <h2 id="send-reset-title" className="text-xl font-semibold">
          Send reset email?
        </h2>
        <p id="send-reset-help" className="my-4 break-words">
          Send a one-hour reset link to {review?.user.name} at{" "}
          {review?.user.email}. The recipient cannot be changed here. The email
          uses the configured account email service.
        </p>
        <Feedback error={send.error} />
        <Pending active={busy} />
        {send.isError && (
          <p className="my-3 text-sm">
            If the result was uncertain, retrying here uses the same delivery
            request. You can also cancel and refresh its status. Check your
            account email status before trying again after a delivery failure.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </Button>
          <Button
            disabled={busy || !review}
            onClick={() => {
              if (review) send.mutate(review.id);
            }}
          >
            {busy
              ? "Sending…"
              : send.isError
                ? "Retry same request"
                : "Confirm send"}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
