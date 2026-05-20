"use client";

import Link from "next/link";
import { useState } from "react";
import { apiAnalyzeContent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";

type AnalyticsResult = {
  performance_summary: string;
  what_worked: string[];
  what_failed: string[];
  improvements: string[];
};

/** Trend charts use live GET /workspace series (publishing log + leads); this page is the AI review tool only. */
export default function AnalyticsPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const { push } = useToast();
  const [content, setContent] = useState("");
  const [likes, setLikes] = useState(0);
  const [comments, setComments] = useState(0);
  const [reach, setReach] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyticsResult | null>(null);

  if (shellPending) {
    return <Skeleton className="h-[520px] w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600">
        <span className="text-zinc-500">Content performance and lead growth charts use live workspace data on the </span>
        <Link href="/dashboard" className="font-medium text-zinc-900 underline-offset-2 hover:underline">
          Dashboard
        </Link>
        <span className="text-zinc-500">.</span>
      </p>
      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Analytics agent</CardTitle>
          <p className="text-xs font-normal text-zinc-500">
            Paste metrics and copy for an AI summary — optional supplement to your dashboard trends.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="analytics-content">Content</Label>
            <Textarea
              id="analytics-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-28 rounded-xl"
              placeholder="Paste a published post or campaign message..."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="analytics-likes">Likes</Label>
              <Input id="analytics-likes" type="number" min={0} value={likes} onChange={(event) => setLikes(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="analytics-comments">Comments</Label>
              <Input id="analytics-comments" type="number" min={0} value={comments} onChange={(event) => setComments(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="analytics-reach">Reach</Label>
              <Input id="analytics-reach" type="number" min={0} value={reach} onChange={(event) => setReach(Number(event.target.value))} />
            </div>
          </div>
          <Button
            type="button"
            className="rounded-xl"
            disabled={analyzing || !content.trim()}
            onClick={() => {
              setAnalyzing(true);
              void apiAnalyzeContent({ content, likes, comments, reach, aiModel: selectedAiModel })
                .then(setResult)
                .then(() => push("Analytics agent completed review"))
                .catch(() => push("Analytics review failed"))
                .finally(() => setAnalyzing(false));
            }}
          >
            {analyzing ? "Analyzing..." : "Analyze performance"}
          </Button>
          {result && (
            <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <p>
                <span className="font-medium text-zinc-900">Summary:</span> {result.performance_summary}
              </p>
              <InsightList title="What worked" items={result.what_worked} />
              <InsightList title="What failed" items={result.what_failed} />
              <InsightList title="Improvements" items={result.improvements} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium text-zinc-900">{title}</p>
      <ul className="mt-1 list-inside list-disc space-y-1">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
