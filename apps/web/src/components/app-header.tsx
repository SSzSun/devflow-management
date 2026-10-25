"use client";

import { CircleCheck } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-[100] border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[12px] bg-accent text-accent-text-on">
            <CircleCheck className="size-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-tight">DevFlow</span>
        </div>
        <div className="flex items-center gap-2">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
