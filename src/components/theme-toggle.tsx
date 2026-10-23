"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
function subscribe(callback: () => void) {
  const sync = () => {
    let preference: string | null = null;
    try {
      preference = localStorage.getItem("ilead-theme");
    } catch {}
    const dark =
      preference === "dark" ||
      (preference !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    callback();
  };
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  systemTheme.addEventListener("change", sync);
  sync();
  window.addEventListener("ilead-theme", callback);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener("ilead-theme", callback);
    window.removeEventListener("storage", sync);
    systemTheme.removeEventListener("change", sync);
  };
}
export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  return (
    <Button
      variant="outline"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        document.documentElement.style.colorScheme = next ? "dark" : "light";
        try {
          localStorage.setItem("ilead-theme", next ? "dark" : "light");
        } catch {}
        window.dispatchEvent(new Event("ilead-theme"));
      }}
      className="h-11 w-11 p-2"
    >
      {dark ? <Sun aria-hidden size={20} /> : <Moon aria-hidden size={20} />}
    </Button>
  );
}
