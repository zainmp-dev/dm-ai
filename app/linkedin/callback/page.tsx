"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const API_PREFIX = (process.env.NEXT_PUBLIC_API_PREFIX || "/api/backend").replace(/\/+$/, "");

/** Dedupe React Strict Mode double-mount and parallel effects (nonce is single-use). */
const linkedInCallbackInflight = new Map<string, Promise<Response>>();

function linkedInCallbackPromise(code: string, state: string): Promise<Response> {
  const key = `${code}\n${state}`;
  let p = linkedInCallbackInflight.get(key);
  if (!p) {
    p = fetch(
      `${API_PREFIX}/auth/linkedin/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    ).finally(() => {
      linkedInCallbackInflight.delete(key);
    });
    linkedInCallbackInflight.set(key, p);
  }
  return p;
}

export default function LinkedinCallbackPage() {
  return (
    <Suspense fallback={<CallbackView code="" state="" />}>
      <LinkedinCallbackContent />
    </Suspense>
  );
}

function LinkedinCallbackContent() {
  const params = useSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  return <CallbackView code={code ?? ""} state={state ?? ""} error={error ?? ""} errorDescription={errorDescription ?? ""} />;
}

function CallbackView({
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
  const [detail, setDetail] = useState("");
  const ready = useMemo(() => Boolean(code && state && !error), [code, state, error]);

  useEffect(() => {
    if (!error) return;
    const m = [error, errorDescription].filter(Boolean).join(" — ").replace(/\s+/g, " ").slice(0, 240);
    window.location.assign(
      `/settings?section=integrations&toast=linkedin_failed&toast_detail=${encodeURIComponent(m)}`,
    );
  }, [error, errorDescription]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void linkedInCallbackPromise(code, state)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(payload.detail || "LinkedIn callback failed");
        }
        setStatus("ok");
        setDetail("LinkedIn account connected");
        window.location.assign("/settings?section=integrations&toast=linkedin_connected");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "LinkedIn callback failed";
        const detail = encodeURIComponent(message.replace(/\s+/g, " ").slice(0, 240));
        window.location.assign(`/settings?section=integrations&toast=linkedin_failed&toast_detail=${detail}`);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, code, state]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-2xl rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>LinkedIn OAuth callback</CardTitle>
          <CardDescription>Use this page to confirm authorization and copy the code for token exchange.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-medium">Authorization failed: {error}</p>
              <p className="mt-1 break-words text-xs">{errorDescription || "No additional details provided."}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {status === "ok"
                ? "Authorization complete. Redirecting to settings…"
                : status === "failed"
                  ? `Authorization code received but connect failed: ${detail}`
                  : code
                    ? "Authorization code received successfully."
                    : "Waiting for authorization code in query params."}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Authorization code</p>
            <Input readOnly value={code} placeholder="code will appear here" className="font-mono text-xs" />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">State</p>
            <Input readOnly value={state} placeholder="state value will appear here" className="font-mono text-xs" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="rounded-xl" asChild>
              <Link href="/settings?section=integrations">Back to Settings</Link>
            </Button>
            <Button type="button" className="rounded-xl" asChild>
              <Link href="/settings?section=integrations">Open Integrations</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
