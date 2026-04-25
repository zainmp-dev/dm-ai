"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PublishingPlatform } from "@/lib/types";

const OPTIONS: { id: PublishingPlatform; label: string; description: string; disabled?: boolean }[] = [
  { id: "linkedin", label: "LinkedIn", description: "Professional feed and company updates" },
  { id: "instagram", label: "Instagram", description: "Visual storytelling and reels" },
  { id: "facebook", label: "Facebook", description: "Community posts and mixed media" },
  { id: "twitter", label: "Twitter / X", description: "Short-form updates and real-time threads", disabled: true },
];

const ACTIVE_OPTIONS = OPTIONS.filter((opt) => !opt.disabled);

export function PlatformSelectDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Select Publishing Platform",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (platforms: PublishingPlatform[]) => void;
  title?: string;
}) {
  const [selected, setSelected] = useState<PublishingPlatform[]>([]);
  const allChecked = useMemo(() => selected.length === ACTIVE_OPTIONS.length, [selected]);

  const toggleOption = (id: PublishingPlatform) => {
    const option = OPTIONS.find((opt) => opt.id === id);
    if (option?.disabled) return;
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? ACTIVE_OPTIONS.map((opt) => opt.id) : []);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelected([]);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Choose where this asset should be routed after approval.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
            <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
            <span>
              <span className="block font-medium">All Media (publish after all media)</span>
              <span className="block text-xs text-zinc-500">Select all connected platforms at once</span>
            </span>
          </label>
          {OPTIONS.map((opt) => (
            <label
              key={opt.id}
              title={opt.disabled ? "Coming soon" : undefined}
              className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-left transition ${
                opt.disabled ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-60" : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              <input type="checkbox" className="mt-1" checked={selected.includes(opt.id)} disabled={opt.disabled} onChange={() => toggleOption(opt.id)} />
              <span>
                <p className="font-medium text-zinc-900">{opt.label}</p>
                <p className="text-xs font-normal text-zinc-500">
                  {opt.description}
                  {opt.disabled ? " (Coming soon)" : ""}
                </p>
              </span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0}
            onClick={() => {
              onConfirm(selected);
              handleClose(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
