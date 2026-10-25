import { LoginForm } from "./login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-bg px-4 py-16">
      <ThemeToggle className="absolute right-4 top-4" />
      <LoginForm />
    </main>
  );
}
