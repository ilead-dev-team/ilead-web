"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Feedback } from "./account/feedback";
import { useSession } from "./session";
export function Workspace({ children }: { children: ReactNode }) {
  const user = useSession(),
    router = useRouter(),
    cache = useQueryClient();
  const [error, setError] = useState<unknown>(),
    [pending, setPending] = useState(false);
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <Brand />
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-4"
        >
          <Link
            href={
              user.role === "FACILITATOR"
                ? user.hasRoundtable
                  ? "/my-roundtable"
                  : "/register-roundtable"
                : "/dashboard"
            }
          >
            Workspace
          </Link>
          {(user.role === "COORDINATOR" ||
            (user.role === "FACILITATOR" && user.hasRoundtable)) && (
            <Link href="/issues">Issues</Link>
          )}
          {user.role !== "FACILITATOR" && (
            <>
              <Link href="/roundtables">Roundtables</Link>
              <Link href="/reports">Reports</Link>
              <Link href="/curriculum">Curriculum</Link>
            </>
          )}
          {user.role === "COORDINATOR" && (
            <>
              <Link href="/sessions">Sessions</Link>
              <Link href="/settings/activities">Activity types</Link>
              <Link href="/settings/sections">Section library</Link>
              <Link href="/mailbox">Connected mailbox</Link>
              <Link href="/people/recovery">Account recovery</Link>
              <Link href="/people">People</Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm sm:inline">{user.name}</span>
          <ThemeToggle />
          <Button
            variant="outline"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(undefined);
              try {
                await api("/auth/logout", { method: "POST", public: true });
                cache.clear();
                router.replace("/login");
              } catch (e) {
                setError(e);
              } finally {
                setPending(false);
              }
            }}
          >
            Log out
          </Button>
        </div>
      </header>
      <main id="main" className="workspace">
        <Feedback error={error} />
        {children}
      </main>
    </>
  );
}
