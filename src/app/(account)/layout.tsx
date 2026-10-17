import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div className="story-body">
          <p className="text-xs font-semibold uppercase tracking-widest">
            A little progress. Every Wednesday.
          </p>
          <h2>
            Great leadership
            <br />
            starts around
            <br />a roundtable.
          </h2>
          <p>
            One place to track lessons, coordinate sessions and share the
            stories of your progress.
          </p>
          <div className="story-art" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
          <small>iChoose → iDo → iLead</small>
        </div>
        <small className="text-muted-foreground">
          Rwanda Coding Academy · iLead leadership program
        </small>
      </aside>
      <section className="auth-form">
        <div className="absolute right-6 top-5">
          <ThemeToggle />
        </div>
        <main id="main" className="auth-box">
          {children}
        </main>
      </section>
    </div>
  );
}
