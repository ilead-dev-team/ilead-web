"use client";
import styles from "./screen-surfaces.module.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  authorizationDestination,
  callbackInput,
  parseMailbox,
  unconfirmedAccountWrite,
  verifyCoordinatorAccount,
} from "@/lib/account-delivery";
import { Button } from "./ui/button";
import { containDialogFocus } from "./ui/dialog-focus";
import { Feedback, Pending } from "./account/feedback";
import { useSession } from "./session";
export function Mailbox() {
  const user = useSession();
  const dialog = useRef<HTMLDialogElement>(null),
    refreshButton = useRef<HTMLButtonElement>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const query = useQuery({
    queryKey: ["mailbox", "settings", user.id],
    refetchOnWindowFocus: false,
    queryFn: async () => parseMailbox(await api("/mailbox")),
  });
  const connect = useMutation({
    mutationFn: async () => {
      await verifyCoordinatorAccount(user.id);
      const url = authorizationDestination(
        await api("/mailbox/connect", {
          method: "POST",
          body: { provider: "gmail" },
        }),
      );
      window.location.assign(url);
    },
  });
  const disconnect = useMutation({
    mutationFn: async () => {
      await verifyCoordinatorAccount(user.id);
      let revocation = "unconfirmed";
      const result = await api("/mailbox", {
        method: "DELETE",
        body: {},
        onResponse: (response) => {
          const header = response.headers.get("X-Mailbox-Revocation");
          revocation =
            header === "confirmed" || header === "not-needed"
              ? header
              : "unconfirmed";
        },
      });
      if (result !== undefined)
        throw new ApiError(
          0,
          "UNCONFIRMED_DISCONNECT",
          "Mailbox disconnection was not confirmed. Refresh its status before trying again.",
        );
      return revocation;
    },
    onSuccess: async () => {
      setNeedsRefresh(true);
      const result = await query.refetch();
      if (result.isSuccess) setNeedsRefresh(false);
    },
    onError: (cause) => {
      if (unconfirmedAccountWrite(cause)) setNeedsRefresh(true);
    },
  });
  const busy = connect.isPending || disconnect.isPending;
  useEffect(() => {
    if (disconnect.isSuccess && !disconnect.isPending) {
      dialog.current?.close();
      refreshButton.current?.focus();
    }
  }, [disconnect.isSuccess, disconnect.isPending]);
  async function refresh() {
    const result = await query.refetch();
    if (result.isSuccess) {
      setNeedsRefresh(false);
      disconnect.reset();
      connect.reset();
      dialog.current?.close();
      refreshButton.current?.focus();
    }
  }
  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <h1>
        {query.data?.scope === "PROGRAM"
          ? "Program email"
          : "Connected mailbox"}
      </h1>

      <Pending active={query.isPending || query.isFetching || busy} />
      <Feedback error={query.error || connect.error || disconnect.error} />
      <Button
        ref={refreshButton}
        variant="outline"
        disabled={busy || query.isFetching}
        onClick={() => void refresh()}
      >
        Refresh mailbox
      </Button>
      {query.isError && (
        <Button
          disabled={busy || query.isFetching}
          onClick={() => void refresh()}
        >
          Try again
        </Button>
      )}
      {needsRefresh && (
        <p role="status" className="notice">
          Refresh mailbox to verify its current state before making another
          change. A lost response may still have completed the operation.
        </p>
      )}
      {query.data?.scope === "PROGRAM" && !query.isError && (
        <section
          aria-label="Program email status"
          className={`${styles.panel} w-fit max-w-full justify-self-start`}
        >
          <p className="break-words">
            {query.data.connected
              ? `Sending configured: ${query.data.address}`
              : "Program email is not configured or sending is disabled."}
          </p>

          {!query.data.connected && (
            <p role="status">Contact an administrator to enable email.</p>
          )}
        </section>
      )}
      {query.data && query.data.scope !== "PROGRAM" && !query.isError && (
        <div className="notice">
          <p className="break-words">
            {query.data.connected
              ? `Connected: ${query.data.address}`
              : query.data.reconnectRequired
                ? "Reconnect your mailbox to send account emails."
                : "No mailbox connected."}
          </p>
          {query.data.connected ? (
            <Button
              variant="outline"
              disabled={busy || needsRefresh || query.isFetching}
              onClick={() => {
                disconnect.reset();
                dialog.current?.showModal();
              }}
            >
              Disconnect mailbox
            </Button>
          ) : (
            <Button
              disabled={busy || needsRefresh || query.isFetching}
              onClick={() => connect.mutate()}
            >
              Connect Gmail
            </Button>
          )}
        </div>
      )}
      {disconnect.isSuccess && (
        <div role="status" className="notice">
          Mailbox disconnected locally.{" "}
          {disconnect.data === "unconfirmed"
            ? "Google authorization removal could not be confirmed. Remove iLead manually from your"
            : "Provider revocation completed or was not needed. You can review your"}{" "}
          <a
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noreferrer"
          >
            Google account connections
          </a>
          . Previously accepted messages cannot be recalled.
        </div>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="disconnect-mailbox-title"
        aria-describedby="disconnect-mailbox-help"
        onKeyDown={containDialogFocus}
        onCancel={(event) => {
          if (disconnect.isPending) {
            event.preventDefault();
          } else refreshButton.current?.focus();
        }}
        onClose={() => refreshButton.current?.focus()}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 text-card-foreground backdrop:bg-foreground/30"
      >
        <h2 id="disconnect-mailbox-title" className="text-xl font-semibold">
          Disconnect mailbox?
        </h2>
        <p id="disconnect-mailbox-help" className="my-4 break-words">
          Disconnect {query.data?.address}. Unsent emails will be cancelled.
          Previously accepted messages cannot be recalled.
        </p>
        <Feedback error={disconnect.error} />
        <Pending active={disconnect.isPending} />
        {needsRefresh && (
          <p className="notice">
            The result is unconfirmed. Close this review and refresh mailbox
            before another change.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={disconnect.isPending}
            onClick={() => dialog.current?.close()}
          >
            {needsRefresh ? "Close review" : "Cancel"}
          </Button>
          <Button
            disabled={disconnect.isPending || needsRefresh}
            onClick={() => disconnect.mutate()}
          >
            {disconnect.isPending ? "Disconnecting…" : "Confirm disconnect"}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
export function MailboxCallback() {
  const started = useRef(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: async (params: URLSearchParams) => {
      const body = callbackInput(params);
      // State is single-use and bound to this session. Never refresh/replay this POST.
      return parseMailbox(
        await api("/mailbox/callback", { method: "POST", body, public: true }),
        true,
      );
    },
  });
  const submit = mutation.mutate;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    window.history.replaceState(null, "", "/mailbox/callback");
    submit(params);
  }, [submit]);
  return (
    <>
      <h1>
        {mutation.isSuccess
          ? "Mailbox connected."
          : mutation.isError
            ? "Mailbox connection not confirmed."
            : "Connecting your mailbox."}
      </h1>
      <Pending active={mutation.isPending} />
      <Feedback error={mutation.error} />
      {mutation.isSuccess && (
        <p role="status" className="break-words">
          Your authorized mailbox {mutation.data.address} is ready for account
          emails.
        </p>
      )}
      {mutation.isError && (
        <p>
          Start a new connection from the mailbox page. Authorization links are
          single-use. Refresh mailbox first if the result was uncertain.
        </p>
      )}
      <Button asChild variant="outline">
        <Link href="/mailbox">Back to connected mailbox</Link>
      </Button>
    </>
  );
}
