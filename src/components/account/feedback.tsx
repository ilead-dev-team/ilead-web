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
    <p role="status" className="text-sm text-muted-foreground">
      {slow
        ? "The server may be waking up. This can take a moment. Keep this page open."
        : "Connecting to iLead…"}
    </p>
  ) : null;
}
