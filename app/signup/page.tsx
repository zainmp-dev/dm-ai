"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Eye, EyeOff, Lock, Mail, UserRound, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { HeaderThemeControl } from "@/components/header-theme-control";
import { apiSignup } from "@/lib/api";
import { setAuthSession } from "@/lib/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M21.6 12.23c0-.75-.07-1.47-.19-2.18H12v4.12h5.39a4.6 4.6 0 0 1-1.99 3.03v2.52h3.23c1.9-1.75 2.97-4.33 2.97-7.5Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.63-2.45l-3.23-2.52c-.9.6-2.04.95-3.4.95-2.6 0-4.8-1.75-5.58-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.42 13.88A5.96 5.96 0 0 1 6.1 12c0-.65.12-1.27.32-1.88V7.53H3.1A10 10 0 0 0 2 12c0 1.62.39 3.15 1.1 4.47l3.32-2.59Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.02c1.47 0 2.78.5 3.82 1.5l2.86-2.86A9.96 9.96 0 0 0 12 2a10 10 0 0 0-8.9 5.53l3.32 2.59c.78-2.35 2.98-4.1 5.58-4.1Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-[#1877F2]">
      <path d="M24 12a12 12 0 1 0-13.88 11.85v-8.39H7.08V12h3.04V9.35c0-3 1.8-4.66 4.56-4.66 1.32 0 2.7.24 2.7.24v2.95h-1.52c-1.5 0-1.97.93-1.97 1.89V12h3.35l-.54 3.46h-2.8v8.39A12 12 0 0 0 24 12Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M16.37 12.14c.02 2.45 2.16 3.26 2.18 3.27-.02.05-.34 1.18-1.1 2.34-.66.99-1.34 1.98-2.42 2-.06 0-.12.01-.18.01-.98 0-1.25-.58-2.56-.58-1.34 0-1.66.56-2.6.6h-.1c-1.03 0-1.81-1.04-2.48-2.02-1.36-2-2.4-5.64-1-8.07.69-1.2 1.93-1.96 3.28-1.98 1.02-.02 1.99.68 2.6.68.58 0 1.69-.84 2.85-.72.49.02 1.86.2 2.74 1.5-.07.04-1.64.95-1.62 2.97ZM14.1 4.91c.55-.67.95-1.6.85-2.51-.8.03-1.79.54-2.37 1.22-.53.61-.98 1.56-.86 2.45.9.07 1.82-.47 2.38-1.16Z" />
    </svg>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  const handleSignup = () => {
    if (!trimmedName) {
      push("Please enter your name.");
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      push("Please enter a valid email address.");
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      push("Password must be at least 6 characters and include letters and numbers.");
      return;
    }

    setLoading(true);
    void apiSignup({ name: trimmedName, email: trimmedEmail, password })
      .then((res) => {
        setAuthSession(res.token, res.user);
        push("Account created");
        router.replace("/workspace-setup");
      })
      .catch(() => push("Unable to create account"))
      .finally(() => setLoading(false));
  };

  const handleProviderClick = (provider: "Google" | "Facebook" | "Apple") => {
    push(`${provider} sign up coming soon`);
  };

  const handleSignupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    handleSignup();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-sky-200/70 via-sky-100/70 to-zinc-100 p-4 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.6),_transparent_60%)] dark:bg-none" />
      <div className="pointer-events-none absolute -bottom-16 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full border border-white/50 dark:border-zinc-700/30" />
      <div className="pointer-events-none absolute -bottom-10 left-1/2 h-[22rem] w-[22rem] -translate-x-1/2 rounded-full border border-white/50 dark:border-zinc-700/30" />
      <div className="absolute right-4 top-4 z-10">
        <HeaderThemeControl />
      </div>
      <Card className="relative z-10 w-full max-w-md rounded-3xl border-white/70 bg-white/65 p-1 shadow-2xl backdrop-blur-lg dark:border-zinc-800 dark:bg-zinc-900/85">
        <CardHeader className="pb-4 pt-8">
          <div className="mb-4 flex items-center justify-center">
            <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              <UserRoundPlus className="h-5 w-5 text-zinc-700 dark:text-zinc-100" />
            </div>
          </div>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">FlowPilot</p>
          <CardTitle className="mt-2 text-center text-3xl font-semibold tracking-tight">Create account</CardTitle>
          <CardDescription className="mx-auto max-w-xs text-center text-base">Set up your workspace in seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4 pb-8" onSubmit={handleSignupSubmit}>
          <div className="space-y-2">
            <Label htmlFor="signup-name" className="sr-only">
              Name
            </Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                id="signup-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                autoComplete="name"
                className="h-11 rounded-xl border-white/80 bg-white/75 pl-10 dark:border-zinc-700 dark:bg-zinc-800/80"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email" className="sr-only">
              Email
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                className="h-11 rounded-xl border-white/80 bg-white/75 pl-10 dark:border-zinc-700 dark:bg-zinc-800/80"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password" className="sr-only">
              Password
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="h-11 rounded-xl border-white/80 bg-white/75 pl-10 pr-10 dark:border-zinc-700 dark:bg-zinc-800/80"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Use at least 6 characters with letters and numbers.</p>
          <Button
            type="submit"
            className="h-11 w-full rounded-xl bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            disabled={loading || !trimmedName || !trimmedEmail || !password.trim()}
          >
            {loading ? "Creating account..." : "Create account"}
          </Button>
          <div className="pt-1">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-300/70 dark:bg-zinc-700" />
              <p className="text-xs text-zinc-500">Or sign up with</p>
              <div className="h-px flex-1 bg-zinc-300/70 dark:bg-zinc-700" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl bg-white/60 dark:bg-zinc-800/70"
                onClick={() => handleProviderClick("Google")}
              >
                <GoogleIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl bg-white/60 dark:bg-zinc-800/70"
                onClick={() => handleProviderClick("Facebook")}
              >
                <FacebookIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl bg-white/60 dark:bg-zinc-800/70"
                onClick={() => handleProviderClick("Apple")}
              >
                <AppleIcon />
              </Button>
            </div>
          </div>
          <p className="text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
              Sign in
            </Link>
          </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
