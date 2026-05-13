"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Images,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Menu,
  Plug,
  Plus,
  Settings,
  Sparkles,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";
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
import { flowSuccessMessages } from "@/lib/api";
import { clearAuthSession } from "@/lib/auth";
import { AI_MODEL_GROUPS, labelForAiModel } from "@/lib/ai-models";
import { HeaderThemeControl } from "@/components/header-theme-control";
import { OpenrouterBalanceHint } from "@/components/openrouter-balance-hint";
import { VoiceCommandOverlay } from "@/components/voice-command-overlay";
import { WorkspaceAiSearch } from "@/components/workspace-ai-search";
import { useToast } from "@/components/ui/toast";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/command-center": "Workflow",
  "/strategy": "Strategy",
  "/content": "Workflow",
  "/pipeline": "Workflow",
  "/approval": "Workflow",
  "/scheduling": "Workflow",
  "/publishing": "Workflow",
  "/campaigns": "Campaigns",
  "/notifications": "Notifications",
  "/profile": "Profile",
  "/media": "Media Setup",
  "/settings": "Settings",
  "/workspace-setup": "Workspace Setup",
};

type SidebarNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden until Agent 1 has produced a strategy plan */
  requiresStrategy?: boolean;
  /** Use GET /workspace snapshot gap list length */
  gapsInsight?: boolean;
  /** Pending notifications-style badge (blue) */
  notificationBadge?: boolean;
  /** Solid divider after Campaigns when expanded */
  dividerAfter?: boolean;
  matchActive?: (pathname: string) => boolean;
};

const SIDEBAR_NAV: SidebarNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Workflow", icon: Workflow },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, dividerAfter: true },
  { href: "/notifications", label: "Notifications", icon: Bell, notificationBadge: true },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/media", label: "Media Setup", icon: Images },
  {
    href: "/strategy#strategy-market-gaps",
    label: "Competitors & gaps",
    icon: Users,
    requiresStrategy: true,
    gapsInsight: true,
    matchActive: (p) => p === "/strategy" || p.startsWith("/competitors"),
  },
  { href: "/settings", label: "Settings", icon: Settings },
];

