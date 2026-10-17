"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Feedback, Pending } from "./account/feedback";
type Request = {
  id: string;
  status: string;
  requestedAt: string;
  user: { name: string; email: string; role: string };
  deliveries: {
    status: string;
    lastErrorCode: string | null;
    expiresAt: string;
  }[];
};
export function Recovery() {
  const [page, setPage] = useState(1);
  const keys = useRef(new Map<string, string>());
  const query = useQuery({
    queryKey: ["recovery", page],
    queryFn: () =>
      api<{ data: Request[]; meta: { total: number; totalPages: number } }>(
        `/account-recovery?page=${page}&pageSize=20`,
      ),
  });
  const send = useMutation({
    mutationFn: async (id: string) => {
      let key = keys.current.get(id);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(id, key);
      }
      const response = await api<{ data: { deliveryStatus: string } }>(
        `/account-recovery/${id}/send-reset`,
        { method: "POST", body: {}, headers: { "Idempotency-Key": key } },
      );
      keys.current.delete(id);
      return response;
    },
    onSuccess: () => query.refetch(),
  });
  return (
    <>
      <h1>Account recovery</h1>
      <p className="text-muted-foreground">
        Send a one-hour reset link to the account’s stored email through your{" "}
        <Link href="/mailbox">connected mailbox</Link>.
      </p>
      <Feedback error={query.error || send.error} />
      <Pending active={query.isPending || send.isPending} />
      {query.isError && (
        <Button onClick={() => query.refetch()}>Try again</Button>
      )}
      {send.isSuccess && (
        <p className="notice" role="status">
          {send.data.data.deliveryStatus === "ACCEPTED"
            ? "The email provider accepted the reset email. This does not confirm inbox delivery."
            : send.data.data.deliveryStatus === "PENDING"
              ? "The reset email is queued. Check its delivery status before trying again."
              : "The email could not be sent. Check the mailbox connection and retry."}
        </p>
      )}
      {query.data && (
        <>
          {query.data.data.length === 0 ? (
            <p className="notice">No recovery requests on this page.</p>
          ) : (
            <div className="mt-7 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <caption className="p-3 text-left">
                  Recovery requests · {query.data.meta.total} total
                </caption>
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="p-3">Account</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Delivery</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.data.map((row) => (
                    <tr key={row.id} className="border-b border-border">
                      <td className="p-3">
                        {row.user.name}
                        <br />
                        <span className="text-muted-foreground">
                          {row.user.email}
                        </span>
                      </td>
                      <td className="p-3">{row.status}</td>
                      <td className="p-3">
                        {row.deliveries[0]?.status ?? "Not issued"}
                      </td>
                      <td className="p-3">
                        <Button
                          disabled={
                            send.isPending ||
                            row.status === "RESOLVED" ||
                            (row.status === "ISSUED" &&
                              ["PENDING", "ACCEPTED"].includes(
                                row.deliveries[0]?.status ?? "",
                              ) &&
                              new Date(row.deliveries[0]!.expiresAt).getTime() >
                                query.dataUpdatedAt)
                          }
                          onClick={() => send.mutate(row.id)}
                        >
                          Send reset email
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 flex items-center gap-4">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {Math.max(1, query.data.meta.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={page >= query.data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <Button variant="outline" onClick={() => query.refetch()}>
              Refresh status
            </Button>
          </div>
        </>
      )}
    </>
  );
}
