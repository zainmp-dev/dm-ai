"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, CalendarRange, CheckSquare, FileText, Gauge, Rocket, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/strategy", label: "Strategy", icon: BarChart3 },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/approval", label: "Approval", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/publishing", label: "Publishing", icon: Rocket },
  { href: "/leads", label: "Leads", icon: UsersRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-64 border-r border-zinc-200 bg-white p-4 md:block">
        <div className="mb-6 rounded-2xl border border-zinc-200 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Operations</p>
          <h2 className="text-base font-semibold text-zinc-900">Marketing System</h2>
        </div>
        <nav className="space-y-1">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100",
                  active && "bg-zinc-900 text-white hover:bg-zinc-900",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 px-6 py-4 backdrop-blur">
          <h1 className="text-lg font-semibold text-zinc-900">Marketing Automation System</h1>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
