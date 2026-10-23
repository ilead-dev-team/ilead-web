"use client";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "@/components/screen-surfaces.module.css";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className={`${styles.fallback} workspace`}>
      <ThemeToggle />
      <h1>Could not open this page.</h1>
      <p>Try again. If the problem continues, contact a Coordinator.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
