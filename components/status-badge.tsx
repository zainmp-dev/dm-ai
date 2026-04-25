import { Badge } from "@/components/ui/badge";
import type { ContentStatus, CrmStatus, PublishStatus } from "@/lib/types";

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const style =
    status === "APPROVED"
      ? "bg-sky-100 text-sky-800"
      : status === "SCHEDULED"
        ? "bg-violet-100 text-violet-800"
      : status === "PUBLISHED"
        ? "bg-emerald-100 text-emerald-800"
        : status === "REJECTED"
          ? "bg-red-100 text-red-800"
          : "bg-amber-100 text-amber-800";
  return <Badge className={style}>{status}</Badge>;
}

export function PublishingStatusBadge({ status }: { status: PublishStatus }) {
  return <Badge className={status === "Success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>{status}</Badge>;
}

export function CrmStatusBadge({ status }: { status: CrmStatus }) {
  return <Badge className={status === "Synced" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-700"}>{status}</Badge>;
}
