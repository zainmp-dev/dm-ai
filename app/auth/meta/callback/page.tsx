"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function MetaCallbackPage() {
  const params = useSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-2xl rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Meta OAuth callback</CardTitle>
          <CardDescription>Use this page to verify Facebook/Instagram authorization and capture the code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-medium">Authorization failed: {error}</p>
              <p className="mt-1 break-words text-xs">{errorDescription || "No additional details provided."}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {code ? "Authorization code received successfully." : "Waiting for authorization code in query params."}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Authorization code</p>
            <Input readOnly value={code ?? ""} placeholder="code will appear here" className="font-mono text-xs" />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">State</p>
            <Input readOnly value={state ?? ""} placeholder="state value will appear here" className="font-mono text-xs" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="rounded-xl" asChild>
              <Link href="/settings">Back to Settings</Link>
            </Button>
            <Button type="button" className="rounded-xl" asChild>
              <Link href="/publishing">Go to Publishing</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
