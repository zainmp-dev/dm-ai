"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  BarChart3,
  Bell,
  CalendarRange,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Command,
  Images,
  FileText,
  LayoutDashboard,
  LineChart,
  Plug,
  Sparkles,
  Rocket,
  Search,
  Settings,
  Wrench,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { clearAuthSession } from "@/lib/auth";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/command-center": "Command Center",
  "/strategy": "Strategy",
  "/content": "Content",
  "/approval": "Approval",
  "/scheduling": "Scheduling",
  "/publishing": "Publishing",
  "/analytics": "Analytics",
  "/notifications": "Notifications",
  "/profile": "Profile",
  "/settings": "Settings",
  "/workspace-setup": "Workspace Setup",
  "/media": "Media",
};

const navMain = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/command-center", label: "Command Center", icon: Command },
  { href: "/strategy", label: "Strategy", icon: BarChart3 },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/publishing", label: "Publishing", icon: Rocket },
];

const navMarketing = [{ href: "/settings", label: "Settings", icon: Settings }];

const navSales = [{ href: "/profile", label: "Profile", icon: UserRound }];

const navSystem = [
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const navUser = [
  { href: "/workspace-setup", label: "Workspace Setup", icon: Wrench },
  { href: "/media", label: "Media", icon: Images },
  { href: "/approval", label: "Approval Queue", icon: CheckSquare },
  { href: "/scheduling", label: "Scheduling", icon: CalendarRange },
];

function NavSection({
  title,
  items,
  collapsed,
  pathname,
}: {
  title: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
  collapsed: boolean;
  pathname: string;
}) {
  return (
    <div className="space-y-1">
      {!collapsed && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</p>}
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100",
              active && "bg-blue-600 text-white hover:bg-blue-600",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useWorkspaceStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useWorkspaceStore((s) => s.setSidebarCollapsed);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceSetups = useWorkspaceStore((s) => s.workspaceSetups);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const error = useWorkspaceStore((s) => s.error);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);

  const title = PAGE_TITLES[pathname] ?? "Workspace";
  const profile = workspace?.profile;
  const workspaceName = workspace?.companyName || profile?.company || "FlowPilot Workspace";
  const workspaceWebsite = workspace?.companyWebsite || "No website configured";
  const initials =
    profile?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "U";

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside
        className={cn(
          "sticky top-0 flex h-screen flex-col border-r border-zinc-200 bg-gradient-to-b from-white to-slate-50 transition-[width] duration-200 ease-out",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <div className={cn("flex items-center gap-2 border-b border-zinc-100 p-3", collapsed && "justify-center")}>
          {!collapsed && (
            <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">FlowPilot</p>
              <p className="truncate text-sm font-semibold text-slate-900">{workspaceName}</p>
              <p className="truncate text-xs text-slate-500">{workspaceWebsite}</p>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="size-9 shrink-0 rounded-xl border-slate-200 bg-white p-0"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          {/* {!collapsed && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                <Sparkles className="size-3.5" />
                Atlassian-style workspace
              </p>
              <p className="mt-1 text-xs text-blue-700/80">Structured navigation with setup-first workflow.</p>
            </div>
          )} */}
          <NavSection title="Main" items={navMain} collapsed={collapsed} pathname={pathname} />
          <NavSection title="Marketing" items={navMarketing} collapsed={collapsed} pathname={pathname} />
          <NavSection title="Sales" items={navSales} collapsed={collapsed} pathname={pathname} />
          <NavSection title="System" items={navSystem} collapsed={collapsed} pathname={pathname} />
          <Separator className="my-1" />
          <NavSection title="User" items={navUser} collapsed={collapsed} pathname={pathname} />
        </nav>
        {!collapsed && (
          <div className="border-t border-zinc-100 p-3">
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition hover:bg-slate-50"
            >
              <Plug className="size-3.5" />
              Integrations live in Settings
            </Link>
          </div>
        )}
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h1>
              {!error && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg border-slate-200 text-xs text-slate-600">
                        {workspaceName}
                        <ChevronsUpDown className="ml-1 size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72 rounded-xl">
                      <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {workspaceSetups.length === 0 && <DropdownMenuItem disabled>No configured workspaces yet</DropdownMenuItem>}
                      {workspaceSetups.map((item) => (
                        <DropdownMenuItem key={item.id} onClick={() => void setActiveWorkspace(item.id)} className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">{item.companyName}</span>
                            <span className="block truncate text-xs text-slate-500">{item.website || "No website"}</span>
                          </span>
                          {item.id === activeWorkspaceId && <Check className="size-4 text-blue-600" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/workspace-setup">Manage workspace setup</Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <p className="text-xs text-slate-500">{workspaceWebsite}</p>
                </div>
              )}
              {error && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-red-600">
                  {error}
                  <Button type="button" size="sm" variant="outline" className="h-7 rounded-lg text-xs" onClick={() => void refreshWorkspace()}>
                    Retry
                  </Button>
                </p>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:max-w-xl">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input readOnly placeholder="Search workspace…" className="h-10 rounded-2xl border-zinc-200 bg-zinc-50 pl-9" />
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" className="size-10 rounded-xl" asChild>
                  <Link href="/notifications" aria-label="Notifications">
                    <Bell className="size-5 text-zinc-600" />
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" className="h-10 gap-2 rounded-2xl px-2">
                      {loading && !profile ? (
                        <Skeleton className="size-9 rounded-full" />
                      ) : (
                        <span className="flex size-9 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                          {initials}
                        </span>
                      )}
                      {!loading && profile && (
                        <span className="hidden text-left text-sm lg:block">
                          <span className="block font-medium text-zinc-900">{profile.name}</span>
                          <span className="block max-w-[160px] truncate text-xs text-zinc-500">{profile.email}</span>
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl">
                    <DropdownMenuLabel>Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/profile">Profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings">Settings</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        clearAuthSession();
                        router.replace("/login");
                      }}
                    >
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
