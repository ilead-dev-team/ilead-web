import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
export function Field({
  id,
  label,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help && (
        <span id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground disabled:opacity-70 ${className}`}
      {...props}
    />
  );
}
export function Select(props: ComponentProps<"select">) {
  return (
    <span className="select-control">
      <select
        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground"
        {...props}
      />
      <ChevronDown aria-hidden="true" focusable="false" />
    </span>
  );
}
