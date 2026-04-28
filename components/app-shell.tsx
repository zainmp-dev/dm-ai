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
  Images,
  LayoutDashboard,
  LineChart,
  Plug,
  Settings,
  Sparkles,
  Workflow,
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
import { AI_MODEL_GROUPS, labelForAiModel } from "@/lib/ai-models";
import { HeaderThemeControl } from "@/components/header-theme-control";
import { OpenrouterBalanceHint } from "@/components/openrouter-balance-hint";
import { WorkspaceAiSearch } from "@/components/workspace-ai-search";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/command-center": "Workflow",
  "/strategy": "Strategy",
  "/content": "Workflow",
  "/pipeline": "Workflow",
  "/approval": "Workflow",
  "/scheduling": "Workflow",
  "/publishing": "Workflow",
  "/notifications": "Notifications",
  "/profile": "Profile",
  "/settings": "Settings",
  "/media": "Media Setup",
  "/workspace-setup": "Workspace Setup",
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Workflow", icon: Workflow },
  { href: "/notifications", label: "Notifications", icon: Bell },
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
    <div className="space-y-2">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          pathname.startsWith(`${item.href}/`) ||
          (item.href === "/pipeline" && pathname === "/command-center");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium leading-none tracking-tight text-zinc-600 transition-[background-color,box-shadow,color,transform] duration-200 ease-out",
              "hover:bg-zinc-900/[0.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100",
              active &&
                "bg-gradient-to-r from-blue-600/[0.12] to-blue-500/[0.06] text-blue-900 shadow-[0_0_0_1px_rgba(37,99,235,0.14),0_4px_20px_-6px_rgba(37,99,235,0.35)] hover:bg-gradient-to-r hover:from-blue-600/[0.14] hover:to-blue-500/[0.07] dark:from-blue-500/15 dark:to-blue-600/10 dark:text-blue-50 dark:shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_4px_24px_-8px_rgba(59,130,246,0.35)] dark:hover:from-blue-500/18 dark:hover:to-blue-600/12",
              collapsed && "justify-center px-2 py-3",
            )}
          >
            <Icon
              strokeWidth={1.75}
              className={cn(
                "size-[18px] shrink-0 transition-colors duration-200",
                !active && "text-zinc-500 group-hover:text-blue-700 dark:text-zinc-500 dark:group-hover:text-blue-300",
                active && "text-blue-700 dark:text-blue-200",
              )}
            />
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

  const title = pathname.startsWith("/competitors/") ? "Competitor research" : PAGE_TITLES[pathname] ?? "Workspace";
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
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#f4f6f9] dark:bg-zinc-950">
      {!showSetupOnly && (
        <aside
          className={cn(
            "flex h-full min-h-0 shrink-0 flex-col border-r border-zinc-200/60 bg-white/70 shadow-[4px_0_32px_-16px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-[width] duration-200 ease-out",
            "dark:border-zinc-800/80 dark:bg-zinc-950/55 dark:shadow-[4px_0_40px_-12px_rgba(0,0,0,0.55)]",
            collapsed ? "w-[4.75rem]" : "w-80",
          )}
        >
          <div
            className={cn(
              "flex min-h-0 items-start gap-2 border-b border-zinc-200/60 px-3 py-4 sm:px-4",
              "dark:border-zinc-800/80",
              collapsed && "flex-col items-center justify-center gap-3 py-4",
            )}
          >
            {!collapsed && (
              <div className="min-w-0 flex-1 rounded-2xl border border-white/80 bg-white/90 px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-zinc-200/60 dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:shadow-none dark:ring-zinc-800/80">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600/85 dark:text-blue-400/90">FlowPilot</p>
                <p className="mt-1.5 truncate text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{workspaceName}</p>
                <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{workspaceWebsite}</p>
              </div>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="size-9 shrink-0 rounded-xl border-zinc-200/90 bg-white/90 text-zinc-700 shadow-sm transition-[border-color,background-color,transform] duration-200 hover:border-zinc-300 hover:bg-white active:scale-[0.97] dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
              onClick={() => setSidebarCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="size-4" strokeWidth={1.75} /> : <ChevronLeft className="size-4" strokeWidth={1.75} />}
            </Button>
          </div>
          <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-2 sm:px-4 sm:py-3">
            <p
              className={cn(
                "mb-3 px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500",
                collapsed && "sr-only",
              )}
            >
              {/* Menu */}
            </p>
            <NavSection items={navItems} collapsed={collapsed} pathname={pathname} />
          </nav>
          <div className="mt-auto border-t border-zinc-200/60 dark:border-zinc-800/80">
            {!collapsed && (
              <div className="px-3 py-4 sm:px-4">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">Workspace</p>
                <Link
                  href="/settings"
                  className="flex items-center gap-3 rounded-xl border border-zinc-200/90 bg-white/80 px-3.5 py-3 text-xs font-medium text-zinc-700 shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-200 hover:border-blue-200/80 hover:bg-blue-50/40 hover:shadow-md active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:border-blue-900/60 dark:hover:bg-blue-950/30"
                >
                  <Plug className="size-4 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
                  Connect accounts in Settings
                </Link>
              </div>
            )}
            {collapsed && (
              <div className="flex justify-center py-3">
                <Link
                  href="/settings"
                  title="Connect accounts in Settings"
                  className="flex size-10 items-center justify-center rounded-xl border border-zinc-200/90 bg-white/80 text-blue-600 transition-[border-color,background-color,transform] duration-200 hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-sm active:scale-[0.97] dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                >
                  <Plug className="size-4" strokeWidth={1.75} />
                </Link>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 shrink-0 border-b border-zinc-200/80 bg-white/75 px-4 py-3.5 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/75 dark:shadow-none sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-[1.125rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
              {!error && (
                <div className="mt-3 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-0 sm:rounded-2xl sm:border sm:border-zinc-200/90 sm:bg-white/60 sm:px-3 sm:py-2 sm:shadow-sm dark:sm:border-zinc-800 dark:sm:bg-zinc-900/40">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 justify-start gap-1.5 rounded-xl px-2 text-left text-xs font-medium text-zinc-800 hover:bg-zinc-900/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-8 sm:shrink-0"
                      >
                        <span className="max-w-[200px] truncate sm:max-w-[10rem]">{workspaceName}</span>
                        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" strokeWidth={1.75} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72 rounded-xl">
                      <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {workspaceSetups.length === 0 && <DropdownMenuItem disabled>No configured workspaces yet</DropdownMenuItem>}
                      {workspaceSetups.map((item) => (
                        <DropdownMenuItem key={item.id} onClick={() => void setActiveWorkspace(item.id)} className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.companyName}</span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.website || "No website"}</span>
                          </span>
                          {item.id === activeWorkspaceId && <Check className="size-4 text-blue-600" strokeWidth={1.75} />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/workspace-setup">Open setup</Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="hidden h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700 sm:block" aria-hidden />
                  <p className="min-w-0 truncate px-1 text-xs leading-snug text-zinc-500 dark:text-zinc-400 sm:px-0 sm:pl-1">{workspaceWebsite}</p>
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
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:max-w-3xl">
              <WorkspaceAiSearch
                selectedAiModel={selectedAiModel}
                workspaceConfigured={Boolean(
                  visibleWorkspace?.workspaceConfigured || (visibleWorkspace?.companyName?.trim() ?? "").length > 0,
                )}
              />
              <div className="flex min-w-[200px] max-w-[20rem] flex-col gap-0.5 sm:max-w-md">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full min-w-[200px] max-w-[17rem] justify-between gap-2 rounded-2xl border-zinc-200 bg-white px-3 text-left text-sm font-medium text-zinc-800 shadow-none hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      aria-label="Select AI model"
                      title="Models on OpenRouter — one shared credit balance for your API key."
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <Sparkles className="size-4 shrink-0 text-blue-600" strokeWidth={1.75} />
                        <span className="truncate">{labelForAiModel(selectedAiModel)}</span>
                      </span>
                      <ChevronsUpDown className="size-4 shrink-0 opacity-50" strokeWidth={1.75} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="max-h-[min(22rem,72vh)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-0"
                  >
                    {AI_MODEL_GROUPS.map((group, gi) => (
                      <div key={group.label} className="py-1">
                        <DropdownMenuLabel className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          {group.label}
                        </DropdownMenuLabel>
                        {group.options.map((model) => (
                          <DropdownMenuItem
                            key={model.value}
                            className="cursor-pointer rounded-none px-3 py-2 focus:bg-zinc-100 dark:focus:bg-zinc-800"
                            onSelect={() => setSelectedAiModel(model.value)}
                          >
                            <span className="flex w-full items-center justify-between gap-2">
                              <span className="truncate text-sm">{model.label}</span>
                              {model.value === selectedAiModel && <Check className="size-4 shrink-0 text-blue-600" strokeWidth={1.75} />}
                            </span>
                          </DropdownMenuItem>
                        ))}
                        {gi < AI_MODEL_GROUPS.length - 1 ? <DropdownMenuSeparator className="my-0" /> : null}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <OpenrouterBalanceHint />
              </div>
              <div className="flex items-center gap-1">
                <HeaderThemeControl />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="relative size-10 rounded-xl"
                      aria-label="Notifications"
                    >
                      <Bell className="size-[1.125rem] text-zinc-600 dark:text-zinc-400" strokeWidth={1.75} />
                      {notificationCount > 0 && (
                        <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                          {notificationCount > 9 ? "9+" : notificationCount}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 rounded-xl p-2">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Notifications</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Recent workspace updates and approvals.</p>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="max-h-80 space-y-2 overflow-y-auto p-1">
                      {pendingContentCount > 0 && (
                        <Link
                          href="/pipeline?tab=approval"
                          className="block rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 transition-colors hover:border-amber-300 hover:bg-amber-50/80"
                        >
                          <span className="font-medium text-amber-950">Approval required</span>
                          <span className="mt-0.5 block text-xs text-amber-900/85">
                            {pendingContentCount} post{pendingContentCount === 1 ? "" : "s"} pending — open Workflow
                          </span>
                        </Link>
                      )}
                      {recentActivities.length === 0 && pendingContentCount === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
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
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 gap-2 rounded-full border border-transparent px-1.5 pr-2.5 transition-[background-color,border-color] duration-200 hover:border-zinc-200/90 hover:bg-zinc-900/[0.03] dark:hover:border-zinc-700 dark:hover:bg-white/[0.05]"
                    >
                      {loading && !profile ? (
                        <Skeleton className="size-8 rounded-full" />
                      ) : (
                        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-zinc-800 to-zinc-950 text-[11px] font-semibold text-white shadow-sm ring-2 ring-white dark:from-zinc-200 dark:to-zinc-400 dark:text-zinc-900 dark:ring-zinc-800">
                          {initials}
                        </span>
                      )}
                      {!loading && profile && (
                        <span className="hidden max-w-[11rem] text-left text-sm lg:block">
                          <span className="block truncate font-medium leading-tight text-zinc-900 dark:text-zinc-50">{profile.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                            {profile.email}
                          </span>
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
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
