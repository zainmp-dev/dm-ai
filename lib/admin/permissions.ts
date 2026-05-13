/** Mirrors backend `utils/admin_rbac.py` permission identifiers for UI checks only — enforcement stays server-side. */
export const PERM = {
  SHELL: "admin.shell",
  USERS: "admin.users",
  USERS_WRITE: "admin.users_write",
  USER_CREDENTIALS: "admin.user_credentials",
  WORKSPACES: "admin.workspaces",
  INTEGRATIONS: "admin.integrations",
  CONTENT_LIB: "admin.content_library",
  DB_READ: "admin.database_read",
  DB_EXPORT: "admin.database_export",
  AUDIT_READ: "admin.audit_read",
  AUDIT_EXPORT: "admin.audit_export",
  OPS: "admin.operations",
  AI_OPS: "admin.ai_operations",
  SECURITY: "admin.security",
  ROLES_ASSIGN: "admin.roles_assign",
} as const;

export type PermissionKey = (typeof PERM)[keyof typeof PERM];

export function permissionGranted(perms: readonly string[], required?: PermissionKey | string): boolean {
  if (!required) return true;
  return perms.includes(String(required));
}
