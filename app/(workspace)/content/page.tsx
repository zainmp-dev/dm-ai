"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ContentStatusBadge } from "@/components/status-badge";
import { useMarketingStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";

export default function ContentPage() {
  const content = useMarketingStore((s) => s.content);
  const setStatus = useMarketingStore((s) => s.setStatus);
  const updateContent = useMarketingStore((s) => s.updateContent);
  const { push } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");

  const activeItem = useMemo(() => content.find((item) => item.id === editingId) ?? null, [content, editingId]);

  return (
    <div className="space-y-4">
      {content.map((item) => (
        <Card key={item.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{item.title}</CardTitle>
              <p className="mt-1 text-sm text-zinc-500">
                {item.platform} - {item.mediaType}
              </p>
            </div>
            <ContentStatusBadge status={item.status} />
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-center">
            <img src={item.mediaPreview} alt={item.title} className="h-28 w-full rounded-xl object-cover" />
            <p className="text-sm text-zinc-700">{item.contentText}</p>
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setStatus([item.id], "APPROVED");
                  push("Content approved");
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditingId(item.id);
                  setDraftTitle(item.title);
                  setDraftText(item.contentText);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setStatus([item.id], "REJECTED");
                  push("Content rejected");
                }}
              >
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {activeItem && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/30 p-4">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle>Edit Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
              <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    updateContent(activeItem.id, { title: draftTitle, contentText: draftText, status: "PENDING" });
                    setEditingId(null);
                    push("Content updated");
                  }}
                >
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
