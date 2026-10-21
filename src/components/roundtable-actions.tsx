"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  roundtableEdit,
  savedRoundtable,
  restoredRoundtable,
  trashAcknowledgement,
  readRoundtableDetail,
  uncertainRoundtableWrite,
  type Roundtable,
} from "@/lib/roundtables";
import { formatPeopleTime } from "@/lib/people";
import { useSession } from "./session";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Feedback, Pending } from "./account/feedback";
import { containDialogFocus } from "./ui/dialog-focus";

export function useRoundtableViews() {
  const cache = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async () => {
      const results = await Promise.allSettled(
        ["roundtables", "dashboard", "sessions", "entry-rows", "people"].map(
          (key) =>
            cache.invalidateQueries(
              { queryKey: [key] },
              { throwOnError: true },
            ),
        ),
      );
      if (results.some((r) => r.status === "rejected"))
        throw new ApiError(
          0,
          "REFRESH_FAILED",
          "Some roundtable views could not refresh. Retry refreshing views; do not repeat a confirmed change.",
        );
    },
  });
}
export function RoundtableRefresh({
  views,
}: {
  views: ReturnType<typeof useRoundtableViews>;
}) {
  return (
    <>
      <Feedback error={views.error} />
      {views.isError && (
        <Button
          variant="outline"
          disabled={views.isPending}
          onClick={() => views.mutate()}
        >
          Retry refreshing views
        </Button>
      )}
      <Pending active={views.isPending} />
    </>
  );
}
type Saved = (message?: string) => Promise<void>;
export function DetailsEditor({
  row,
  blocked,
  onSaved,
}: {
  row: Roundtable;
  blocked: boolean;
  onSaved: Saved;
}) {
  const user = useSession(),
    cache = useQueryClient();
  const writes = useIsMutating({ mutationKey: ["roundtable-write", row.id] });
  const [name, setName] = useState(row.name),
    [slogan, setSlogan] = useState(row.slogan),
    [classYear, setClassYear] = useState(row.classYear),
    [invalid, setInvalid] = useState<string>(),
    [saved, setSaved] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const mutation = useMutation({
    mutationKey: ["roundtable-write", row.id],
    retry: false,
    mutationFn: async (body: ReturnType<typeof roundtableEdit.parse>) => {
      const result = savedRoundtable(
        await api(`/roundtables/${row.id}`, { method: "PATCH", body }),
        row.id,
        body,
      );
      if (user.role === "FACILITATOR" && result.facilitator?.id !== user.id)
        throw new Error("Unexpected ownership acknowledgement");
      return result;
    },
    onError: (error) => {
      if (uncertainRoundtableWrite(error)) setUncertain(true);
    },
    onSuccess: async (result) => {
      setName(result.name);
      setSlogan(result.slogan);
      setClassYear(result.classYear);
      setSaved(true);
      await onSaved();
    },
  });
  const check = useMutation({
    retry: false,
    mutationFn: async () =>
      readRoundtableDetail(
        await api(`/roundtables/${row.id}`),
        row.id,
        user.role === "FACILITATOR" ? user.id : undefined,
      ),
    onSuccess: (result) => {
      cache.setQueryData(
        ["roundtables", "detail", user.id, user.role, row.id],
        result,
      );
      setUncertain(false);
      mutation.reset();
    },
  });
  const busy = mutation.isPending || writes > 0 || check.isPending,
    locked = busy || blocked || uncertain;
  return (
    <form
      className="mt-6 grid max-w-xl gap-4 rounded-xl border border-border p-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (locked) return;
        setSaved(false);
        mutation.reset();
        check.reset();
        const result = roundtableEdit.safeParse({ name, slogan, classYear });
        setInvalid(
          result.success ? undefined : result.error.issues[0]?.message,
        );
        if (result.success) mutation.mutate(result.data);
      }}
    >
      <h2>Edit details</h2>
      <p>
        Progress is recorded through sessions. These fields do not change levels
        or lessons.
      </p>
      <Field id="rt-name" label="Roundtable name">
        <Input
          id="rt-name"
          maxLength={40}
          value={name}
          disabled={locked}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </Field>
      <Field id="rt-slogan" label="Slogan">
        <Input
          id="rt-slogan"
          maxLength={80}
          value={slogan}
          disabled={locked}
          onChange={(e) => {
            setSlogan(e.target.value);
            setSaved(false);
          }}
        />
      </Field>
      <Field id="rt-class" label="Class">
        <Select
          id="rt-class"
          value={classYear}
          disabled={locked}
          onChange={(e) => {
            setClassYear(e.target.value as typeof classYear);
            setSaved(false);
          }}
        >
          {["YEAR_1", "YEAR_2", "YEAR_3"].map((value, i) => (
            <option key={value} value={value}>
              Year {i + 1}
            </option>
          ))}
        </Select>
      </Field>
      {invalid && (
        <p className="field-error" role="alert">
          {invalid}
        </p>
      )}
      <Feedback error={mutation.error} />
      {uncertain && (
        <p className="notice" role="status">
          The save result is uncertain. Your inputs are retained. Check saved
          details before making another change.
        </p>
      )}
      {(uncertain || check.isSuccess) && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => check.mutate()}
          >
            Check saved details
          </Button>
          <Feedback error={check.error} />
          {check.isSuccess && (
            <p role="status">
              Saved details refreshed above. Compare them with your retained
              form before saving again.
            </p>
          )}
        </>
      )}
      <Pending active={busy} />
      <Button disabled={locked}>Save details</Button>
      {saved && <p role="status">Roundtable details saved.</p>}
    </form>
  );
}

