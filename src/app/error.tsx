"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="workspace">
      <h1>Could not open this page.</h1>
      <p>Try again. If the problem continues, contact a Coordinator.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
