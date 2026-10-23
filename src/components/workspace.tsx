"use client";
import Link from "next/link";
import {
  LayoutDashboard,
  CircleUserRound,
  UsersRound,
  FileText,
  BookOpen,
  CalendarDays,
  ListChecks,
  CalendarRange,
  PanelsTopLeft,
  Mail,
  KeyRound,
  Users,
  CircleHelp,
  Menu,
  LogOut,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import styles from "./workspace.module.css";
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
      <header className={styles.header}>
        <Button
          ref={menu}
          variant="outline"
          className={styles.menuButton}
          aria-label="Menu"
          aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}
        >
          <Menu aria-hidden size={20} />
        </Button>
        <div className={styles.brand}>
          <Brand />
        </div>
        <div className={styles.context}>
          <span>iLead workspace</span>
          <strong>
            {user.role === "COORDINATOR"
              ? "Coordinator"
              : user.role === "SPONSOR"
                ? "Sponsor"
                : "Facilitator"}
          </strong>
        </div>
        <div className={styles.actions}>
          <ThemeToggle />
          <NotificationBell key={`${user.id}:${user.role}`} />
          <details
            className={styles.account}
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
            <summary className={styles.accountTrigger}>
              <CircleUserRound aria-hidden size={20} />
              <span>Account</span>
              <ChevronDown className={styles.chevron} aria-hidden size={14} />
            </summary>
            <div className={styles.accountPanel}>
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
            aria-label="Log out"
            className={styles.logout}
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
            <LogOut aria-hidden size={18} />
            <span>Log out</span>
          </Button>
        </div>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <WorkspaceLinks />
        </aside>
        <main
          id="main"
          className={`workspace min-w-0 w-full ${styles.content}`}
        >
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
type NavigationItem = { href: string; label: string; icon: LucideIcon };
function WorkspaceLinks({ onNavigate }: { onNavigate?: () => void }) {
  const user = useSession();
  const program: NavigationItem[] = [
    {
      href:
        user.role === "FACILITATOR"
          ? user.hasRoundtable
            ? "/my-roundtable"
            : "/register-roundtable"
          : "/dashboard",
      label: "Workspace",
      icon: LayoutDashboard,
    },
  ];
  if (user.role !== "FACILITATOR")
    program.push(
      { href: "/roundtables", label: "Roundtables", icon: UsersRound },
      ...(user.role === "COORDINATOR"
        ? [{ href: "/sessions", label: "Sessions", icon: CalendarDays }]
        : []),
      { href: "/reports", label: "Reports", icon: FileText },
      { href: "/curriculum", label: "Curriculum", icon: BookOpen },
    );
  if (
    user.role === "COORDINATOR" ||
    (user.role === "FACILITATOR" && user.hasRoundtable)
  )
    program.push({ href: "/issues", label: "Issues", icon: CircleHelp });
  const administration: NavigationItem[] =
    user.role === "COORDINATOR"
      ? [
          { href: "/people", label: "People", icon: Users },
          {
            href: "/people/recovery",
            label: "Account recovery",
            icon: KeyRound,
          },
          { href: "/mailbox", label: "Program email", icon: Mail },
          {
            href: "/settings/academic-years",
            label: "Academic years",
            icon: CalendarRange,
          },
          {
            href: "/settings/activities",
            label: "Activity types",
            icon: ListChecks,
          },
          {
            href: "/settings/sections",
            label: "Section library",
            icon: PanelsTopLeft,
          },
        ]
      : [];
  return (
    <nav
      aria-label="Main navigation"
      className={styles.navigation}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) onNavigate?.();
      }}
    >
      {[
        { label: "Program", items: program },
        { label: "Administration", items: administration },
      ]
        .filter((group) => group.items.length)
        .map((group) => (
          <div className={styles.navigationGroup} key={group.label}>
            <p className={styles.groupLabel}>{group.label}</p>
            {group.items.map((item) => (
              <NavigationLink key={item.href} href={item.href} icon={item.icon}>
                {item.label}
              </NavigationLink>
            ))}
          </div>
        ))}
    </nav>
  );
}
function NavigationLink({
  icon: Icon,
  ...props
}: ComponentProps<typeof Link> & { icon: LucideIcon }) {
  const path = usePathname(),
    target = String(props.href);
  const active =
    path === target ||
    (target !== "/" && path.startsWith(target + "/") && target !== "/people");
  return (
    <Link
      {...props}
      aria-current={active ? "page" : undefined}
      className={`${styles.navigationLink} ${active ? styles.active : ""}`}
    >
      <Icon aria-hidden size={18} />
      <span>{props.children}</span>
    </Link>
  );
}
