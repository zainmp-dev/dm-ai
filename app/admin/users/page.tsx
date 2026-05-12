"use client";

import { format, parseISO } from "date-fns";
import { Copy, KeyRound, Search, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  apiAdminCreateUser,
  apiAdminDeleteUser,
  apiAdminSetUserPassword,
  apiAdminUsers,
  apiErrorMessage,
  type AdminAuthFilter,
  type AdminPasswordStorage,
  type AdminRoleFilter,
  type AdminUserRow,
  type AdminUsersPageResponse,
  type AdminUsersSetupFilter,
} from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

function formatDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function setupLabel(row: AdminUserRow): { label: string; tone: "ok" | "progress" | "none" | "na" } {
  if (row.role === "admin") return { label: "Admin (no workspace)", tone: "na" };
  if (!row.has_workspace) return { label: "No workspace row", tone: "none" };
  if (row.workspace_configured) return { label: "Configured", tone: "ok" };
  return { label: "Setup in progress", tone: "progress" };
}

function authLabel(provider: string | null): string {
  if (!provider) return "Email";
  const p = provider.toLowerCase();
  if (p === "google") return "Google";
  if (p === "facebook") return "Facebook";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function passwordStorageLabel(storage: AdminPasswordStorage): string {
  switch (storage) {
    case "bcrypt":
      return "Encrypted (bcrypt)";
    case "oauth_placeholder":
      return "OAuth account";
    case "legacy_plaintext":
      return "Legacy plaintext";
    case "none":
    default:
      return "None";
  }
}

export default function AdminUsersPage() {
  const { push } = useToast();
  const [pack, setPack] = useState<AdminUsersPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);

  const [queryInput, setQueryInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [setupFilter, setSetupFilter] = useState<AdminUsersSetupFilter>("all");
  const [roleFilter, setRoleFilter] = useState<AdminRoleFilter>("all");
  const [authFilter, setAuthFilter] = useState<AdminAuthFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("Admin");
  const [newRole, setNewRole] = useState<"admin" | "user">("admin");
  const [newPassword, setNewPassword] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const sessionEmail = (getAuthUser()?.email || "").trim().toLowerCase();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(queryInput.trim()), 320);
    return () => clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, setupFilter, roleFilter, authFilter, pageSize]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void apiAdminUsers({
      page,
      page_size: pageSize,
      q: debouncedQ,
      setup: setupFilter,
      role: roleFilter,
      auth: authFilter,
    })
      .then((data) => {
        if (!cancelled) setPack(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(apiErrorMessage(e) || "Unable to load users.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, debouncedQ, setupFilter, roleFilter, authFilter, listVersion]);

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      push(`${label} copied.`, { kind: "success" });
    } catch {
      push("Could not copy to clipboard.", { kind: "error" });
    }
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    if (createBusy) return;
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      push("Enter an email for the new account.", { kind: "error" });
      return;
    }
    setCreateBusy(true);
    try {
      const res = await apiAdminCreateUser({
        email,
        name: newName.trim() || undefined,
        role: newRole,
        password: newPassword.trim() ? newPassword.trim() : undefined,
      });
      try {
        await navigator.clipboard.writeText(res.initial_password);
        push(`Created ${res.email}. Password copied to clipboard.`, { kind: "success" });
      } catch {
        push(`Created ${res.email}. Clipboard failed — note the password from your server logs if needed.`, {
          kind: "error",
        });
      }
      setNewEmail("");
      setNewPassword("");
      setListVersion((v) => v + 1);
      setPage(1);
    } catch (err: unknown) {
      push(apiErrorMessage(err) || "Could not create user.", { kind: "error" });
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleRotatePassword(row: AdminUserRow) {
    if (rowBusyId) return;
    const ok = window.confirm(
      `Set a new random password for ${row.email}? The previous password will stop working.`,
    );
    if (!ok) return;
    setRowBusyId(row.id);
    try {
      const res = await apiAdminSetUserPassword(row.id, {});
      try {
        await navigator.clipboard.writeText(res.new_password);
        push(`New password copied for ${row.email}.`, { kind: "success" });
      } catch {
        push("Password updated but clipboard was blocked.", { kind: "error" });
      }
      setListVersion((v) => v + 1);
    } catch (err: unknown) {
      push(apiErrorMessage(err) || "Could not update password.", { kind: "error" });
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleRemoveUser(row: AdminUserRow) {
    if (rowBusyId) return;
    const ok = window.confirm(
      `Soft-delete ${row.email}? They will not be able to sign in. This cannot be undone from the UI.`,
    );
    if (!ok) return;
    setRowBusyId(row.id);
    try {
      await apiAdminDeleteUser(row.id);
      push(`Removed ${row.email}.`, { kind: "success" });
      setListVersion((v) => v + 1);
    } catch (err: unknown) {
      push(apiErrorMessage(err) || "Could not remove user.", { kind: "error" });
    } finally {
      setRowBusyId(null);
    }
  }

  const setupPills: { id: AdminUsersSetupFilter; label: string }[] = [
    { id: "all", label: "All stages" },
    { id: "configured", label: "Configured" },
    { id: "in_progress", label: "In progress" },
    { id: "no_workspace", label: "No workspace" },
  ];

  const rolePills: { id: AdminRoleFilter; label: string }[] = [
    { id: "all", label: "All roles" },
    { id: "admin", label: "Admins" },
    { id: "user", label: "Users" },
  ];

  const authPills: { id: AdminAuthFilter; label: string }[] = [
    { id: "all", label: "All auth" },
    { id: "email", label: "Email" },
    { id: "google", label: "Google" },
    { id: "facebook", label: "Facebook" },
  ];

  const rows = pack?.items ?? [];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-start gap-2">
            <UserPlus className="mt-0.5 size-4 text-[#1a56db]" strokeWidth={1.75} />
            <div>
              <CardTitle className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Create account</CardTitle>
              <CardDescription className="text-[13px] text-[#64748b] dark:text-zinc-500">
                Add an admin or standard user. Leave password empty to auto-generate one (shown once and copied to your
                clipboard).
              </CardDescription>
            </div>
          </div>
          <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="sm:col-span-2 lg:col-span-3">
              <Label htmlFor="admin-new-email" className="text-[12px]">
                Email
              </Label>
              <Input
                id="admin-new-email"
                type="email"
                autoComplete="off"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@company.com"
                className="mt-1 h-10 rounded-xl border-[#e5e7eb] dark:border-zinc-700"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label htmlFor="admin-new-name" className="text-[12px]">
                Display name
              </Label>
              <Input
                id="admin-new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Admin"
                className="mt-1 h-10 rounded-xl border-[#e5e7eb] dark:border-zinc-700"
              />
            </div>
            <div className="sm:col-span-1 lg:col-span-2">
              <Label htmlFor="admin-new-role" className="text-[12px]">
                Role
              </Label>
              <select
                id="admin-new-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
                className="mt-1 h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="admin">admin</option>
                <option value="user">user</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label htmlFor="admin-new-password" className="text-[12px]">
                Password <span className="font-normal text-[#94a3b8]">(optional)</span>
              </Label>
              <Input
                id="admin-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Auto-generate if empty"
                className="mt-1 h-10 rounded-xl border-[#e5e7eb] dark:border-zinc-700"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <Button
                type="submit"
                disabled={createBusy}
                className="mt-1 h-10 w-full rounded-xl bg-[#1a56db] font-medium hover:bg-[#1746b3] sm:mt-6 lg:mt-6"
              >
                {createBusy ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader className="space-y-4 pb-4">
          <div>
            <CardTitle className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Directory</CardTitle>
            <CardDescription className="text-[13px] text-[#64748b] dark:text-zinc-500">
              Server-side search and filters with pagination — scales to large directories. Bcrypt passwords cannot be
              recovered; legacy plaintext rows are shown until you rotate them.
            </CardDescription>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="relative max-w-md flex-1">
              <Label htmlFor="admin-user-q" className="sr-only">
                Search users
              </Label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                id="admin-user-q"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search name, email, workspace ID, company, scenario…"
                className="h-10 rounded-xl border-[#e5e7eb] bg-[#fafafa] pl-9 dark:border-zinc-700 dark:bg-zinc-900/60"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-[#94a3b8] dark:text-zinc-500">
                  Rows
                </Label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8] dark:text-zinc-500">Setup stage</p>
            <div className="flex flex-wrap gap-1.5">
              {setupPills.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setSetupFilter(pill.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                    setupFilter === pill.id
                      ? "bg-[#1a56db] text-white shadow-sm"
                      : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                  )}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8] dark:text-zinc-500">Role</p>
              <div className="flex flex-wrap gap-1.5">
                {rolePills.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setRoleFilter(pill.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                      roleFilter === pill.id
                        ? "bg-violet-600 text-white shadow-sm"
                        : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8] dark:text-zinc-500">Auth provider</p>
              <div className="flex flex-wrap gap-1.5">
                {authPills.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setAuthFilter(pill.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                      authFilter === pill.id
                        ? "bg-emerald-700 text-white shadow-sm dark:bg-emerald-600"
                        : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          {error ? (
            <p className="border-t border-[#f1f5f9] px-6 py-8 text-center text-sm text-red-600 dark:border-zinc-800 dark:text-red-400">
              {error}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto border-t border-[#f1f5f9] dark:border-zinc-800">
                <table className="w-full min-w-[1120px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500">
                      <th className="whitespace-nowrap px-4 py-3 pl-6">User</th>
                      <th className="whitespace-nowrap px-4 py-3">Role</th>
                      <th className="whitespace-nowrap px-4 py-3">Auth</th>
                      <th className="whitespace-nowrap px-4 py-3">Password</th>
                      <th className="whitespace-nowrap px-4 py-3">Workspace setup</th>
                      <th className="whitespace-nowrap px-4 py-3">Company</th>
                      <th className="whitespace-nowrap px-4 py-3">Scenario / region</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">Library</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">Joined</th>
                      <th className="whitespace-nowrap px-4 py-3 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9] dark:divide-zinc-800">
                    {loading && rows.length === 0
                      ? Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} className="animate-pulse bg-white dark:bg-[#161618]">
                            <td colSpan={10} className="px-6 py-4">
                              <div className="h-10 rounded-lg bg-[#f1f5f9] dark:bg-zinc-800" />
                            </td>
                          </tr>
                        ))
                      : rows.map((row) => {
                          const setup = setupLabel(row);
                          const isSelf = Boolean(
                            sessionEmail && row.email.trim().toLowerCase() === sessionEmail,
                          );
                          const busy = rowBusyId === row.id;
                          return (
                            <tr
                              key={row.id}
                              className="bg-white transition-colors hover:bg-[#fafafa] dark:bg-[#161618] dark:hover:bg-zinc-900/50"
                            >
                              <td className="max-w-[220px] px-4 py-3 pl-6 align-top">
                                <p className="truncate font-medium text-[#0f172a] dark:text-zinc-100">{row.name || "—"}</p>
                                <p className="truncate text-[12px] text-[#64748b] dark:text-zinc-500">{row.email}</p>
                                <p className="mt-0.5 font-mono text-[10px] text-[#94a3b8] dark:text-zinc-600">{row.id}</p>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 align-top">
                                <span
                                  className={cn(
                                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    row.role === "admin"
                                      ? "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200"
                                      : "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300",
                                  )}
                                >
                                  {row.role}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 align-top text-[#475569] dark:text-zinc-400">
                                {authLabel(row.auth_provider)}
                              </td>
                              <td className="min-w-[200px] max-w-[260px] px-4 py-3 align-top">
                                <p className="text-[11px] font-medium text-[#64748b] dark:text-zinc-500">
                                  {passwordStorageLabel(row.password_storage)}
                                </p>
                                {row.password_visible ? (
                                  <div className="mt-1 flex items-center gap-1">
                                    <code className="block max-w-[200px] truncate rounded bg-[#f1f5f9] px-1.5 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
                                      {row.password_visible}
                                    </code>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="size-7 min-w-7 shrink-0 p-0 text-[#64748b]"
                                      aria-label="Copy password"
                                      onClick={() => void copyText("Password", row.password_visible!)}
                                    >
                                      <Copy className="size-3.5" strokeWidth={1.75} />
                                    </Button>
                                  </div>
                                ) : row.password_storage === "bcrypt" ? (
                                  <p className="mt-0.5 text-[11px] leading-snug text-[#94a3b8] dark:text-zinc-600">
                                    Original not retrievable.
                                  </p>
                                ) : row.password_storage === "oauth_placeholder" ? (
                                  <p className="mt-0.5 text-[11px] leading-snug text-[#94a3b8] dark:text-zinc-600">
                                    Use “New pwd” for email login.
                                  </p>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  className="mt-2 h-8 gap-1 rounded-lg border-[#e5e7eb] px-2 text-[11px] font-medium dark:border-zinc-700"
                                  onClick={() => void handleRotatePassword(row)}
                                >
                                  <KeyRound className="size-3.5" strokeWidth={1.75} />
                                  New pwd
                                </Button>
                              </td>
                              <td className="min-w-[140px] px-4 py-3 align-top">
                                <span
                                  className={cn(
                                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    setup.tone === "ok" &&
                                      "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
                                    setup.tone === "progress" &&
                                      "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
                                    setup.tone === "none" &&
                                      "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300",
                                    setup.tone === "na" &&
                                      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                                  )}
                                >
                                  {setup.label}
                                </span>
                              </td>
                              <td className="max-w-[180px] px-4 py-3 align-top">
                                {row.company_name ? (
                                  <>
                                    <p className="truncate font-medium text-[#0f172a] dark:text-zinc-100">{row.company_name}</p>
                                    {row.company_website ? (
                                      <p className="truncate text-[12px] text-[#64748b] dark:text-zinc-500">{row.company_website}</p>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="text-[#94a3b8] dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="max-w-[160px] px-4 py-3 align-top">
                                {row.workspace_scenario || row.primary_region ? (
                                  <>
                                    <p className="truncate text-[#0f172a] dark:text-zinc-100">{row.workspace_scenario ?? "—"}</p>
                                    <p className="truncate text-[12px] text-[#64748b] dark:text-zinc-500">{row.primary_region ?? ""}</p>
                                  </>
                                ) : (
                                  <span className="text-[#94a3b8] dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 align-top text-right tabular-nums text-[#475569] dark:text-zinc-400">
                                {row.role === "admin" ? (
                                  "—"
                                ) : (
                                  <>
                                    {row.content_count} content
                                    <span className="block text-[11px] text-[#94a3b8] dark:text-zinc-600">
                                      {row.competitor_count} competitors
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 align-top text-right text-[#64748b] dark:text-zinc-500">
                                {formatDt(row.created_at)}
                                {row.workspace_updated_at ? (
                                  <span className="mt-0.5 block text-[11px] text-[#94a3b8] dark:text-zinc-600">
                                    WS {formatDt(row.workspace_updated_at)}
                                  </span>
                                ) : null}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 pr-6 align-top text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy || isSelf}
                                  title={isSelf ? "Cannot remove the signed-in account" : "Soft-delete user"}
                                  className="h-8 gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                                  onClick={() => void handleRemoveUser(row)}
                                >
                                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
              {pack ? (
                <AdminPaginationBar
                  page={pack.page}
                  totalPages={pack.total_pages}
                  total={pack.total}
                  pageSize={pack.page_size}
                  loading={loading}
                  onPageChange={setPage}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
