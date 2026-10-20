"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Bell } from "lucide-react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  countResponse,
  notificationTarget,
  notificationTime,
  parseNotifications,
  parseReminders,
  readAcknowledgement,
  readAllResponse,
  reminderKind,
  reminderLabels,
  reminderState,
  reminderTarget,
  snoozeAcknowledgement,
  snoozeDays,
  type Notice,
  type Reminder,
  type SnoozeDays,
} from "@/lib/notifications";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Field, Select } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";
function useNotificationActions() {
  const user = useSession(),
    cache = useQueryClient();
  const [notice, setNotice] = useState("");
  const key = ["notification-write", user.id, user.role];
  const busy = useIsMutating({ mutationKey: key }) > 0;
  const mutation = useMutation({
    mutationKey: key,
    retry: false,
    mutationFn: async (row: Notice | null) => {
      setNotice("");
      if (row) {
        readAcknowledgement(
          (
            await api<{ data: unknown }>(`/notifications/${row.id}/read`, {
              method: "POST",
              body: {},
            })
          ).data,
          row,
          user.role,
        );
        return "Notification marked read.";
      }
      const { data } = readAllResponse.parse(
        await api("/notifications/read-all", { method: "POST", body: {} }),
      );
      return `${data.updated} notification${data.updated === 1 ? "" : "s"} marked read.`;
    },
    onSuccess: async (message) => {
      setNotice(message);
      await cache.invalidateQueries({
        queryKey: ["notifications", user.id, user.role],
      });
    },
  });
  return { mutation, busy, notice };
}
function Snooze({
  id,
  kind,
  label,
}: {
  id: string;
  kind: Reminder["kind"];
  label: string;
}) {
  const user = useSession(),
    cache = useQueryClient(),
    selectId = useId();
  const [days, setDays] = useState<SnoozeDays>(1),
    [message, setMessage] = useState("");
  const key = ["reminder-write", user.id, user.role, id];
  const busy = useIsMutating({ mutationKey: key }) > 0;
  const write = useMutation({
    mutationKey: key,
    retry: false,
    mutationFn: async (value: SnoozeDays) =>
      snoozeAcknowledgement(
        (
          await api<{ data: unknown }>(`/reminders/${id}/snooze`, {
            method: "POST",
            body: { days: snoozeDays.parse(value) },
          })
        ).data,
        id,
        kind,
        user.role,
      ),
    onSuccess: async (row) => {
      setMessage(
        `Snoozed until ${notificationTime(row.snoozedUntil!)} Kigali. The reminder remains active.`,
      );
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["reminders", user.id, user.role],
        }),
        cache.invalidateQueries({
          queryKey: ["notifications", user.id, user.role],
        }),
      ]);
    },
  });
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field id={selectId} label="Snooze duration">
          <Select
            id={selectId}
            value={days}
            disabled={busy}
            onChange={(e) => {
              setDays(snoozeDays.parse(Number(e.target.value)));
              setMessage("");
              write.reset();
            }}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} day{n === 1 ? "" : "s"}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          className="mb-5"
          variant="outline"
          disabled={busy}
          aria-label={`Snooze ${label}`}
          onClick={() => {
            setMessage("");
            write.reset();
            write.mutate(days);
          }}
        >
          Snooze
        </Button>
      </div>
      <Pending active={write.isPending} />
      <Feedback error={write.error} />
      {write.isError && (
        <Button
          variant="outline"
          onClick={async () => {
            await Promise.all([
              cache.invalidateQueries({
                queryKey: ["reminders", user.id, user.role],
              }),
              cache.invalidateQueries({
                queryKey: ["notifications", user.id, user.role],
              }),
            ]);
            write.reset();
          }}
        >
          Refresh reminder status
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
function NotificationCard({
  row,
  busy,
  read,
  close,
}: {
  row: Notice;
  busy: boolean;
  read: () => void;
  close?: () => void;
}) {
  const user = useSession();
  const target = notificationTarget(row.link, user),
    kind = reminderKind(row.type);
  return (
    <article
      aria-label={row.title}
      className="min-w-0 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{row.title}</h3>
        <span className="rounded border border-border px-2 py-1 text-xs">
          {row.readAt ? "Read" : "Unread"}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{row.body}</p>
      <p className="my-3 text-xs text-muted-foreground">
        {notificationTime(row.createdAt)} Kigali
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {target ? (
          <Link href={target} onClick={close}>
            Open
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">
            Destination unavailable for this account.
          </span>
        )}
        {!row.readAt && (
          <Button variant="outline" disabled={busy} onClick={read}>
            Mark read
          </Button>
        )}
      </div>
      {kind &&
        (row.reminderId ? (
          <Snooze id={row.reminderId} kind={kind} label={row.title} />
        ) : (
          <p className="mt-3 text-sm">
            <Link href="/notifications#reminders" onClick={close}>
              View active reminders and snooze
            </Link>
          </p>
        ))}
    </article>
  );
}
function Pages({
  page,
  totalPages,
  busy,
  change,
}: {
  page: number;
  totalPages: number;
  busy: boolean;
  change: (value: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={busy || page <= 1}
        onClick={() => change(page - 1)}
      >
        Previous notifications
      </Button>
      <p>
        Page {page} of {Math.max(1, totalPages)}
      </p>
      <Button
        variant="outline"
        disabled={busy || page >= totalPages}
        onClick={() => change(page + 1)}
      >
        Next notifications
      </Button>
    </div>
  );
}
export function Reminders() {
  const user = useSession();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["reminders", user.id, user.role, page],
    staleTime: 0,
    queryFn: async ({ signal }) => ({
      ...parseReminders(
        await api(`/reminders?page=${page}&pageSize=20`, { signal }),
        user.role,
        page,
      ),
      checkedAt: Date.now(),
    }),
  });
  return (
    <section
      id="reminders"
      aria-labelledby="reminders-title"
      className="min-w-0 rounded-xl border border-border bg-card p-5 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reminders-title" className="text-lg font-semibold">
          My reminders
        </h2>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          Refresh reminders
        </Button>
      </div>
      <p className="my-3 text-sm text-muted-foreground">
        Active reminders only. Snooze for one, two or three calendar days until
        08:00 Kigali. Snoozing does not complete the task. Due status updates
        when this list refreshes.
      </p>
      <Pending active={query.isFetching} />
      {query.isError && (
        <>
          <Feedback error={query.error} />
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry reminders
          </Button>
        </>
      )}
      {query.data && !query.isError && (
        <>
          {query.data.data.length ? (
            <ul className="grid gap-4">
              {query.data.data.map((row) => {
                const target = reminderTarget(row, user);
                return (
                  <li key={row.id}>
                    <article
                      aria-label={`${reminderLabels[row.kind]} reminder`}
                      className="rounded-lg border border-border p-4"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="font-semibold">
                          {reminderLabels[row.kind]}
                        </h3>
                        <span className="text-sm">
                          {reminderState(row, query.data.checkedAt)}
                        </span>
                      </div>
                      {row.refType === "SESSION_DATE" && (
                        <p className="mt-2 text-sm">
                          Session date: {row.refId}
                        </p>
                      )}
                      <p className="mt-2 text-sm">
                        Scheduled: {notificationTime(row.nextRunAt)} Kigali
                      </p>
                      {row.snoozedUntil && (
                        <p className="text-sm">
                          Snooze until: {notificationTime(row.snoozedUntil)}{" "}
                          Kigali
                        </p>
                      )}
                      <p className="my-2 text-xs text-muted-foreground">
                        Sent {row.sendCount} time
                        {row.sendCount === 1 ? "" : "s"}
                        {row.maxSends === null ? "" : ` of ${row.maxSends}`}.
                      </p>
                      {target ? (
                        <Link href={target}>Open task</Link>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Task destination unavailable for this account.
                        </p>
                      )}
                      <Snooze
                        id={row.id}
                        kind={row.kind}
                        label={reminderLabels[row.kind]}
                      />
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="notice">No active reminders on this page.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={query.isFetching || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous reminders
            </Button>
            <p>
              Reminder page {page} of {Math.max(1, query.data.meta.totalPages)}
            </p>
            <Button
              variant="outline"
              disabled={query.isFetching || page >= query.data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next reminders
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
export function NotificationInbox() {
  const user = useSession(),
    cache = useQueryClient();
  const [page, setPage] = useState(1),
    [unread, setUnread] = useState(false);
  const { mutation, busy, notice } = useNotificationActions();
  const query = useQuery({
    queryKey: ["notifications", user.id, user.role, "list", page, unread],
    staleTime: 0,
    queryFn: async ({ signal }) =>
      parseNotifications(
        await api(`/notifications?page=${page}&pageSize=20&unread=${unread}`, {
          signal,
        }),
        user.role,
        page,
        20,
        unread,
      ),
  });
  return (
    <div className="grid min-w-0 gap-6 [overflow-wrap:anywhere]">
      <header>
        <h1>Notifications</h1>
        <p className="text-muted-foreground">
          Your updates and reminders. Opening a destination does not mark a
          notice read. Times are shown in Kigali.
        </p>
      </header>
      <section aria-label="Notification inbox">
        <h2 className="sr-only">Inbox notices</h2>
        <div className="mb-5 flex flex-wrap gap-3">
          <Button
            variant={unread ? "outline" : "default"}
            aria-pressed={!unread}
            onClick={() => {
              setUnread(false);
              setPage(1);
            }}
          >
            All notifications
          </Button>
          <Button
            variant={unread ? "default" : "outline"}
            aria-pressed={unread}
            onClick={() => {
              setUnread(true);
              setPage(1);
            }}
          >
            Unread notifications
          </Button>
          <Button
            variant="outline"
            disabled={busy || !query.data || query.isError}
            onClick={() => mutation.mutate(null)}
          >
            Mark all read
          </Button>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() =>
              cache.invalidateQueries({
                queryKey: ["notifications", user.id, user.role],
              })
            }
          >
            Refresh notifications
          </Button>
        </div>
        <Pending active={query.isFetching || mutation.isPending} />
        <Feedback error={mutation.error} />
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {query.isError && (
          <>
            <Feedback error={query.error} />
            <Button variant="outline" onClick={() => query.refetch()}>
              Retry notifications
            </Button>
          </>
        )}
        {query.data && !query.isError && (
          <>
            {query.data.data.length ? (
              <ul className="grid gap-4">
                {query.data.data.map((row) => (
                  <li key={row.id}>
                    <NotificationCard
                      row={row}
                      busy={busy}
                      read={() => mutation.mutate(row)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice">
                {unread
                  ? "No unread notifications on this page."
                  : "No notifications on this page."}
              </p>
            )}
            <Pages
              page={page}
              totalPages={query.data.meta.totalPages}
              busy={query.isFetching || busy}
              change={setPage}
            />
          </>
        )}
      </section>
      <Reminders />
    </div>
  );
}
export function NotificationBell() {
  const user = useSession(),
    cache = useQueryClient(),
    panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState<CSSProperties>({});
  const { mutation, busy, notice } = useNotificationActions();
  const count = useQuery({
    queryKey: ["notifications", user.id, user.role, "count"],
    queryFn: async ({ signal }) =>
      countResponse.parse(await api("/notifications/unread-count", { signal }))
        .data.count,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const recent = useQuery({
    queryKey: ["notifications", user.id, user.role, "recent"],
    enabled: open,
    staleTime: 0,
    queryFn: async ({ signal }) =>
      parseNotifications(
        await api("/notifications?page=1&pageSize=10&unread=false", { signal }),
        user.role,
        1,
        10,
      ),
  });
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  return (
    <div
      ref={wrapper}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
    >
      <Button
        ref={trigger}
        variant="outline"
        aria-label={
          count.isError
            ? "Notifications, unread count unavailable"
            : count.data === undefined
              ? "Notifications, checking unread count"
              : `Notifications, ${count.data} unread`
        }
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          const rect = trigger.current!.getBoundingClientRect(),
            width = Math.min(400, window.innerWidth - 32),
            top = Math.min(rect.bottom + 8, window.innerHeight - 160);
          setPosition({
            left: Math.max(
              16,
              Math.min(rect.right - width, window.innerWidth - width - 16),
            ),
            top: Math.max(16, top),
            width,
            maxHeight: Math.max(120, window.innerHeight - top - 16),
          });
          setOpen(true);
          void count.refetch();
        }}
      >
        <Bell aria-hidden size={18} />
        <span aria-hidden className="text-xs">
          {count.isError
            ? "?"
            : count.data === undefined
              ? "…"
              : count.data > 99
                ? "99+"
                : count.data}
        </span>
      </Button>
      {open && (
        <section
          id={panelId}
          aria-label="Recent notifications"
          style={position}
          className="fixed z-50 overflow-y-auto rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg [overflow-wrap:anywhere]"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Notifications</h2>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              Close notifications
            </Button>
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)}>
            View all notifications and reminders
          </Link>
          <p className="my-3 text-xs text-muted-foreground">
            Latest 10 notices. Opening a destination does not mark it read.
          </p>
          <Button
            variant="outline"
            disabled={recent.isFetching || count.isFetching}
            onClick={() =>
              cache.invalidateQueries({
                queryKey: ["notifications", user.id, user.role],
              })
            }
          >
            Refresh recent notifications
          </Button>
          <Pending
            active={recent.isFetching || count.isFetching || mutation.isPending}
          />
          <Feedback error={count.error || recent.error || mutation.error} />
          {(count.isError || recent.isError) && (
            <Button
              variant="outline"
              onClick={() => {
                void recent.refetch();
                void count.refetch();
              }}
            >
              Retry recent notifications
            </Button>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {recent.data &&
            !recent.isError &&
            (recent.data.data.length ? (
              <ul className="mt-4 grid gap-3">
                {recent.data.data.map((row) => (
                  <li key={row.id}>
                    <NotificationCard
                      row={row}
                      busy={busy}
                      read={() => mutation.mutate(row)}
                      close={() => setOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice">No notifications yet.</p>
            ))}
        </section>
      )}
    </div>
  );
}
