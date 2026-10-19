"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
function subscribe(callback: () => void) {
  const sync = () => {
    try {
      document.documentElement.classList.toggle(
        "dark",
        localStorage.getItem("ilead-theme") === "dark",
      );
    } catch {}
    callback();
  };
  window.addEventListener("ilead-theme", callback);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener("ilead-theme", callback);
    window.removeEventListener("storage", sync);
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
