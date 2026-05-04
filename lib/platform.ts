import type { IntegrationInfo, PublishingPlatform, WorkspaceSnapshot } from "@/lib/types";

export function platformLabel(platform: PublishingPlatform | string | null | undefined): string {
  switch (platform) {
    case "linkedin":
      return "LinkedIn";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "twitter":
      return "Twitter / X";
    case "meta":
      return "Facebook / Meta";
    default:
      return "Platform";
  }
}

export function isPlatformConnected(
  integrations: WorkspaceSnapshot["integrations"],
  platform: PublishingPlatform | null | undefined,
): boolean {
  if (!platform) return false;
  if (platform === "linkedin") {
    return integrations.linkedin.connected;
  }
  return integrations.meta.connected;
}

export function integrationForPlatform(
  integrations: WorkspaceSnapshot["integrations"],
  platform: PublishingPlatform,
): IntegrationInfo {
  return platform === "linkedin" ? integrations.linkedin : integrations.meta;
}
