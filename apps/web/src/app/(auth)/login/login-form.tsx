"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { useLogin, useRegister } from "@/lib/api";
import { buttonClass, fieldClass as field } from "@/components/ui";

type Mode = "login" | "register";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = useLogin();
  const register = useRegister();
  const pending = login.isPending || register.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "login") {
        await login.mutateAsync({ email, password });
      } else {
        await register.mutateAsync({ email, name, password });
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex min-h-[44px] items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-[14px] bg-accent text-accent-text-on">
          <CircleCheck className="size-5" aria-hidden="true" />
        </span>
        <span className="text-xl font-bold tracking-tight">DevFlow</span>
      </div>

      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)] md:p-8">
        <h1 className="text-xl font-bold tracking-tight">
          {mode === "login" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {mode === "login" ? "Continue to your workspace" : "Start tracking your team's work"}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {mode === "register" && (
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={field}
                placeholder="Ada Lovelace"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
              placeholder="you@team.dev"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
              placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className={buttonClass("primary", "w-full")}
          >
            {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-text-muted">
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="inline-flex min-h-[44px] items-center font-medium text-link hover:underline"
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
