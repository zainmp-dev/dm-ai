"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { Eye, EyeOff, Lock, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage, apiLogin, apiStartOAuth } from "@/lib/api";
import { setAuthSession } from "@/lib/auth";
import axios from "axios";

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

export default function LoginPage() {
  const router = useRouter();
  const { push } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"" | "google" | "facebook">("");
  const trimmedEmail = email.trim();

  const handleLogin = () => {
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      push("Please enter a valid email address.", { kind: "error" });
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      push("Password must be at least 6 characters and include letters and numbers.", { kind: "error" });
      return;
    }

    setLoading(true);
    void apiLogin({ email: trimmedEmail, password })
      .then((res) => {
        setAuthSession(res.token, res.user);
        push("Welcome back.", { kind: "success" });
        // Avoid an extra post-login workspace fetch here; dashboard loads what it needs.
        router.replace("/dashboard");
      })
      .catch((error: unknown) => {
        if (axios.isAxiosError(error)) {
          if (error.code === "ECONNABORTED" || !error.response) {
            push("Server is slow to respond — please try again in a few seconds.", { kind: "error" });
            return;
          }
          const detail = error.response?.data?.detail;
          if (typeof detail === "string" && detail.trim()) {
            push(detail, { kind: "error" });
            return;
          }
        }
        push("Invalid credentials. Create an account first if this is your first login.", { kind: "error" });
      })
      .finally(() => setLoading(false));
  };

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    handleLogin();
  };

  const handleOAuthStart = (provider: "google" | "facebook") => {
    if (loading || oauthLoading) return;
    setOauthLoading(provider);
    void apiStartOAuth({
      provider,
      intent: "login",
      appOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
    })
      .then(({ auth_url }) => {
        if (!auth_url) throw new Error("Missing authorization URL");
        window.location.assign(auth_url);
      })
      .catch((error: unknown) => {
        push(apiErrorMessage(error) || "Unable to start social sign-in.", { kind: "error" });
      })
      .finally(() => setOauthLoading(""));
  };

  const handleTogglePassword = () => {
    setShowPassword((prev) => !prev);
    requestAnimationFrame(() => {
      passwordInputRef.current?.focus();
    });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8fbff] p-4 text-[#0f172a]">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-[#2563EB]/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[20rem] w-[20rem] rounded-full bg-[#60a5fa]/20 blur-[110px]" />
      <div className="w-full max-w-md">
      <Card className="relative z-10 w-full rounded-3xl border-slate-200 bg-white p-1 shadow-xl">
        <CardHeader className="pb-4 pt-8">
          <div className="mb-4 flex items-center justify-center">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-3 shadow-sm">
              <LogIn className="h-5 w-5 text-[#0f172a]" />
            </div>
          </div>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]">FlowPilot</p>
          <CardTitle className="mt-2 text-center text-3xl font-semibold tracking-tight">Sign in with email</CardTitle>
          <CardDescription className="mx-auto max-w-xs text-center text-base text-[#64748b]">
            Log in to your workspace and continue your flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4 pb-8" onSubmit={handleLoginSubmit}>
          <div className="space-y-2">
            <Label htmlFor="login-email" className="sr-only">
              Email
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-[#0f172a] placeholder:text-[#94a3b8]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password" className="sr-only">
              Password
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
              <Input
                ref={passwordInputRef}
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="h-11 rounded-xl border-slate-200 bg-white pl-10 pr-10 text-[#0f172a] placeholder:text-[#94a3b8]"
                autoComplete="current-password"
              />
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleTogglePassword();
                }}
                className="absolute inset-y-0 right-0 z-30 flex w-11 cursor-pointer items-center justify-center text-[#64748b] transition-colors hover:text-[#0f172a]"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="text-sm text-[#64748b] hover:text-[#0f172a] hover:underline"
              onClick={() => push("Forgot password flow is being rolled out.", { kind: "info" })}
            >
              Forgot password?
            </button>
          </div>
          <Button
            type="submit"
            className="h-11 w-full rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8]"
            disabled={loading || !trimmedEmail || !password.trim()}
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <div className="pt-1">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <p className="text-xs text-[#64748b]">Or sign in with</p>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-slate-200 bg-white"
                disabled={loading || Boolean(oauthLoading)}
                aria-label="Sign in with Google"
                onClick={() => handleOAuthStart("google")}
              >
                <GoogleIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-slate-200 bg-white"
                disabled={loading || Boolean(oauthLoading)}
                aria-label="Sign in with Facebook"
                onClick={() => handleOAuthStart("facebook")}
              >
                <FacebookIcon />
              </Button>
            </div>
            {oauthLoading ? (
              <p className="mt-2 text-center text-xs text-[#64748b]">Redirecting to {oauthLoading}…</p>
            ) : null}
          </div>
          <p className="text-center text-sm text-[#64748b]">
            No account?{" "}
            <Link href="/signup" className="font-medium text-[#0f172a] hover:underline">
              Create account
            </Link>
          </p>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
