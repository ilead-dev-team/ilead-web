"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  userSchema,
  destination,
  roundtablePath,
  sessionPath,
  reportPath,
  type User,
} from "@/lib/account";
import { Feedback, Pending } from "./account/feedback";
import { Button } from "./ui/button";
export const SessionContext = createContext<User | null>(null);
export function useSession() {
  const user = useContext(SessionContext);
  if (!user) throw new Error("Session unavailable");
  return user;
}
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter(),
    path = usePathname();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () =>
      userSchema.parse((await api<{ data: unknown }>("/auth/me")).data),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const user = session.data;
  const expired =
    session.error instanceof ApiError && session.error.status === 401;
  const allowed =
    user &&
    (path === "/notifications" ||
      (user.role === "FACILITATOR"
        ? path ===
            (user.hasRoundtable ? "/my-roundtable" : "/register-roundtable") ||
          (user.hasRoundtable && path === "/issues")
        : path === "/dashboard" ||
          path === "/curriculum" ||
          roundtablePath(path, user.role) ||
          sessionPath(path, user.role) ||
          reportPath(path, user.role) ||
          (user.role === "COORDINATOR" &&
            [
              "/mailbox",
              "/mailbox/callback",
              "/people/recovery",
              "/people",
              "/settings/activities",
              "/settings/sections",
              "/settings/academic-years",
              "/issues",
            ].includes(path))));
  useEffect(() => {
    if (expired) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (user && !allowed) router.replace(destination(user));
  }, [expired, user, allowed, router, path]);
  if (session.isPending || expired || (user && !allowed))
    return (
      <main id="main" className="workspace">
        <p role="status">Opening your workspace…</p>
        <Pending active />
      </main>
    );
  if (session.isError)
    return (
      <main id="main" className="workspace">
        <h1>Could not open your workspace.</h1>
        <Feedback error={session.error} />
        <Button onClick={() => session.refetch()}>Try again</Button>
      </main>
    );
  return <SessionContext value={user!}>{children}</SessionContext>;
}
