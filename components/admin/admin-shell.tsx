"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LogOut, Menu, PanelLeftClose, PanelLeft, Search, Sparkles, X } from "lucide-react";
import { AdminCommandPalette } from "@/components/admin/admin-command-palette";
import { AdminPlatformSessionProvider } from "@/components/admin/admin-platform-context";
import { AdminVoiceOverlay } from "@/components/admin/admin-voice-overlay";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { adminSubtitleForPath, filterNavForPermissions } from "@/lib/admin/nav-config";
import { apiAdminOverview, apiAdminPlatformSession, flowSuccessMessages, type AdminOverview, type AdminPlatformSession } from "@/lib/api";
import { clearAuthSession, getAuthToken, getAuthUser, type AuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const AdminOverviewContext = createContext<AdminOverview | null>(null);

export function useAdminOverviewOptional(): AdminOverview | null {
  return useContext(AdminOverviewContext);
}

function normalizeAdminPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "") || "/admin";
  if (trimmed.startsWith("/admin")) return trimmed === "/admin" ? "/admin" : trimmed;
  return "/admin";
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathKey = normalizeAdminPath(pathname || "/admin");

  const { push: toastPush } = useToast();
  const [boot, setBoot] = useState<"loading" | "ok">("loading");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const skipNextSidebarPersist = useRef(true);

  const [localUser, setLocalUser] = useState<AuthUser | null>(null);
  const [platformSession, setPlatformSession] = useState<AdminPlatformSession | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    const u = getAuthUser();
    setLocalUser(u);
    if (!token || !u) {
      router.replace("/login");
      return;
    }
    void Promise.all([apiAdminOverview(), apiAdminPlatformSession()])
      .then(([data, session]) => {
        setOverview(data);
        setPlatformSession(session);
        setBoot("ok");
      })
      .catch(() => {
        router.replace("/dashboard");
      });
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("admin-sidebar-collapsed") === "1") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (skipNextSidebarPersist.current) {
        skipNextSidebarPersist.current = false;
        return;
      }
      window.localStorage.setItem("admin-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }, [sidebarCollapsed]);

  const filteredNav = useMemo(
    () => filterNavForPermissions(platformSession?.permissions ?? []),
    [platformSession?.permissions],
  );

  const meta = useMemo(() => {
    const navHit = filteredNav.find(
      (n) => pathKey === n.href || (n.href !== "/admin" && pathKey.startsWith(`${n.href}/`)),
    );
    return {
      title: navHit?.label ?? "Admin",
      subtitle: adminSubtitleForPath(pathKey),
    };
  }, [filteredNav, pathKey]);

  const initials = useMemo(() => {
    if (!localUser?.name) return "A";
    return localUser.name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [localUser?.name]);

  const handleSignOut = useCallback(() => {
    clearAuthSession();
    toastPush(flowSuccessMessages.signedOut, { kind: "success" });
    router.replace("/login");
  }, [router, toastPush]);

  const navLinkClass = (href: string, mobile = false) => {
    const active = pathKey === href || (href !== "/admin" && pathKey.startsWith(`${href}/`));
    return cn(
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
      mobile ? "py-3 text-[15px]" : "",
      !mobile && sidebarCollapsed ? "justify-center px-2" : "",
      active
        ? "bg-[#1a56db]/10 text-[#1a56db] dark:bg-blue-500/15 dark:text-blue-100"
        : "text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
    );
  };

  if (boot !== "ok" || !overview) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-[#f5f7fa] dark:bg-[#0c0c0e]">
        <div className="flex flex-1 gap-0 md:flex-row">
          <aside className="hidden w-[260px] shrink-0 border-r border-[#e5e7eb] bg-white p-4 dark:border-zinc-800 dark:bg-[#161618] md:block">
            <Skeleton className="mb-8 h-9 w-36 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          </aside>
          <main className="flex flex-1 flex-col gap-6 p-6 md:p-10">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-10 w-64 rounded-lg" />
              <Skeleton className="h-10 w-40 rounded-lg" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </main>
        </div>
      </div>
    );
  }

  const SidebarBody = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-1 flex-col">
      <Link
        href="/admin"
        className={cn(
          "mb-8 flex items-center gap-2.5 px-1",
          !mobile && sidebarCollapsed ? "justify-center px-0" : "",
        )}
        onClick={() => mobile && setMobileNavOpen(false)}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#1a56db] shadow-sm">
          <Sparkles className="size-[18px] text-white" strokeWidth={2} />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[14px] font-semibold tracking-tight text-[#0f172a] dark:text-zinc-50">
              FlowPilot
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#64748b] dark:text-zinc-500">
              Control Center
            </p>
          </div>
        )}
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {filteredNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={navLinkClass(href, mobile)}
            onClick={() => mobile && setMobileNavOpen(false)}
          >
            <Icon className="size-[18px] shrink-0 opacity-90" strokeWidth={1.75} />
            {!sidebarCollapsed && <span>{label}</span>}
          </Link>
        ))}
      </nav>

      <div className={cn("mt-auto pt-8", mobile ? "block" : "hidden md:block")}>
        {!sidebarCollapsed && (
          <p className="px-1 text-[11px] leading-relaxed text-[#94a3b8] dark:text-zinc-600">
            Enterprise operator console — RBAC enforced server-side.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <AdminOverviewContext.Provider value={overview}>
      <AdminPlatformSessionProvider value={platformSession}>
        <div className="flex min-h-[100dvh] bg-[#f5f7fa] text-[#0f172a] dark:bg-[#0c0c0e] dark:text-zinc-100">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "relative hidden min-h-[100dvh] shrink-0 flex-col border-r border-[#e5e7eb] bg-white py-6 transition-[width] duration-200 ease-out dark:border-zinc-800 dark:bg-[#161618] md:flex",
            sidebarCollapsed ? "w-[4.25rem] px-2" : "w-[260px] px-4",
          )}
        >
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className={cn(
              // Above sticky header (z-30); protrudes into main column so it stays clickable.
              "absolute -right-3 top-7 z-[40] flex size-7 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#64748b] shadow-md ring-2 ring-white transition-colors hover:text-[#0f172a] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-[#161618] dark:hover:text-zinc-100",
              sidebarCollapsed && "top-6",
            )}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeft className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
          </button>
          <div className="flex flex-1 flex-col">
            <SidebarBody />
          </div>
        </aside>

        {/* Mobile overlay */}
        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
            <button
              type="button"
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              aria-label="Close menu"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute left-0 top-0 flex h-full w-[min(88vw,280px)] flex-col border-r border-[#e5e7eb] bg-white shadow-xl dark:border-zinc-800 dark:bg-[#161618]">
              <div className="mb-4 flex shrink-0 items-center justify-between px-5 pt-5">
                <span className="text-[13px] font-semibold text-[#0f172a] dark:text-zinc-50">Menu</span>
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-lg text-[#64748b] hover:bg-[#f1f5f9] dark:hover:bg-zinc-800"
                  aria-label="Close"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5">
                <SidebarBody mobile />
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-[3.75rem] shrink-0 items-center gap-3 border-b border-[#e5e7eb] bg-white/90 px-4 backdrop-blur-md dark:border-zinc-800 dark:bg-[#161618]/90 md:px-8">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[#475569] md:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-[#0f172a] dark:text-zinc-50">
                {meta.title}
              </h1>
              {meta.subtitle ? (
                <p className="hidden truncate text-[12.5px] text-[#64748b] dark:text-zinc-500 sm:block">{meta.subtitle}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mr-1 hidden h-9 shrink-0 rounded-xl border-[#e5e7eb] bg-[#fafafa] text-[#475569] md:inline-flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              onClick={() => setCmdOpen(true)}
            >
              <Search className="mr-1.5 size-3.5 opacity-80" />
              <span className="text-[12px]">Search</span>
              <kbd className="ml-2 hidden rounded-md border border-[#e5e7eb] bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#64748b] lg:inline dark:border-zinc-700 dark:bg-zinc-950">
                ⌘K
              </kbd>
            </Button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#fafafa] py-1 pl-1 pr-3 dark:border-zinc-700 dark:bg-zinc-900/80 sm:flex">
                <span className="flex size-8 items-center justify-center rounded-full bg-[#0f172a] text-[10px] font-semibold text-white dark:bg-zinc-700">
                  {initials}
                </span>
                <div className="max-w-[140px] leading-tight lg:max-w-[200px]">
                  <p className="truncate text-[12px] font-medium text-[#0f172a] dark:text-zinc-100">{localUser?.name}</p>
                  <p className="truncate text-[11px] text-[#64748b] dark:text-zinc-500">{localUser?.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 rounded-xl border-[#e5e7eb] bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                onClick={handleSignOut}
              >
                <LogOut className="mr-1.5 size-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>

        <AdminCommandPalette open={cmdOpen} onOpenChange={setCmdOpen} items={filteredNav} />
        {boot === "ok" ? (
          <AdminVoiceOverlay filteredNav={filteredNav} onOpenCommandPalette={() => setCmdOpen(true)} />
        ) : null}
      </div>
      </AdminPlatformSessionProvider>
    </AdminOverviewContext.Provider>
  );
}
