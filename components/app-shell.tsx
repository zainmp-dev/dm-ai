"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  Bell,
  Check,
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
  Workflow,
  X,
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
import { clearAuthSession } from "@/lib/auth";
import { AI_MODEL_GROUPS, labelForAiModel } from "@/lib/ai-models";
import { HeaderThemeControl } from "@/components/header-theme-control";
import { OpenrouterBalanceHint } from "@/components/openrouter-balance-hint";
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
  "/settings": "Settings",
  "/media": "Media Setup",
  "/workspace-setup": "Workspace Setup",
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Workflow", icon: Workflow },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/media", label: "Media Setup", icon: Images },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium leading-none transition-colors duration-150",
        active
          ? "bg-[#f0f4ff] text-[#1a56db]"
          : "text-[#6b7280] hover:bg-[#f5f7fa] hover:text-[#111827]",
      )}
    >
      <Icon
        className={cn(
          "size-[17px] shrink-0",
          active ? "text-[#1a56db]" : "text-[#9ca3af] group-hover:text-[#374151]",
        )}
        strokeWidth={1.75}
      />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1a56db] px-1.5 text-[10px] font-semibold text-white">
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
  const showSetupOnly = setupRequired && pathname === "/workspace-setup";
  const setupRedirectExempt =
    pathname === "/settings" || pathname === "/pipeline" || pathname === "/publishing" || pathname === "/campaigns";

  useEffect(() => {
    if (setupRequired && pathname !== "/workspace-setup" && !setupRedirectExempt) {
      router.replace("/workspace-setup");
    }
  }, [pathname, router, setupRequired, setupRedirectExempt]);

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#f5f7fa]">
      {/* Sidebar */}
      {!showSetupOnly && (
        <aside
          className={cn(
            "flex h-full shrink-0 flex-col border-r border-[#e5e7eb] bg-white transition-[width] duration-200 ease-out",
            collapsed ? "w-[3.75rem]" : "w-[14rem]",
          )}
        >
          {/* Brand */}
          <div
            className={cn(
              "flex h-[3.75rem] shrink-0 items-center gap-2.5 border-b border-[#e5e7eb] px-4",
              collapsed && "justify-center px-0",
            )}
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#1a56db]">
              <Sparkles className="size-3.5 text-white" strokeWidth={2} />
            </div>
            {!collapsed && (
              <span className="text-[14px] font-semibold tracking-tight text-[#111827]">FlowPilot</span>
            )}
          </div>

          {/* Nav */}
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
            {collapsed
              ? navItems.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`) ||
                    (item.href === "/pipeline" && pathname === "/command-center");
                  const Icon = item.icon;
                  const badge = item.href === "/notifications" ? notificationCount : undefined;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={cn(
                        "relative flex h-9 w-full items-center justify-center rounded-lg transition-colors duration-150",
                        active ? "bg-[#f0f4ff] text-[#1a56db]" : "text-[#9ca3af] hover:bg-[#f5f7fa] hover:text-[#374151]",
                      )}
                    >
                      <Icon className="size-[17px]" strokeWidth={1.75} />
                      {badge != null && badge > 0 && (
                        <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#1a56db] px-0.5 text-[9px] font-bold text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </Link>
                  );
                })
              : navItems.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`) ||
                    (item.href === "/pipeline" && pathname === "/command-center");
                  const badge = item.href === "/notifications" ? notificationCount : undefined;
                  return (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={active}
                      badge={badge}
                    />
                  );
                })}
          </nav>

          {/* Bottom: settings + user */}
          <div className="shrink-0 border-t border-[#e5e7eb]">
            {!collapsed && (
              <div className="px-2 py-2">
                <Link
                  href="/settings"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] text-[#6b7280] transition-colors hover:bg-[#f5f7fa] hover:text-[#111827]"
                >
                  <Plug className="size-[16px] shrink-0 text-[#1a56db]" strokeWidth={1.75} />
                  Connect accounts
                </Link>
              </div>
            )}
            {collapsed && (
              <div className="flex justify-center px-0 py-2">
                <Link
                  href="/settings"
                  title="Connect accounts in Settings"
                  className="flex size-9 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f5f7fa] hover:text-[#374151]"
                >
                  <Plug className="size-4" strokeWidth={1.75} />
                </Link>
              </div>
            )}

            {/* User profile row */}
            <div className={cn("border-t border-[#e5e7eb] px-2 py-2", collapsed && "flex justify-center px-0")}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {collapsed ? (
                    <button
                      type="button"
                      className="flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-[#f5f7fa]"
                      aria-label="Account menu"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-[#1a56db] text-[11px] font-semibold text-white">
                        {initials}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#f5f7fa]"
                      aria-label="Account menu"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1a56db] text-[11px] font-semibold text-white">
                        {shellPending && !profile ? (
                          <Skeleton className="size-7 rounded-full" />
                        ) : (
                          initials
                        )}
                      </span>
                      {profile && (
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium leading-tight text-[#111827]">
                            {profile.name}
                          </span>
                          <span className="block truncate text-[11px] leading-tight text-[#6b7280]">
                            {profile.email}
                          </span>
                        </span>
                      )}
                    </button>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align={collapsed ? "end" : "start"} side="top" className="w-52 rounded-xl">
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
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
                      router.replace("/login");
                    }}
                  >
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </aside>
      )}

      {/* Main area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="z-20 flex h-[3.75rem] shrink-0 items-center gap-3 border-b border-[#e5e7eb] bg-white px-5">
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
          <h1 className="min-w-0 flex-shrink-0 text-[15px] font-semibold text-[#111827]">{title}</h1>

          {/* Workspace switcher */}
          {!error && (
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
                      onClick={() => void setActiveWorkspace(item.id)}
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
            <p className="flex items-center gap-2 text-xs text-red-600">
              {error}
              <Button type="button" size="sm" variant="outline" className="h-6 rounded-md text-xs" onClick={() => void refreshWorkspace()}>
                Retry
              </Button>
            </p>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
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

            {/* Theme */}
            <HeaderThemeControl />

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
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 md:px-7 md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