function sidebarNavItemActive(pathname: string, item: SidebarNavItem): boolean {
  if (item.matchActive) return item.matchActive(pathname);
  const base = item.href.split("#")[0] ?? item.href;
  if (pathname === base || pathname.startsWith(`${base}/`)) return true;
  if (base === "/pipeline" && pathname === "/command-center") return true;
  return false;
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
  gapsBadge,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
  gapsBadge?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] leading-snug transition-colors duration-150",
        active
          ? "bg-[#e8efff] font-semibold text-[#1547ad] shadow-[inset_0_0_0_1px_rgba(26,86,219,0.12)] dark:bg-blue-950/50 dark:text-[#93c5fd] dark:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]"
          : "font-semibold text-[#374151] hover:bg-[#f0f2f5] hover:text-[#111827] dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0",
          active ? "text-[#1a56db] dark:text-[#93c5fd]" : "text-[#6b7280] group-hover:text-[#111827] dark:text-zinc-500 dark:group-hover:text-zinc-200",
        )}
        strokeWidth={2.25}
      />
      <span className="min-w-0 flex-1 tracking-tight">{label}</span>
      {gapsBadge != null && gapsBadge > 0 && (
        <span
          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-amber-100 px-1.5 text-[10px] font-bold tabular-nums text-amber-950 dark:bg-amber-950/80 dark:text-amber-100"
          title={`${gapsBadge} market gaps in your strategy`}
        >
          {gapsBadge > 99 ? "99+" : gapsBadge}
        </span>
      )}
      {badge != null && badge > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#1a56db] px-1.5 text-[10px] font-bold text-white dark:bg-blue-600">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
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
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const error = useWorkspaceStore((s) => s.error);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const clearWorkspaceError = useWorkspaceStore((s) => s.clearWorkspaceError);
  const { push: pushToast } = useToast();

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
  const firstRunOnboardingFocused = useWorkspaceStore((s) => s.firstRunOnboardingFocused);
  const workspaceSetupMinimal =
    pathname === "/workspace-setup" && (setupRequired || firstRunOnboardingFocused);
  const showSetupOnly = workspaceSetupMinimal;
  const headerTitle = showSetupOnly && pathname === "/workspace-setup" ? "Set up workspace" : title;
  const setupRedirectExempt =
    pathname === "/settings" || pathname === "/pipeline" || pathname === "/publishing" || pathname === "/campaigns";

  const marketGapsCount = useMemo(() => {
    const gaps = visibleWorkspace?.strategy?.marketGaps ?? [];
    return gaps.filter((g) => String(g).trim().length > 0).length;
  }, [visibleWorkspace?.strategy?.marketGaps]);

  const visibleSidebarNav = useMemo(
    () => SIDEBAR_NAV.filter((item) => !item.requiresStrategy || Boolean(visibleWorkspace?.strategy)),
    [visibleWorkspace?.strategy],
  );

  useEffect(() => {
    if (setupRequired && pathname !== "/workspace-setup" && !setupRedirectExempt) {
      router.replace("/workspace-setup");
    }
  }, [pathname, router, setupRequired, setupRedirectExempt]);

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#f5f7fa] dark:bg-[#0a0a0b]">
      {/* Sidebar */}
      {!showSetupOnly && (
        <aside
          className={cn(
            "flex h-full shrink-0 flex-col border-r border-[#e5e7eb] bg-white transition-[width] duration-200 ease-out dark:border-zinc-800 dark:bg-[#161618]",
            collapsed ? "w-[3.75rem]" : "w-[15.5rem]",
          )}
        >
          {/* Brand */}
          <div
            className={cn(
              "flex h-[3.75rem] shrink-0 items-center gap-2.5 border-b border-[#e5e7eb] px-4 dark:border-zinc-800",
              collapsed && "justify-center px-0",
            )}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#1a56db] shadow-sm shadow-blue-600/25">
              <Sparkles className="size-4 text-white" strokeWidth={2.25} />
            </div>
            {!collapsed && (
              <span className="text-[15px] font-bold tracking-tight text-[#111827] dark:text-zinc-100">FlowPilot</span>
            )}
          </div>

          {/* Nav */}
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-3">
            {collapsed
              ? visibleSidebarNav.map((item) => {
                  const active = sidebarNavItemActive(pathname, item);
                  const Icon = item.icon;
                  const badge = item.notificationBadge ? notificationCount : undefined;
                  const gapsBadge = item.gapsInsight ? marketGapsCount : undefined;
                  const collapseTitle =
                    gapsBadge != null && gapsBadge > 0 ? `${item.label} · ${gapsBadge} gaps` : item.label;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapseTitle}
                      className={cn(
                        "relative flex h-10 w-full items-center justify-center rounded-xl transition-colors duration-150",
                        active
                          ? "bg-[#e8efff] text-[#1a56db] dark:bg-blue-950/50 dark:text-[#93c5fd]"
                          : "text-[#6b7280] hover:bg-[#f0f2f5] hover:text-[#111827] dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                      )}
                    >
                      <Icon className="size-[18px]" strokeWidth={2.25} />
                      {badge != null && badge > 0 && (
                        <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#1a56db] px-0.5 text-[9px] font-bold text-white dark:bg-blue-600">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                      {gapsBadge != null && gapsBadge > 0 && badge == null && (
                        <span className="absolute right-1 top-1 size-2 rounded-sm bg-amber-500 shadow-sm dark:bg-amber-400" />
                      )}
                    </Link>
                  );
                })
              : visibleSidebarNav.map((item) => {
                  const active = sidebarNavItemActive(pathname, item);
                  const badge = item.notificationBadge ? notificationCount : undefined;
                  const gapsBadge = item.gapsInsight ? marketGapsCount : undefined;
                  return (
                    <div key={item.href}>
                      <NavItem
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        active={active}
                        badge={badge}
                        gapsBadge={gapsBadge}
                      />
                      {item.dividerAfter ? (
                        <div className="my-2 border-t border-[#ebedf0] dark:border-zinc-700/90" aria-hidden />
                      ) : null}
                    </div>
                  );
                })}
          </nav>
        </aside>
      )}

      {/* Main area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="z-20 flex h-[3.75rem] shrink-0 items-center gap-3 border-b border-[#e5e7eb] bg-white px-5 dark:border-zinc-800 dark:bg-[#161618]">
          {/* Sidebar toggle */}
          {!showSetupOnly && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!collapsed)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f5f7fa] hover:text-[#374151]"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <Menu className="size-4" strokeWidth={1.75} /> : <X className="size-4" strokeWidth={1.75} />}
            </button>
          )}

          {/* Page title */}
          <h1 className="min-w-0 flex-shrink-0 text-[15px] font-semibold text-[#111827] dark:text-zinc-100">{headerTitle}</h1>

          {/* Workspace switcher */}
          {!showSetupOnly && !error && (
            <div className="hidden items-center gap-1 sm:flex">
              <span className="text-[#e5e7eb]">·</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] text-[#6b7280] transition-colors hover:bg-[#f5f7fa] hover:text-[#111827]"
                  >
                    <span className="max-w-[160px] truncate">{workspaceName}</span>
                    <ChevronsUpDown className="size-3 shrink-0 opacity-50" strokeWidth={1.75} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 rounded-xl">
                  <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {workspaceSetups.length === 0 && (
                    <DropdownMenuItem disabled>No configured workspaces yet</DropdownMenuItem>
                  )}
                  {workspaceSetups.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onClick={() =>
                        void setActiveWorkspace(item.id).then((applied) => {
                          if (applied) {
                            pushToast("Workspace updated. Scheduling uses this brand’s primary region timezone; rerun Agents if strategy or drafts should match the new company.", {
                              durationMs: 7200,
                            });
                          }
                        })
                      }
                      className="flex items-start justify-between gap-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.companyName}</span>
                        <span className="block truncate text-xs text-[#6b7280]">{item.website || "No website"}</span>
                      </span>
                      {item.id === activeWorkspaceId && <Check className="size-4 shrink-0 text-[#1a56db]" strokeWidth={1.75} />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/workspace-setup" className="flex items-center gap-2">
                      <Plus className="size-3.5 shrink-0" strokeWidth={2} />
                      New workspace
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {error && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-red-600">
              <span className="min-w-0 flex-1">{error}</span>
              <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 rounded-md text-xs" onClick={() => void refreshWorkspace()}>
                Retry
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 shrink-0 rounded-md text-xs text-[#64748b] hover:text-[#111827]"
                onClick={() => clearWorkspaceError()}
              >
                Dismiss
              </Button>
            </p>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
            {!showSetupOnly && (
              <>
                {/* New Campaign — navigates to /campaigns?new=1 which auto-opens the create dialog */}
                <Link
                  href="/campaigns?new=1"
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-[#1a56db] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1648c0] active:bg-[#1340ad]"
                >
                  <Plus className="size-3.5 shrink-0" strokeWidth={2.5} />
                  <span className="hidden sm:inline">New Campaign</span>
                  <span className="sm:hidden">New</span>
                </Link>

                {/* AI Search */}
                <WorkspaceAiSearch
                  selectedAiModel={selectedAiModel}
                  workspaceConfigured={Boolean(
                    visibleWorkspace?.workspaceConfigured || (visibleWorkspace?.companyName?.trim() ?? "").length > 0,
                  )}
                />

                {/* AI Model picker */}
                <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden h-8 max-w-[11rem] justify-between gap-1.5 rounded-lg border-[#e5e7eb] bg-white px-2.5 text-[12.5px] font-medium text-[#374151] hover:bg-[#f5f7fa] sm:flex"
                  aria-label="Select AI model"
                >
                  <Sparkles className="size-3.5 shrink-0 text-[#1a56db]" strokeWidth={1.75} />
                  <span className="truncate">{labelForAiModel(selectedAiModel)}</span>
                  <ChevronsUpDown className="size-3 shrink-0 opacity-40" strokeWidth={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-[min(22rem,72vh)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-0"
              >
                {AI_MODEL_GROUPS.map((group, gi) => (
                  <div key={group.label} className="py-1">
                    <DropdownMenuLabel className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.options.map((model) => (
                      <DropdownMenuItem
                        key={model.value}
                        className="cursor-pointer rounded-none px-3 py-2"
                        onSelect={() => setSelectedAiModel(model.value)}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="truncate text-sm">{model.label}</span>
                          {model.value === selectedAiModel && (
                            <Check className="size-4 shrink-0 text-[#1a56db]" strokeWidth={1.75} />
                          )}
                        </span>
                      </DropdownMenuItem>
                    ))}
                    {gi < AI_MODEL_GROUPS.length - 1 ? <DropdownMenuSeparator className="my-0" /> : null}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <OpenrouterBalanceHint />

                {/* Notifications */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="relative flex size-8 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f5f7fa] hover:text-[#111827]"
                      aria-label="Notifications"
                    >
                      <Bell className="size-[17px]" strokeWidth={1.75} />
                      {notificationCount > 0 && (
                        <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-[#1a56db] text-[9px] font-bold text-white">
                          {notificationCount > 9 ? "9+" : notificationCount}
                        </span>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 rounded-xl p-2">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-semibold text-[#111827]">Notifications</p>
                      <p className="text-xs text-[#6b7280]">Recent workspace updates and content reviews.</p>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="max-h-80 space-y-2 overflow-y-auto p-1">
                      {pendingContentCount > 0 && (
                        <Link
                          href="/pipeline?tab=content"
                          className="block rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 transition-colors hover:border-amber-300"
                        >
                          <span className="font-medium text-amber-950">Approval required</span>
                          <span className="mt-0.5 block text-xs text-amber-900/85">
                            {pendingContentCount} post{pendingContentCount === 1 ? "" : "s"} pending — open Workflow
                          </span>
                        </Link>
                      )}
                      {recentActivities.length === 0 && pendingContentCount === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#e5e7eb] px-3 py-6 text-center text-sm text-[#9ca3af]">
                          You are all caught up.
                        </div>
                      ) : (
                        recentActivities.map((item) => (
                          <NotificationEntry key={item.id} text={item.text} createdAt={item.createdAt} variant="dropdown" />
                        ))
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/notifications">View all notifications</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            {/* Theme */}
            <HeaderThemeControl />

            {/* Account: workspace setup, profile, logout */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex max-w-[10rem] items-center gap-1.5 rounded-lg py-1 pl-1 pr-1.5 text-left transition-colors hover:bg-[#f5f7fa] dark:hover:bg-zinc-800"
                  aria-label="Account menu"
                >
                  <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1a56db] text-[11px] font-semibold text-white dark:bg-blue-600">
                    {shellPending && !profile ? <Skeleton className="size-8 rounded-full bg-blue-700/90" /> : initials}
                  </span>
                  {profile && (
                    <span className="hidden min-w-0 md:block">
                      <span className="block truncate text-[12px] font-medium leading-tight text-[#111827] dark:text-zinc-100">
                        {profile.name}
                      </span>
                      <span className="block truncate text-[10px] leading-tight text-[#6b7280] dark:text-zinc-400">
                        {profile.email}
                      </span>
                    </span>
                  )}
                  <ChevronDown className="size-4 shrink-0 opacity-50" strokeWidth={1.75} aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" className="w-56 rounded-xl">
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center gap-2">
                    <Plug className="size-3.5 text-[#1a56db]" strokeWidth={1.75} aria-hidden />
                    Connect accounts
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/workspace-setup">
                    {visibleWorkspace?.workspaceConfigured ? "Change workspace setup" : "Set up workspace"}
                  </Link>
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
                    pushToast(flowSuccessMessages.signedOut, { kind: "success" });
                    router.replace("/login");
                  }}
                >
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 md:px-7 md:py-6">
          {children}
        </main>
      </div>
      {!showSetupOnly && <VoiceCommandOverlay />}
    </div>
  );
}
