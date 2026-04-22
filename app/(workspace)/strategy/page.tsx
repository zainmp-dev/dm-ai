"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Competitor, StrategyPlan } from "@/lib/types";

export default function StrategyPage() {
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [strategy, setStrategy] = useState<StrategyPlan | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    const response = await fetch("/api/strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company }),
    });
    const data = (await response.json()) as { competitors: Competitor[]; strategy: StrategyPlan };
    setCompetitors(data.competitors);
    setStrategy(data.strategy);
    setLoading(false);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Market Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name or website" />
          <Button className="w-full" onClick={runAnalysis}>
            Generate Analysis
          </Button>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
            Build a directional strategy and competitor profile using realistic market assumptions.
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Competitors</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {loading &&
              Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32" />)}
            {!loading &&
              competitors.map((item) => (
                <div key={item.id} className="rounded-xl border border-zinc-200 p-4">
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-sm text-zinc-600">{item.positioning}</p>
                  <p className="mt-2 text-xs text-zinc-500">Strengths: {item.strengths.join(", ")}</p>
                  <p className="mt-1 text-xs text-zinc-500">Weaknesses: {item.weaknesses.join(", ")}</p>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Strategy Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-700">
            {loading && <Skeleton className="h-32" />}
            {!loading && strategy && (
              <>
                <p>
                  <span className="font-medium text-zinc-900">Target audience:</span> {strategy.targetAudience}
                </p>
                <p>
                  <span className="font-medium text-zinc-900">Content themes:</span> {strategy.contentThemes.join(", ")}
                </p>
                <p>
                  <span className="font-medium text-zinc-900">Platform focus:</span> {strategy.platformFocus.join(", ")}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
