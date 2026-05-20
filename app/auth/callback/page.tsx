"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, startTransition, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiCompleteOAuth, apiErrorMessage } from "@/lib/api";
import { setAuthSession, hasAdminConsoleAccess, getAuthUser, type AuthUser } from "@/lib/auth";
import { useWorkspaceStore } from "@/lib/workspace-store";

const oauthCallbackInflight = new Map<string, Promise<{ token: string; user: AuthUser }>>();

function oauthCallbackPromise(code: string, state: string) {
  const key = `${code}\n${state}`;
  let p = oauthCallbackInflight.get(key);
  if (!p) {
    p = apiCompleteOAuth({ code, state }).finally(() => {
      oauthCallbackInflight.delete(key);
    });
    oauthCallbackInflight.set(key, p);
  }
  return p;
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackShell code="" state="" />}>
      <OAuthCallbackContent />
    </Suspense>
  );
}

function OAuthCallbackContent() {
  const params = useSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");
  return (
    <CallbackShell
      code={code ?? ""}
      state={state ?? ""}
      error={error ?? ""}
      errorDescription={errorDescription ?? ""}
    />
  );
}

function CallbackShell({
  code,
  state,
  error = "",
  errorDescription = "",
}: {
  code: string;
  state: string;
  error?: string;
  errorDescription?: string;
}) {
  const [status, setStatus] = useState<"idle" | "ok" | "failed">("idle");
  const [message, setMessage] = useState("");
  const ready = useMemo(() => Boolean(code && state && !error), [code, state, error]);

  useEffect(() => {
    if (!error) return;
    startTransition(() => {
      setStatus("failed");
      setMessage(errorDescription || error);
    });
  }, [error, errorDescription]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void oauthCallbackPromise(code, state)
      .then(async (res) => {
        if (cancelled) return;
        setAuthSession(res.token, res.user);
        await useWorkspaceStore.getState().syncAuthSessionFromServer().catch(() => {});
        setStatus("ok");
        setMessage("Signed in. Redirecting...");
        const target = hasAdminConsoleAccess(getAuthUser()) ? "/admin" : "/dashboard";
        window.location.replace(target);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus("failed");
        setMessage(apiErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [ready, code, state]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle>Social sign-in callback</CardTitle>
          <CardDescription>Finalizing your login securely.</CardDescription>
        </CardHeader>
        <CardContent>
          {status === "failed" ? (
            <p className="text-sm text-red-600 dark:text-red-400">{message || "Sign-in failed. Please try again from login."}</p>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {status === "ok" ? message : "Verifying your account..."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
