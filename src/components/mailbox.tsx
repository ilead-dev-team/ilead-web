"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Feedback, Pending } from "./account/feedback";
export function Mailbox() {
  const query = useQuery({
    queryKey: ["mailbox"],
    queryFn: () =>
      api<{
        data: {
          connected: boolean;
          address: string | null;
          reconnectRequired: boolean;
        };
      }>("/mailbox"),
  });
  const connect = useMutation({
    mutationFn: async () => {
      const response = await api<{ data: { authorizationUrl: string } }>(
        "/mailbox/connect",
        { method: "POST", body: { provider: "gmail" } },
      );
      const url = new URL(response.data.authorizationUrl);
      if (url.origin !== "https://accounts.google.com")
        throw new Error("Invalid provider authorization destination");
      window.location.assign(url.toString());
    },
  });
  const disconnect = useMutation({
    mutationFn: async () => {
      let revocation = "unconfirmed";
      await api("/mailbox", {
        method: "DELETE",
        body: {},
        onResponse: (response) => {
          revocation =
            response.headers.get("X-Mailbox-Revocation") ?? "unconfirmed";
        },
      });
      return revocation;
    },
    onSuccess: () => query.refetch(),
  });
  return (
    <div className="max-w-xl">
      <h1>Connected mailbox</h1>
      <p className="text-muted-foreground">
        Invitations and reset links are sent through your explicitly authorized
        Gmail account.
      </p>
      <Pending active={query.isPending} />
      <Feedback error={query.error || connect.error || disconnect.error} />
      {query.isError && (
        <Button onClick={() => query.refetch()}>Try again</Button>
      )}
      {query.data && (
        <div className="notice">
          <p>
            {query.data.data.connected
              ? `Connected: ${query.data.data.address}`
              : query.data.data.reconnectRequired
                ? "Reconnect your mailbox to send account emails."
                : "No mailbox connected."}
          </p>
          {query.data.data.connected ? (
            <Button
              variant="outline"
              disabled={disconnect.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Disconnect this mailbox? Unsent emails will be cancelled.",
                  )
                )
                  disconnect.mutate();
              }}
            >
              Disconnect mailbox
            </Button>
          ) : (
            <Button
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
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
      <Pending active={connect.isPending || disconnect.isPending} />
    </div>
  );
}
export function MailboxCallback() {
  const started = useRef(false);
  const mutation = useMutation({
    mutationFn: (body: { state: string; code?: string; error?: string }) =>
      api("/mailbox/callback", { method: "POST", body }),
  });
  const submit = mutation.mutate;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    window.history.replaceState(null, "", "/mailbox/callback");
    submit({
      state: params.get("state") ?? "",
      ...(params.has("error")
        ? { error: params.get("error")! }
        : { code: params.get("code") ?? "" }),
    });
  }, [submit]);
  return (
    <>
      <h1>
        {mutation.isSuccess ? "Mailbox connected." : "Connecting your mailbox."}
      </h1>
      <Pending active={mutation.isPending} />
      <Feedback error={mutation.error} />
      {mutation.isSuccess && (
        <p role="status">
          Your authorized mailbox is ready for account emails.
        </p>
      )}
      {mutation.isError && (
        <p>
          Start a new connection from the mailbox page. Authorization links are
          single-use.
        </p>
      )}
      <Button asChild variant="outline">
        <Link href="/mailbox">Back to connected mailbox</Link>
      </Button>
    </>
  );
}
