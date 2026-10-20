"use client";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { changePasswordSchema } from "@/lib/account";
import { changePassword, passwordOutcomeUnknown } from "@/lib/change-password";
import { clearLocalPush } from "@/lib/push-device";
import { usePushDevice } from "../push-devices";
import { useSession } from "../session";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/field";
import { containDialogFocus } from "../ui/dialog-focus";
import { Feedback, Pending } from "./feedback";

export function ChangePassword() {
  const user = useSession();
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    result = useRef<HTMLParagraphElement>(null);
  const push = usePushDevice(),
    cache = useQueryClient();
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const [outcome, setOutcome] = useState<"changed" | "unknown" | null>(null);
  const [cleanupFailed, setCleanupFailed] = useState(false);
  useEffect(() => {
    if (outcome && !pending) result.current?.focus();
  }, [outcome, pending]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
  });
  async function cleanup() {
    try {
      const work = () => clearLocalPush();
      if (navigator.locks)
        await navigator.locks.request("ilead-push-device", work);
      else await work();
      setCleanupFailed(false);
    } catch {
      setCleanupFailed(true);
    }
  }
  function close() {
    if (pending || outcome) return;
    reset();
    setError(undefined);
    dialog.current?.close();
    trigger.current?.focus();
  }
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        disabled={push.busy}
        onClick={() => dialog.current?.showModal()}
      >
        Change password
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="change-password-title"
        onKeyDown={containDialogFocus}
        aria-describedby="change-password-help"
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 text-card-foreground backdrop:bg-foreground/30"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h2 id="change-password-title" className="text-xl font-semibold">
          Change password
        </h2>
        <p id="change-password-help" className="my-3 text-sm">
          Changing your password ends all refresh sessions, including this one.
          Sign in again afterward. This device’s push notifications will be
          disabled; other devices keep their notification settings.
        </p>
        {outcome ? (
          <>
            <p ref={result} tabIndex={-1} role="status" className="notice">
              {outcome === "changed"
                ? "Password changed. Sign in with your new password."
                : "We could not confirm whether your password changed. Sign in with your new password first. If it does not work, try your previous password or request recovery."}
            </p>
            {cleanupFailed && (
              <div role="alert" className="notice">
                This browser could not finish notification cleanup. Disable
                notifications in this site’s browser settings, or retry cleanup
                before signing in.
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    await cleanup();
                    setPending(false);
                  }}
                >
                  Retry device cleanup
                </Button>
              </div>
            )}
            <Button
              disabled={pending}
              onClick={() => {
                cache.clear();
                window.location.replace("/login");
              }}
            >
              Go to log in
            </Button>
          </>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit(async ({ currentPassword, newPassword }) => {
              if (pending) return;
              setPending(true);
              setError(undefined);
              try {
                await changePassword(user.id, { currentPassword, newPassword });
                reset();
                setOutcome("changed");
                await cache.cancelQueries();
                await cleanup();
              } catch (cause) {
                if (passwordOutcomeUnknown(cause)) {
                  reset();
                  setOutcome("unknown");
                  await cache.cancelQueries();
                  await cleanup();
                } else setError(cause);
              } finally {
                setPending(false);
              }
            })}
          >
            {(
              [
                ["currentPassword", "Current password", "current-password"],
                ["newPassword", "New password", "new-password"],
                ["confirmation", "Confirm new password", "new-password"],
              ] as const
            ).map(([name, label, autoComplete]) => (
              <Field
                key={name}
                id={`change-${name}`}
                label={label}
                error={errors[name]?.message}
                help={
                  name === "newPassword"
                    ? "Use at least 8 characters, including a letter and a number."
                    : undefined
                }
              >
                <Input
                  id={`change-${name}`}
                  type="password"
                  autoComplete={autoComplete}
                  maxLength={256}
                  disabled={pending}
                  aria-invalid={!!errors[name]}
                  aria-describedby={
                    [
                      name === "newPassword" ? `change-${name}-help` : "",
                      errors[name] ? `change-${name}-error` : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  {...register(name)}
                />
              </Field>
            ))}
            <Feedback error={error} />
            <Pending active={pending} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || push.busy}>
                {pending ? "Changing password…" : "Save password"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={close}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
