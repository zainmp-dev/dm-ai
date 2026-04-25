"use client";

import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronRight } from "lucide-react";
import { notificationIcon, resolveNotificationLink } from "@/lib/notification-routes";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  createdAt: string;
  /** Compact layout for header dropdown */
  variant?: "page" | "dropdown";
};

export function NotificationEntry({ text, createdAt, variant = "page" }: Props) {
  const { href, label, kind } = resolveNotificationLink(text);
  const Icon = notificationIcon(kind);
  const at = new Date(createdAt);
  const absolute = format(at, "MMM d, yyyy · h:mm a");
  const relative = formatDistanceToNow(at, { addSuffix: true });

  return (
    <Link
      href={href}
      className={cn(
        "group flex gap-3 rounded-2xl border bg-white transition-colors",
        variant === "page"
          ? "border-zinc-200 p-4 shadow-sm hover:border-zinc-300 hover:bg-zinc-50/80"
          : "border-zinc-100 px-3 py-2.5 hover:border-zinc-200 hover:bg-zinc-50",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50 text-zinc-600",
          variant === "page" ? "size-10" : "size-8",
        )}
      >
        <Icon className={variant === "page" ? "size-5" : "size-4"} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-zinc-800", variant === "page" ? "text-sm leading-relaxed" : "text-sm leading-snug")}>{text}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
          <time dateTime={createdAt} title={absolute}>
            {absolute}
          </time>
          <span className="text-zinc-300" aria-hidden>
            ·
          </span>
          <span>{relative}</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-700 group-hover:text-blue-800">
          <span>{label}</span>
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      </div>
    </Link>
  );
}
