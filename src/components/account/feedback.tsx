"use client";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
export function Feedback({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="notice notice-error">
      {errorMessage(error)}
    </div>
  ) : null;
}
export function Pending({ active }: { active: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active]);
  return active ? (
    <div role="status" aria-label="Loading" className="pending-skeleton">
      <span className="sr-only">Loading</span>
      <span aria-hidden="true" className="skeleton-bar pending-skeleton-wide" />
      <span
        aria-hidden="true"
        className="skeleton-bar pending-skeleton-short"
      />
      {slow && <span className="pending-skeleton-caption">Still loading…</span>}
    </div>
  ) : null;
}
