"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminPaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  loading,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (nextPage: number) => void;
}) {
  const hasPrev = total > 0 && page > 1;
  const hasNext = total > 0 && totalPages > 0 && page < totalPages;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-[#f1f5f9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800",
        loading && "opacity-70",
      )}
    >
      <p className="text-[12px] text-[#64748b] dark:text-zinc-500">
        {total === 0 ? (
          "No rows match."
        ) : (
          <>
            Showing{" "}
            <span className="font-medium tabular-nums text-[#0f172a] dark:text-zinc-300">
              {start}–{end}
            </span>{" "}
            of <span className="tabular-nums">{total}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasPrev || loading}
          className="h-8 rounded-lg px-2"
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-[7rem] text-center text-[12px] tabular-nums text-[#475569] dark:text-zinc-400">
          {total === 0 ? (
            "—"
          ) : (
            <>
              Page {page} / {totalPages}
            </>
          )}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasNext || loading}
          className="h-8 rounded-lg px-2"
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
