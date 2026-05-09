import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignView } from "@/components/campaigns/campaign-view";

function CampaignFallback() {
  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<CampaignFallback />}>
      <CampaignView />
    </Suspense>
  );
}
