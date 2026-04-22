"use client";

import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublishingStatusBadge } from "@/components/status-badge";
import { useMarketingStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";

export default function PublishingPage() {
  const logs = useMarketingStore((s) => s.publishingLog);
  const publishDueContent = useMarketingStore((s) => s.publishDueContent);
  const { push } = useToast();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Publishing Log</CardTitle>
        <Button
          onClick={() => {
            const result = publishDueContent();
            push(`Publish run complete: ${result.success} success, ${result.failed} failed, ${result.leadsAdded} leads`);
          }}
        >
          Run Publish Cycle
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {logs.length === 0 && <p className="text-sm text-zinc-500">No publishing activity yet.</p>}
        {logs.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-200 p-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">{item.platform}</p>
              <p className="text-xs text-zinc-500">{format(new Date(item.timestamp), "PPP p")}</p>
            </div>
            <PublishingStatusBadge status={item.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
