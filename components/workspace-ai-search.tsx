"use client";

import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { labelForAiModel } from "@/lib/ai-models";
import { apiErrorMessage, apiWorkspaceSearch } from "@/lib/api";

type WorkspaceAiSearchProps = {
  selectedAiModel: string;
  workspaceConfigured: boolean;
};

export function WorkspaceAiSearch({ selectedAiModel, workspaceConfigured }: WorkspaceAiSearchProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const { push } = useToast();

  const run = async () => {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setAnswer("");
    try {
      const data = await apiWorkspaceSearch({ query, aiModel: selectedAiModel });
      setAnswer(data.answer);
    } catch (e) {
      push(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* <Button
        type="button"
        variant="outline"
        disabled={!workspaceConfigured}
        title={workspaceConfigured ? "Ask questions about this workspace" : "Add a company name (profile or workspace) to enable AI search"}
        className="h-10 min-w-0 flex-1 gap-2 rounded-2xl border-zinc-200 bg-white px-3 text-left text-sm text-zinc-600 shadow-none hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">Search workspace with AI…</span>
      </Button> */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setAnswer("");
        }}
      >
        <DialogContent className="flex max-h-[min(36rem,92vh)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-zinc-100 px-6 pb-4 pt-6 dark:border-zinc-800">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-blue-600" aria-hidden />
              Workspace AI search
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Answers use your saved strategy, competitors, and content. Model: {labelForAiModel(selectedAiModel)} (same as Command Center).
            </DialogDescription>
          </DialogHeader>
          <div className="shrink-0 space-y-3 px-6 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-ai-q" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Question
              </Label>
              <Input
                id="ws-ai-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. Which competitor gap is strongest for our next campaign?"
                className="rounded-xl border-zinc-200 dark:border-zinc-700"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void run();
                  }
                }}
              />
            </div>
            <Button type="button" className="w-full rounded-xl" disabled={loading || !q.trim()} onClick={() => void run()}>
              {loading ? "Searching…" : "Ask AI"}
            </Button>
          </div>
          {answer ? (
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-100 bg-gradient-to-b from-zinc-50/90 to-white px-6 py-4 dark:border-zinc-800 dark:from-zinc-950/50 dark:to-zinc-900/20">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{answer}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
