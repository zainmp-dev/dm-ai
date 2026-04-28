import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineContent } from "./pipeline-content";

function PipelineFallback() {
  return (
    <div className="w-full min-w-0 space-y-5">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-2 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<PipelineFallback />}>
      <PipelineContent />
    </Suspense>
  );
}
