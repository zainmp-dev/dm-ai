"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import type { AdminNavItem } from "@/lib/admin/nav-config";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function AdminCommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: AdminNavItem[];
}) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>("[data-admin-command-input]");
      input?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const grouped = useMemo(() => items, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden border-[#e5e7eb] p-0 dark:border-zinc-800 [&>button]:hidden">
        <Command className="rounded-2xl bg-white dark:bg-zinc-900">
          <div className="border-b border-[#e5e7eb] px-3 py-2 dark:border-zinc-800">
            <div className="flex items-center justify-between px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-[#64748b] dark:text-zinc-500">
              <span>Command palette</span>
              <span className="tabular-nums">⌘K</span>
            </div>
            <Command.Input
              data-admin-command-input
              placeholder="Jump to section…"
              className="flex h-10 w-full rounded-xl border border-[#e5e7eb] bg-[#fafafa] px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#1a56db]/25 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <Command.List className="max-h-[min(56vh,360px)] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-[13px] text-[#64748b]">No matches.</Command.Empty>
            <Command.Group heading="Navigate">
              {grouped.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`${item.label} ${item.href}`}
                  onSelect={() => {
                    onOpenChange(false);
                    router.push(item.href);
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] text-[#0f172a] aria-selected:bg-[#1a56db]/10 aria-selected:text-[#1a56db] dark:text-zinc-100 dark:aria-selected:bg-blue-500/15 dark:aria-selected:text-blue-100"
                >
                  <item.icon className="size-4 shrink-0 opacity-90" strokeWidth={1.75} />
                  <span>{item.label}</span>
                  <span className="ml-auto truncate text-[11px] text-[#94a3b8] dark:text-zinc-500">{item.href}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
