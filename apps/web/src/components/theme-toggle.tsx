"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Avoid hydration mismatch: render a placeholder until client mounts.
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={mounted ? label : "Toggle color theme"}
      className={`inline-flex size-11 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:bg-bg-muted hover:text-text ${className}`}
    >
      {mounted ? (
        isDark ? <Moon className="size-5" aria-hidden="true" /> : <Sun className="size-5" aria-hidden="true" />
      ) : (
        <span className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}
