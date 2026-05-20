"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Workspace management lives under Settings → Workspace.
 * This route remains for old links and redirects there, preserving query parameters (e.g. OAuth toasts).
 */
export default function WorkspaceSetupRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (!params.get("section")) {
      params.set("section", "workspace");
    }
    const qs = params.toString();
    router.replace(qs ? `/settings?${qs}` : "/settings?section=workspace");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-zinc-400" aria-hidden />
    </div>
  );
}
