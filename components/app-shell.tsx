"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Command,
  FileText,
  Images,
  LayoutDashboard,
  LineChart,
  Plug,
  Rocket,
  Calendar,
  Settings,
  Sparkles,
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
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationEntry } from "@/components/notification-entry";
import { clearAuthSession } from "@/lib/auth";
import { AI_MODEL_OPTIONS } from "@/lib/ai-models";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/command-center": "Command Center",
  "/strategy": "Strategy",
  "/content": "Content",
  "/approval": "Approval",
  "/scheduling": "Scheduling",
  "/publishing": "Publishing",
  "/notifications": "Notifications",
  "/profile": "Profile",
  "/settings": "Settings",
  "/media": "Media Setup",
  "/workspace-setup": "Workspace Setup",
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/command-center", label: "AI Workflow", icon: Command },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/approval", label: "Approval", icon: Check },
  { href: "/scheduling", label: "Scheduling", icon: Calendar },
  { href: "/publishing", label: "Publishing", icon: Rocket },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/media", label: "Media Setup", icon: Images },
];

function NavSection({
  items,
  collapsed,
  pathname,
}: {
  items: { href: string; label: string; icon: typeof LayoutDashboard }[];
  collapsed: boolean;
  pathname: string;
}) {
  return (
    <div className="space-y-1">
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
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const setSelectedAiModel = useWorkspaceStore((s) => s.setSelectedAiModel);
  const loading = useWorkspaceStore((s) => s.loading);
  const error = useWorkspaceStore((s) => s.error);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);

  const title = PAGE_TITLES[pathname] ?? "Workspace";
  const hasSavedWorkspaceSetup = Boolean(activeWorkspaceId) || workspaceSetups.length > 0;
  const visibleWorkspace = hasSavedWorkspaceSetup ? workspace : null;
  const profile = visibleWorkspace?.profile;
  const workspaceName = visibleWorkspace?.companyName || profile?.company || "FlowPilot Workspace";
  const workspaceWebsite = visibleWorkspace?.companyWebsite || "No website configured";
  const pendingContentCount = visibleWorkspace?.content.filter((item) => item.status === "PENDING").length ?? 0;
  const recentActivities = visibleWorkspace?.activities.slice(0, 5) ?? [];
  const notificationCount = pendingContentCount + recentActivities.length;
  const initials =
    profile?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "U";
  const setupRequired = visibleWorkspace ? !visibleWorkspace.workspaceConfigured : true;
  const showSetupOnly = setupRequired && pathname === "/workspace-setup";

  useEffect(() => {
    if (setupRequired && pathname !== "/workspace-setup") {
      router.replace("/workspace-setup");
    }
  }, [pathname, router, setupRequired]);

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {!showSetupOnly && (
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
          <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {!collapsed && (
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Workflow</p>
            )}
            <NavSection items={navItems} collapsed={collapsed} pathname={pathname} />
          </nav>
          {!collapsed && (
            <div className="border-t border-zinc-100 p-3">
              <Link
                href="/settings"
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 transition hover:bg-slate-50"
              >
                <Plug className="size-3.5" />
                Connect accounts in Settings
              </Link>
            </div>
          )}
        </aside>
      )}

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
                        <Link href="/workspace-setup">Open setup</Link>
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
              {/* <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input readOnly placeholder="Search workspace..." className="h-10 rounded-2xl border-zinc-200 bg-zinc-50 pl-9" />
              </div> */}
              <label className="flex h-10 min-w-[190px] items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-xs text-zinc-500">
                <Sparkles className="size-4 text-blue-600" />
                <select
                  value={selectedAiModel}
                  onChange={(event) => setSelectedAiModel(event.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-zinc-800 outline-none"
                  aria-label="Select AI model"
                >
                  {AI_MODEL_OPTIONS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="relative size-10 rounded-xl" aria-label="Notifications">
                      <Bell className="size-5 text-zinc-600" />
                      {notificationCount > 0 && (
                        <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                          {notificationCount > 9 ? "9+" : notificationCount}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 rounded-xl p-2">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-semibold text-zinc-900">Notifications</p>
                      <p className="text-xs text-zinc-500">Recent workspace updates and approvals.</p>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="max-h-80 space-y-2 overflow-y-auto p-1">
                      {pendingContentCount > 0 && (
                        <Link
                          href="/content"
                          className="block rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 transition-colors hover:border-amber-300 hover:bg-amber-50/80"
                        >
                          <span className="font-medium text-amber-950">Approval required</span>
                          <span className="mt-0.5 block text-xs text-amber-900/85">
                            {pendingContentCount} post{pendingContentCount === 1 ? "" : "s"} pending — open Content
                          </span>
                        </Link>
                      )}
                      {recentActivities.length === 0 && pendingContentCount === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500">
                          You are all caught up.
                        </div>
                      ) : (
                        recentActivities.map((item) => <NotificationEntry key={item.id} text={item.text} createdAt={item.createdAt} variant="dropdown" />)
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/notifications">View all notifications</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                      <Link href="/workspace-setup">{visibleWorkspace?.workspaceConfigured ? "Change workspace setup" : "Set up workspace"}</Link>
                    </DropdownMenuItem>
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
