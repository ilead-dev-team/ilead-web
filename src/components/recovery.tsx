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
  const resetButton = (row: RecoveryRequest) => (
    <Button
      aria-label={`Send reset email to ${row.user.name}`}
      disabled={
        busy ||
        query.isFetching ||
        query.data?.detail?.mailboxConnected === false ||
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
  );
  return (
    <div className={styles.page}>
      <h1>Account recovery</h1>

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
          <p className="break-words font-semibold">
            Password recovery for {query.data.detail.user.name}
          </p>
          <p className="break-words text-sm text-muted-foreground">
            {query.data.detail.user.email}
          </p>
          <p className={styles.status}>
            {
              {
                PENDING: "Awaiting a reset link",
                ISSUED: "Reset link issued",
                RESOLVED: "Resolved",
              }[query.data.detail.status]
            }
          </p>
          <p className="text-sm text-muted-foreground">
            Requested {formatPeopleTime(query.data.detail.requestedAt)} Kigali
            time
          </p>
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
              Account email is unavailable. Ask the deployment administrator to
              check the sender, then refresh this request.
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
                    <p>
                      Delivery needs attention. Check the account email settings
                      and refresh this request before sending another link.
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          <div className={styles.recordActions}>
            {resetButton(query.data.detail)}
          </div>
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
        !query.data.detail &&
        (query.data.data.length === 0 ? (
          <p className="notice">No recovery requests on this page.</p>
        ) : (
          <section aria-label="Recovery requests">
            <h2 className="mb-5 font-semibold">
              Recovery requests · {query.data.meta.total} total
            </h2>
            <ul className={styles.recoveryGrid}>
              {query.data.data.map((row) => (
                <li key={row.id} className={styles.recoveryItem}>
                  <h3 className={styles.recordTitle}>{row.user.name}</h3>
                  <p className={styles.status}>
                    {
                      {
                        PENDING: "Awaiting a reset link",
                        ISSUED: "Reset link issued",
                        RESOLVED: "Resolved",
                      }[row.status]
                    }
                  </p>
                  <div className={styles.recordActions}>
                    <Button asChild variant="outline">
                      <Link href={`/people/recovery?request=${row.id}`}>
                        View details
                        <span className="sr-only"> for {row.user.name}</span>
                      </Link>
                    </Button>
                    {resetButton(row)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
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
          {review?.user.email}.
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
