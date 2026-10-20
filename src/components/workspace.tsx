"use client";
import Link from "next/link";
import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Feedback } from "./account/feedback";
import { useSession } from "./session";
import { NotificationBell } from "./notifications";
import { PushDeviceProvider, usePushDevice } from "./push-devices";
import { ChangePassword } from "./account/change-password";
import { containDialogFocus } from "./ui/dialog-focus";
export function Workspace({ children }: { children: ReactNode }) {
  const user = useSession();
  return (
    <PushDeviceProvider key={user.id}>
      <WorkspaceContent>{children}</WorkspaceContent>
    </PushDeviceProvider>
  );
}
function WorkspaceContent({ children }: { children: ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null),
    menu = useRef<HTMLButtonElement>(null);
  const push = usePushDevice();
  const user = useSession(),
    router = useRouter(),
    cache = useQueryClient();
  const [error, setError] = useState<unknown>(),
    [pending, setPending] = useState(false);
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Button
          ref={menu}
          variant="outline"
          className="lg:hidden"
          aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}
        >
          Menu
        </Button>
        <Brand />
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          <NotificationBell key={`${user.id}:${user.role}`} />
          <details
            className="relative"
            onKeyDown={(event) => {
              if (
                event.key === "Escape" &&
                !(event.target as HTMLElement).closest("dialog")
              ) {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary className="flex min-h-11 cursor-pointer items-center rounded-lg border border-border px-3 text-sm font-semibold">
              Account
            </summary>
            <div className="fixed inset-x-4 top-36 z-30 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64">
              <p className="break-words font-semibold">{user.name}</p>
              <p className="break-words text-sm text-muted-foreground">
                {user.email}
              </p>
              <p className="mb-2 text-sm capitalize">
                {user.role.toLowerCase()}
              </p>
              <ChangePassword />
            </div>
          </details>
          <Button
            variant="outline"
            disabled={pending || push.busy}
            onClick={async () => {
              setPending(true);
              setError(undefined);
              try {
                await push.logout();
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
      <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100dvh-76px)] border-r border-border bg-sidebar p-4 text-sidebar-foreground lg:block">
          <WorkspaceLinks />
        </aside>
        <main id="main" className="workspace min-w-0 w-full">
          <Feedback error={error} />
          {children}
        </main>
      </div>
      <dialog
        ref={drawer}
        aria-labelledby="navigation-title"
        onKeyDown={containDialogFocus}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-dvh w-72 max-w-[calc(100vw-2rem)] overflow-y-auto border-r border-border bg-sidebar p-4 text-sidebar-foreground backdrop:bg-foreground/30"
        onClose={() => menu.current?.focus()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="navigation-title" className="font-semibold">
            Navigation
          </h2>
          <Button variant="outline" onClick={() => drawer.current?.close()}>
            Close menu
          </Button>
        </div>
        <WorkspaceLinks onNavigate={() => drawer.current?.close()} />
      </dialog>
    </>
  );
}
function WorkspaceLinks({ onNavigate }: { onNavigate?: () => void }) {
  const user = useSession();
  return (
    <nav
      aria-label="Main navigation"
      className="flex flex-col gap-1"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) onNavigate?.();
      }}
    >
      <NavigationLink
        href={
          user.role === "FACILITATOR"
            ? user.hasRoundtable
              ? "/my-roundtable"
              : "/register-roundtable"
            : "/dashboard"
        }
      >
        Workspace
      </NavigationLink>
      {(user.role === "COORDINATOR" ||
        (user.role === "FACILITATOR" && user.hasRoundtable)) && (
        <NavigationLink href="/issues">Issues</NavigationLink>
      )}
      {user.role !== "FACILITATOR" && (
        <>
          <NavigationLink href="/roundtables">Roundtables</NavigationLink>
          <NavigationLink href="/reports">Reports</NavigationLink>
          <NavigationLink href="/curriculum">Curriculum</NavigationLink>
        </>
      )}
      {user.role === "COORDINATOR" && (
        <>
          <NavigationLink href="/sessions">Sessions</NavigationLink>
          <NavigationLink href="/settings/activities">
            Activity types
          </NavigationLink>
          <NavigationLink href="/settings/academic-years">
            Academic years
          </NavigationLink>
          <NavigationLink href="/settings/sections">
            Section library
          </NavigationLink>
          <NavigationLink href="/mailbox">Connected mailbox</NavigationLink>
          <NavigationLink href="/people/recovery">
            Account recovery
          </NavigationLink>
          <NavigationLink href="/people">People</NavigationLink>
        </>
      )}
    </nav>
  );
}

function NavigationLink(props: ComponentProps<typeof Link>) {
  const path = usePathname(),
    target = String(props.href);
  const active =
    path === target ||
    (target !== "/" && path.startsWith(target + "/") && target !== "/people");
  return (
    <Link
      {...props}
      aria-current={active ? "page" : undefined}
      className={active ? "bg-sidebar-accent font-semibold" : undefined}
    />
  );
}
