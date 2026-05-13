import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Brain,
  Building2,
  Database,
  Layers,
  LayoutDashboard,
  Plug,
  ScrollText,
  Shield,
  Users,
} from "lucide-react";
import { PERM, permissionGranted, type PermissionKey } from "@/lib/admin/permissions";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredPermission?: PermissionKey;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, requiredPermission: PERM.SHELL },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, requiredPermission: PERM.OPS },
  { href: "/admin/database", label: "Database", icon: Database, requiredPermission: PERM.DB_READ },
  { href: "/admin/users", label: "Users", icon: Users, requiredPermission: PERM.USERS },
  { href: "/admin/workspaces", label: "Workspaces", icon: Building2, requiredPermission: PERM.WORKSPACES },
  { href: "/admin/integrations", label: "Integrations", icon: Plug, requiredPermission: PERM.INTEGRATIONS },
  { href: "/admin/content", label: "Content", icon: Layers, requiredPermission: PERM.CONTENT_LIB },
  { href: "/admin/operations", label: "Operations", icon: Activity, requiredPermission: PERM.OPS },
  { href: "/admin/ai", label: "AI Ops", icon: Brain, requiredPermission: PERM.AI_OPS },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, requiredPermission: PERM.AUDIT_READ },
  { href: "/admin/security", label: "Security & RBAC", icon: Shield, requiredPermission: PERM.SECURITY },
];

export function filterNavForPermissions(perms: readonly string[]): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => permissionGranted(perms, item.requiredPermission));
}

export const ADMIN_PAGE_SUBTITLE: Record<string, string> = {
  "/admin": "Platform metrics and workspace adoption at a glance.",
  "/admin/analytics": "Operational analytics, growth proxies, and trend indicators.",
  "/admin/database": "Database inventory, metrics, and read-only row inspection.",
  "/admin/users": "Accounts, operator roles, and onboarding completion.",
  "/admin/workspaces": "Tenant workspaces, configuration state, and library depth.",
  "/admin/integrations": "OAuth channel connections across all workspaces.",
  "/admin/content": "Aggregate pipeline status counts across every workspace.",
  "/admin/operations": "Queues, jobs, and platform throughput indicators.",
  "/admin/ai": "AI configuration visibility and operational readiness.",
  "/admin/audit": "Immutable record of privileged administrative actions.",
  "/admin/security": "RBAC registry and permission matrix for operators.",
};

export function adminSubtitleForPath(pathKey: string): string {
  if (ADMIN_PAGE_SUBTITLE[pathKey]) return ADMIN_PAGE_SUBTITLE[pathKey];
  const prefixes = Object.keys(ADMIN_PAGE_SUBTITLE).sort((a, b) => b.length - a.length);
  for (const p of prefixes) {
    if (pathKey.startsWith(`${p}/`) || pathKey === p) return ADMIN_PAGE_SUBTITLE[p];
  }
  return "";
}
