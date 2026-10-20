"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { notificationTime } from "@/lib/notifications";
import {
  browserPushPort,
  devicesSchema,
  disablePush,
  enablePush,
  inspectPush,
  logoutWithPush,
  type PushStatus,
} from "@/lib/push-device";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";
function readable(error: unknown) {
  return error instanceof ApiError
    ? error
    : new ApiError(
        0,
        "PUSH_DEVICE_ERROR",
        error instanceof Error
          ? error.message
          : "Device state could not be verified. Refresh and try again.",
      );
}
async function exclusive<T>(work: () => Promise<T>) {
  return navigator.locks
    ? navigator.locks.request("ilead-push-device", work)
    : work();
}
const PushContext = createContext<{
  status: PushStatus | "Checking" | "Unavailable";
  busy: boolean;
  error: unknown;
  message: string;
  refresh: () => void;
  enable: (label: string) => void;
  disable: () => void;
  logout: () => Promise<void>;
} | null>(null);
export function usePushDevice() {
  const value = useContext(PushContext);
  if (!value) throw new Error("Push device context unavailable");
  return value;
}
export function PushDeviceProvider({ children }: { children: ReactNode }) {
  const user = useSession(),
    cache = useQueryClient();
  const [status, setStatus] = useState<PushStatus | "Checking" | "Unavailable">(
      "Checking",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const check = () => {
      void exclusive(() => inspectPush(user.id, browserPushPort())).then(
        (result) => {
          if (active) {
            setStatus(result);
            setError(undefined);
          }
        },
        (cause) => {
          if (active) {
            setStatus("Unavailable");
            setError(readable(cause));
          }
        },
      );
    };
    check();
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", check);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("storage", check);
    };
  }, [user.id]);
  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      await exclusive(async () => {
        await work();
        setStatus(await inspectPush(user.id, browserPushPort()));
      });
      setMessage(success);
    } catch (cause) {
      setStatus("Unavailable");
      setError(readable(cause));
    } finally {
      setBusy(false);
      await cache.invalidateQueries({ queryKey: ["push-devices", user.id] });
    }
  }
  return (
    <PushContext
      value={{
        status,
        busy,
        error,
        message,
        refresh: () => {
          void run(async () => {}, "Device status refreshed.");
        },
        enable: (label) => {
          const port = browserPushPort();
          // Keep the native permission request in this explicit user interaction.
          const permission =
            port.supported && port.permission() === "default"
              ? port.requestPermission()
              : Promise.resolve(
                  port.supported ? port.permission() : ("default" as const),
                );
          // A tab may be waiting for the cross-tab lock when the native promise rejects.
          void permission.catch(() => undefined);
          void run(
            () =>
              enablePush(user.id, label, {
                ...port,
                requestPermission: () => permission,
              }),
            "Notifications enabled for this device. Delivery depends on browser, OS and network settings.",
          );
        },
        disable: () => {
          void run(
            () => disablePush(user.id, browserPushPort()),
            "Notifications disabled for this device. Other devices and your in-app inbox are unchanged.",
          );
        },
        logout: async () => {
          setBusy(true);
          try {
            await exclusive(() => logoutWithPush(user.id, browserPushPort()));
          } finally {
            setBusy(false);
          }
        },
      }}
    >
      {children}
    </PushContext>
  );
}
export function PushDevices() {
  const user = useSession(),
    device = usePushDevice(),
    cache = useQueryClient();
  const [label, setLabel] = useState(""),
    [removing, setRemoving] = useState<string | null>(null),
    [error, setError] = useState<unknown>(),
    [message, setMessage] = useState("");
  const devices = useQuery({
    queryKey: ["push-devices", user.id],
    staleTime: 0,
    queryFn: async ({ signal }) =>
      devicesSchema.parse(await api("/push/subscriptions", { signal })).data,
  });
  return (
    <section
      aria-labelledby="push-title"
      className="min-w-0 rounded-xl border border-border bg-card p-5 [overflow-wrap:anywhere]"
    >
      <h2 id="push-title" className="text-lg font-semibold">
        Device notifications
      </h2>
      <p className="my-3">
        Receive a short iLead alert outside this tab. Permission is optional;
        your in-app inbox always remains available. Push does not prove delivery
        or mark a notice read.
      </p>
      <p role="status" className="my-3 font-semibold">
        This device: {device.status}
      </p>
      {device.status === "Unsupported" && (
        <p>
          Push needs a supported browser and a secure HTTPS connection. Continue
          with the in-app inbox.
        </p>
      )}
      {device.status === "Blocked" && (
        <p>
          Notifications are blocked. Open this site&apos;s browser settings,
          allow notifications, then refresh device status. iLead cannot change
          browser permission for you.
        </p>
      )}
      <p className="my-3 text-sm text-muted-foreground">
        On iPhone or iPad, use Safari → Share → Add to Home Screen, open the
        installed iLead app, then choose Enable notifications. Browser and OS
        restrictions may prevent delivery.
      </p>
      <Field
        id="push-label"
        label="Device label (optional)"
        help="Choose a name you recognize, such as My laptop. iLead does not read your device name."
      >
        <Input
          id="push-label"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          disabled={device.busy}
        />
      </Field>
      <div className="my-4 flex flex-wrap gap-3">
        <Button
          disabled={
            device.busy ||
            ["Checking", "Unsupported", "Blocked", "Enabled"].includes(
              device.status,
            )
          }
          onClick={() => device.enable(label)}
        >
          Enable notifications
        </Button>
        <Button
          variant="outline"
          disabled={device.busy || device.status === "Checking"}
          onClick={device.disable}
        >
          Disable this device
        </Button>
        <Button
          variant="outline"
          disabled={device.busy}
          onClick={device.refresh}
        >
          Refresh device status
        </Button>
      </div>
      {device.busy && (
        <p role="status" className="text-sm text-muted-foreground">
          Updating this device. If a browser permission prompt is open, choose
          an option to continue.
        </p>
      )}
      <Feedback error={device.error} />
      {device.message && (
        <p role="status" className="notice">
          {device.message}
        </p>
      )}
      <h3 className="mt-6 font-semibold">Your registered devices</h3>
      <p className="my-2 text-sm text-muted-foreground">
        Up to 20 devices. Removing a device stops its server binding; a remote
        browser may still show previously delivered alerts. It must explicitly
        enable again to register anew.
      </p>
      <Pending active={devices.isFetching || removing !== null} />
      <Feedback error={devices.error || error} />
      {message && <p role="status">{message}</p>}
      <Button
        variant="outline"
        disabled={devices.isFetching}
        onClick={() => devices.refetch()}
      >
        Refresh registered devices
      </Button>
      {devices.data &&
        !devices.isError &&
        (devices.data.length ? (
          <ul className="mt-4 grid gap-3">
            {devices.data.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div>
                  <span>{row.deviceLabel ?? "Unnamed browser"}</span>
                  <p className="text-xs text-muted-foreground">
                    Registered {notificationTime(row.createdAt)} Kigali
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!!removing || device.busy}
                  aria-label={`Remove device ${row.deviceLabel ?? "Unnamed browser"}`}
                  onClick={async () => {
                    setRemoving(row.id);
                    setError(undefined);
                    setMessage("");
                    try {
                      await exclusive(async () => {
                        const result = await api(
                          `/push/subscriptions/${row.id}`,
                          { method: "DELETE" },
                        );
                        if (result !== undefined)
                          throw new Error(
                            "Device removal was not confirmed. Refresh the list before retrying.",
                          );
                      });
                      setMessage("Device binding removed.");
                      device.refresh();
                    } catch (cause) {
                      setError(readable(cause));
                    } finally {
                      setRemoving(null);
                      await cache.invalidateQueries({
                        queryKey: ["push-devices", user.id],
                      });
                    }
                  }}
                >
                  Remove device
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notice">No registered devices.</p>
        ))}
    </section>
  );
}
