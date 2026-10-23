import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "@/components/screen-surfaces.module.css";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main id="main" className={`${styles.fallback} workspace`}>
      <ThemeToggle />
      <h1>Page not found.</h1>
      <p>This link is unavailable. Check the address or return to iLead.</p>
      <Button asChild>
        <Link href="/login">Back to log in</Link>
      </Button>
    </main>
  );
}
