import type { LucideIcon } from "lucide-react";
import { Bell, Calendar, FileText, Images, LayoutDashboard, Rocket, Settings, Target } from "lucide-react";

export type NotificationKind = "content" | "strategy" | "workspace" | "media" | "publishing" | "scheduling" | "settings" | "general";

export function resolveNotificationLink(text: string): { href: string; label: string; kind: NotificationKind } {
  const t = text.toLowerCase();

  if (/linkedin integration|meta integration/.test(t)) {
    return { href: "/settings", label: "Open settings", kind: "settings" };
  }
  if (/cloudinary|local media library|media setup uploaded/.test(t)) {
    return { href: "/media", label: "Media library", kind: "media" };
  }
  if (/company and scenario|master workspace ai flow completed|workspace setup|ai flow could not complete/.test(t)) {
    return { href: "/settings?section=workspace", label: "Workspace", kind: "workspace" };
  }
  if (/strategy|competitor|marketing gap|gap issue found|agent 1/.test(t)) {
    return { href: "/strategy", label: "Strategy", kind: "strategy" };
  }
  if (/smart scheduling|publishing slot|scheduling set/.test(t)) {
    return { href: "/pipeline?tab=scheduling", label: "Scheduling", kind: "scheduling" };
  }
  if (/publish step|published|publishing/.test(t)) {
    return { href: "/pipeline?tab=publishing", label: "Publishing", kind: "publishing" };
  }
  if (/content|draft|approve|reject|ai flow added|ai suggest|suggested a master|review queue|review step|content draft/.test(t)) {
    return { href: "/pipeline?tab=content", label: "Content", kind: "content" };
  }

  return { href: "/pipeline?tab=command", label: "Command", kind: "general" };
}

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  content: FileText,
  strategy: Target,
  workspace: Rocket,
  media: Images,
  publishing: LayoutDashboard,
  scheduling: Calendar,
  settings: Settings,
  general: Bell,
};

export function notificationIcon(kind: NotificationKind): LucideIcon {
  return KIND_ICONS[kind];
}