export function Lifecycle({
  row,
  trash,
  blocked,
  onSaved,
  onCheck,
  focusFallback,
}: {
  row: Roundtable;
  trash: boolean;
  blocked: boolean;
  onSaved: Saved;
  onCheck: () => Promise<void>;
  focusFallback: () => void;
}) {
  const writes = useIsMutating({ mutationKey: ["roundtable-write", row.id] });
  const [review, setReview] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    wasOpen = useRef(false);
  const mutation = useMutation({
    mutationKey: ["roundtable-write", row.id],
    retry: false,
    mutationFn: async () => {
      if (trash)
        restoredRoundtable(
          await api(`/roundtables/${row.id}/restore`, {
            method: "POST",
            body: {},
          }),
          row,
        );
      else
        trashAcknowledgement(
          await api(`/roundtables/${row.id}`, { method: "DELETE" }),
        );
    },
    onError: (error) => {
      if (uncertainRoundtableWrite(error)) setUncertain(true);
    },
    onSuccess: async () => {
      setReview(false);
      dialog.current?.close();
      await onSaved(
        trash ? "Roundtable restored." : "Roundtable moved to trash.",
      );
      focusFallback();
    },
  });
  const check = useMutation({
    retry: false,
    mutationFn: onCheck,
    onSuccess: () => {
      setUncertain(false);
      mutation.reset();
      setReview(false);
    },
  });
  const busy = mutation.isPending || writes > 0 || check.isPending;
  useEffect(() => {
    if (review && !busy) {
      wasOpen.current = true;
      if (!dialog.current?.open) dialog.current?.showModal();
      cancel.current?.focus();
    } else if (!review && wasOpen.current && !busy) {
      dialog.current?.close();
      wasOpen.current = false;
      if (trigger.current?.isConnected && !trigger.current.disabled)
        trigger.current.focus();
      else focusFallback();
    }
  }, [review, busy, focusFallback]);
  const title = trash ? "Restore roundtable?" : "Move roundtable to trash?";
  const feedback = (
    <>
      {uncertain && (
        <p className="notice" role="status">
          This result is uncertain. Refresh the list and inspect the live and
          trash views before making another change.
        </p>
      )}
      <Feedback error={check.error} />
      {uncertain && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => check.mutate()}
        >
          Refresh roundtables
        </Button>
      )}
    </>
  );
  return (
    <div className="mt-4 grid gap-3">
      {trash && (
        <p className="text-sm">
          Restore deadline:{" "}
          {row.purgeAfter
            ? `${formatPeopleTime(row.purgeAfter)} Kigali time`
            : "Unavailable"}
          . The original Facilitator must still be eligible.
        </p>
      )}
      <Button
        ref={trigger}
        variant="outline"
        disabled={busy || blocked || uncertain}
        onClick={() => {
          if (busy || blocked || uncertain) return;
          mutation.reset();
          check.reset();
          setReview(true);
        }}
      >
        {trash ? "Restore roundtable" : "Move to trash"}
      </Button>
      {!review && (
        <>
          <Feedback error={mutation.error} />
          {feedback}
        </>
      )}
      <dialog
        ref={dialog}
        aria-label={title}
        onKeyDown={containDialogFocus}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setReview(false);
        }}
        onClose={() => {
          if (!busy) setReview(false);
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 text-card-foreground backdrop:bg-foreground/30"
      >
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="my-4 break-words">
          {row.name} · {row.slogan}
        </p>
        <p className="my-4">
          {trash
            ? "Restore this roundtable to the live list. The server checks the restore window and the original Facilitator’s eligibility."
            : "This detaches the Facilitator. The name stays reserved during the 30-day restore window, after which the roundtable is purged."}
        </p>
        {trash && row.purgeAfter && (
          <p className="my-4">
            Restore deadline: {formatPeopleTime(row.purgeAfter)} Kigali time.
          </p>
        )}
        {review && (
          <>
            <Feedback error={mutation.error} />
            {feedback}
          </>
        )}
        <Pending active={busy} />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            ref={cancel}
            variant="outline"
            disabled={busy}
            onClick={() => setReview(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={busy || blocked || uncertain || !review}
            onClick={() => {
              if (!busy && !blocked && !uncertain && review) mutation.mutate();
            }}
          >
            {trash ? "Confirm restore" : "Confirm move to trash"}
          </Button>
        </div>
      </dialog>
      <p className="text-sm">
        <Link href={trash ? "/roundtables" : "/roundtables/trash"}>
          {trash ? "Inspect live roundtables" : "Inspect trash"}
        </Link>
      </p>
    </div>
  );
}
