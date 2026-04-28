"use client";

import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  busy?: boolean;
  onFiles: (files: File[]) => void;
  accept?: string;
  hint?: ReactNode;
  className?: string;
};

export function MediaLocalDropzone({ disabled, busy, onFiles, accept = "image/*,video/*", hint, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const runFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (disabled || busy) return;
    runFiles(e.dataTransfer.files);
  };

  return (
    <div className={className}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => {
          if (!disabled && !busy) inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled && !busy) setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDrag(false);
        }}
        onDrop={onDrop}
        className={cn(
          "group flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-[border-color,background-color]",
          "border-zinc-300 bg-zinc-50/80 hover:border-zinc-400 hover:bg-zinc-100/80",
          "dark:border-zinc-600 dark:bg-zinc-900/50 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50",
          (disabled || busy) && "pointer-events-none cursor-not-allowed opacity-60",
          drag && "border-blue-500 bg-blue-50/50 dark:border-blue-400/80 dark:bg-blue-950/30",
        )}
      >
        {busy ? (
          <Loader2 className="size-8 animate-spin text-zinc-500" aria-hidden />
        ) : (
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-zinc-800">
            <Upload className="size-6 text-zinc-600 group-hover:text-zinc-900 dark:text-zinc-300 dark:group-hover:text-zinc-100" />
          </div>
        )}
        <div className="max-w-sm space-y-1">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {busy ? "Uploading…" : "Drop files here or click to browse"}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Images and videos, multiple files supported · max 8MB per file</p>
        </div>
        {hint}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept}
        multiple
        disabled={disabled || busy}
        onChange={(e) => {
          runFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
