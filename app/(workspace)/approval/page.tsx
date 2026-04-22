"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentStatusBadge } from "@/components/status-badge";
import { useMarketingStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import type { ContentStatus } from "@/lib/types";

export default function ApprovalPage() {
  const content = useMarketingStore((s) => s.content);
  const setStatus = useMarketingStore((s) => s.setStatus);
  const { push } = useToast();
  const [filter, setFilter] = useState<ContentStatus | "ALL">("PENDING");
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(
    () => (filter === "ALL" ? content : content.filter((item) => item.status === filter)),
    [content, filter],
  );

  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Approval Queue</CardTitle>
        <div className="flex gap-2">
          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((value) => (
            <Button key={value} size="sm" variant={filter === value ? "default" : "secondary"} onClick={() => setFilter(value)}>
              {value}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              setStatus(selected, "APPROVED");
              push("Selected items approved");
              setSelected([]);
            }}
          >
            Bulk approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setStatus(selected, "REJECTED");
              push("Selected items rejected");
              setSelected([]);
            }}
          >
            Bulk reject
          </Button>
        </div>
        {filtered.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-200 p-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
              <div>
                <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                <p className="text-xs text-zinc-500">{item.platform}</p>
              </div>
            </label>
            <ContentStatusBadge status={item.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
