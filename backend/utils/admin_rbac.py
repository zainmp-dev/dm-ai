"""Platform operator roles and coarse-grained permissions for FlowPilot admin.

Legacy installs store role=`admin`; newer tiers use explicit operator roles.
All operators authenticate with the same bearer-token scheme as today."""

from __future__ import annotations

from typing import FrozenSet

USER_ROLE = "user"
LEGACY_ADMIN = "admin"
SUPER_ADMIN = "super_admin"
PLATFORM_ADMIN = "platform_admin"
WORKSPACE_ADMIN = "workspace_admin"
MODERATOR = "moderator"
SUPPORT_AGENT = "support_agent"
ANALYST = "analyst"

PLATFORM_ROLES: FrozenSet[str] = frozenset(
    {
        LEGACY_ADMIN,
        SUPER_ADMIN,
        PLATFORM_ADMIN,
        WORKSPACE_ADMIN,
        MODERATOR,
        SUPPORT_AGENT,
        ANALYST,
    }
)

KNOWN_ROLES: FrozenSet[str] = frozenset({USER_ROLE, *PLATFORM_ROLES})

PERM_SHELL = "admin.shell"
PERM_USERS = "admin.users"
PERM_USERS_WRITE = "admin.users_write"
PERM_USER_CREDENTIALS = "admin.user_credentials"
PERM_WORKSPACES = "admin.workspaces"
PERM_INTEGRATIONS = "admin.integrations"
PERM_CONTENT_LIB = "admin.content_library"
PERM_DB_READ = "admin.database_read"
PERM_DB_EXPORT = "admin.database_export"
PERM_AUDIT_READ = "admin.audit_read"
PERM_AUDIT_EXPORT = "admin.audit_export"
PERM_OPS = "admin.operations"
PERM_AI_OPS = "admin.ai_operations"
PERM_SECURITY = "admin.security"
PERM_ROLES_ASSIGN = "admin.roles_assign"

ALL_PERMISSIONS: FrozenSet[str] = frozenset(
    {
        PERM_SHELL,
        PERM_USERS,
        PERM_USERS_WRITE,
        PERM_USER_CREDENTIALS,
        PERM_WORKSPACES,
        PERM_INTEGRATIONS,
        PERM_CONTENT_LIB,
        PERM_DB_READ,
        PERM_DB_EXPORT,
        PERM_AUDIT_READ,
        PERM_AUDIT_EXPORT,
        PERM_OPS,
        PERM_AI_OPS,
        PERM_SECURITY,
        PERM_ROLES_ASSIGN,
    }
)

_READ_ANALYST_BUNDLE: FrozenSet[str] = frozenset(
    {
        PERM_SHELL,
        PERM_USERS,
        PERM_WORKSPACES,
        PERM_INTEGRATIONS,
        PERM_CONTENT_LIB,
        PERM_DB_READ,
        PERM_AUDIT_READ,
        PERM_OPS,
        PERM_AI_OPS,
        PERM_SECURITY,
    }
)

ROLE_PERMISSIONS: dict[str, FrozenSet[str]] = {
    LEGACY_ADMIN: ALL_PERMISSIONS,
    SUPER_ADMIN: ALL_PERMISSIONS,
    PLATFORM_ADMIN: ALL_PERMISSIONS - {PERM_ROLES_ASSIGN},
    WORKSPACE_ADMIN: frozenset(
        {
            PERM_SHELL,
            PERM_USERS,
            PERM_USERS_WRITE,
            PERM_USER_CREDENTIALS,
            PERM_WORKSPACES,
            PERM_INTEGRATIONS,
            PERM_CONTENT_LIB,
            PERM_OPS,
            PERM_DB_READ,
            PERM_AUDIT_READ,
        }
    ),
    MODERATOR: _READ_ANALYST_BUNDLE,
    SUPPORT_AGENT: frozenset(
        {
            PERM_SHELL,
            PERM_USERS,
            PERM_USERS_WRITE,
            PERM_WORKSPACES,
            PERM_INTEGRATIONS,
            PERM_CONTENT_LIB,
            PERM_AUDIT_READ,
        }
    ),
    ANALYST: _READ_ANALYST_BUNDLE,
}


def normalize_stored_role(raw: str | None) -> str:
    r = str(raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if r in KNOWN_ROLES:
        return r
    return USER_ROLE


def is_platform_operator(role: str | None) -> bool:
    return normalize_stored_role(role) in PLATFORM_ROLES


def permissions_for_role(role: str | None) -> FrozenSet[str]:
    norm = normalize_stored_role(role)
    return ROLE_PERMISSIONS.get(norm, frozenset())


def role_has_permission(role: str | None, permission: str) -> bool:
    return permission in permissions_for_role(role)


def is_legacy_elevated(role: str | None) -> bool:
    """Roles counted toward last-privileged-operator safeguards."""
    norm = normalize_stored_role(role)
    return norm in {LEGACY_ADMIN, SUPER_ADMIN}


def platform_roles_sql_in_clause() -> str:
    inner = ", ".join(f"'{r}'" for r in sorted(PLATFORM_ROLES))
    return f"({inner})"


def platform_operator_sql_expr(column_sql: str) -> str:
    """Safe predicate fragment using only fixed enumerated role literals."""
    return f"lower(trim(coalesce({column_sql}, ''))) in {platform_roles_sql_in_clause()}"


def role_display_name(role: str | None) -> str:
    norm = normalize_stored_role(role)
    return {
        USER_ROLE: "Standard user",
        LEGACY_ADMIN: "Administrator",
        SUPER_ADMIN: "Super Admin",
        PLATFORM_ADMIN: "Platform Admin",
        WORKSPACE_ADMIN: "Workspace Admin",
        MODERATOR: "Moderator",
        SUPPORT_AGENT: "Support Agent",
        ANALYST: "Read-only Analyst",
    }.get(norm, norm.replace("_", " ").title())


ASSIGNABLE_PLATFORM_ROLES: tuple[str, ...] = (
    LEGACY_ADMIN,
    SUPER_ADMIN,
    PLATFORM_ADMIN,
    WORKSPACE_ADMIN,
    MODERATOR,
    SUPPORT_AGENT,
    ANALYST,
)
