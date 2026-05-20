"use client";

import { format, parseISO } from "date-fns";
import { Copy, ExternalLink, KeyRound, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { useAdminPlatformSession } from "@/components/admin/admin-platform-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
import { PERM } from "@/lib/admin/permissions";
import { getAuthUser, isPlatformStaffRole } from "@/lib/auth";
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

function formatDtDetail(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "MMM d, yyyy · h:mm a");
  } catch {
    return "—";
  }
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-zinc-100 py-3 sm:grid-cols-[8.5rem_1fr] sm:items-start sm:gap-x-4 dark:border-zinc-800">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="min-w-0 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100">{children}</div>
    </div>
  );
}

function roleBadgeClass(role: string): string {
  if (isPlatformStaffRole(role)) {
    return "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200";
  }
  return "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function setupLabel(row: AdminUserRow): { label: string; tone: "ok" | "progress" | "none" | "na" } {
  if (isPlatformStaffRole(row.role)) return { label: "Platform operator", tone: "na" };
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

function hrefWebsite(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function passwordStorageLabel(storage: AdminPasswordStorage): string {
  switch (storage) {
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
  const confirm = useConfirm();
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
  const [newRole, setNewRole] = useState("user");
  const [newPassword, setNewPassword] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUserRow | null>(null);

  const [pwdModalUser, setPwdModalUser] = useState<AdminUserRow | null>(null);
  const [pwdModalStep, setPwdModalStep] = useState<"form" | "done">("form");
  const [pwdUseRandom, setPwdUseRandom] = useState(true);
  const [pwdCustom, setPwdCustom] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdResultPlain, setPwdResultPlain] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  function resetPwdModalState() {
    setPwdModalUser(null);
    setPwdModalStep("form");
    setPwdUseRandom(true);
    setPwdCustom("");
    setPwdConfirm("");
    setPwdResultPlain(null);
    setPwdBusy(false);
  }

  function openPasswordRotateModal(row: AdminUserRow) {
    setPwdModalUser(row);
    setPwdModalStep("form");
    setPwdUseRandom(true);
    setPwdCustom("");
    setPwdConfirm("");
    setPwdResultPlain(null);
    setPwdBusy(false);
  }

  const sessionEmail = (getAuthUser()?.email || "").trim().toLowerCase();
  const platformSession = useAdminPlatformSession();
  const canRotatePassword = platformSession?.permissions.includes(PERM.USER_CREDENTIALS) ?? false;
  const canRemoveUser = platformSession?.permissions.includes(PERM.USERS_WRITE) ?? false;
  const canAssignRoles = platformSession?.permissions.includes(PERM.ROLES_ASSIGN) ?? false;
  const canCreateUser = platformSession?.permissions.includes(PERM.USERS_WRITE) ?? false;

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

  function openCreateAccountModal() {
    setNewEmail("");
    setNewPassword("");
    setNewName("Admin");
    setNewRole("user");
    setCreateModalOpen(true);
  }

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
      setCreateModalOpen(false);
      setListVersion((v) => v + 1);
      setPage(1);
    } catch (err: unknown) {
      push(apiErrorMessage(err) || "Could not create user.", { kind: "error" });
    } finally {
      setCreateBusy(false);
    }
  }

  async function submitPasswordRotate(e: FormEvent) {
    e.preventDefault();
    if (!pwdModalUser || pwdBusy) return;

    let body: { password?: string | null };
    if (pwdUseRandom) {
      body = {};
    } else {
      const p = pwdCustom.trim();
      if (p.length < 6) {
        push("Custom password must be at least 6 characters (or switch to random).", { kind: "error" });
        return;
      }
      if (p !== pwdConfirm.trim()) {
        push("Password and confirmation do not match.", { kind: "error" });
        return;
      }
      body = { password: p };
    }

    setPwdBusy(true);
    try {
      const res = await apiAdminSetUserPassword(pwdModalUser.id, body);
      const uid = pwdModalUser.id;
      setPwdResultPlain(res.new_password);
      setPwdModalStep("done");
      setDetailUser((d) =>
        d && d.id === uid
          ? { ...d, password_storage: "legacy_plaintext", password_visible: res.new_password }
          : d,
      );
      setListVersion((v) => v + 1);
      try {
        await navigator.clipboard.writeText(res.new_password);
        push(`Password updated for ${pwdModalUser.email}. Copied to clipboard.`, { kind: "success" });
      } catch {
        push(`Password updated for ${pwdModalUser.email}. Clipboard blocked — copy it from this dialog.`, {
          kind: "error",
        });
      }
    } catch (err: unknown) {
      push(apiErrorMessage(err) || "Could not update password.", { kind: "error" });
    } finally {
      setPwdBusy(false);
    }
  }

  async function handleRemoveUser(row: AdminUserRow) {
    if (rowBusyId) return;
    const ok = await confirm({
      title: "Remove account",
      description: (
        <>
          Soft-delete{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{row.email}</span>? They will not be able to
          sign in.
          <span className="mt-2 block text-[13px] text-zinc-600 dark:text-zinc-400">
            This cannot be undone from the UI.
          </span>
        </>
      ),
      confirmLabel: "Remove account",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    setRowBusyId(row.id);
    try {
      await apiAdminDeleteUser(row.id);
      push(`Removed ${row.email}.`, { kind: "success" });
      setDetailUser((d) => (d?.id === row.id ? null : d));
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
    { id: "admin", label: "Operators" },
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
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#1a56db]/10 text-[#1a56db] dark:bg-blue-500/15 dark:text-blue-300">
              <UserPlus className="size-[1.35rem]" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Create account</CardTitle>
              <CardDescription className="mt-1 text-[12.5px] text-[#64748b] dark:text-zinc-500">
                {!canCreateUser
                  ? "Your operator role cannot provision accounts from the console."
                  : "Add workspace or operator accounts — leave password empty to auto-generate once and copy it after create."}
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            disabled={!canCreateUser}
            onClick={openCreateAccountModal}
            className="h-10 shrink-0 gap-2 rounded-xl bg-[#1a56db] px-5 font-medium hover:bg-[#1746b3] sm:self-center"
          >
            <Plus className="size-4" strokeWidth={2} aria-hidden />
            Add account
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={createModalOpen}
        onOpenChange={(open) => {
          if (!open && createBusy) return;
          setCreateModalOpen(open);
        }}
      >
        <DialogContent className="max-h-[min(90vh,640px)] max-w-lg gap-0 overflow-y-auto border-[#e5e7eb] bg-white p-0 dark:border-zinc-800 dark:bg-[#161618] sm:max-w-lg">
          <DialogHeader className="space-y-2 border-b border-zinc-100 p-6 pb-4 text-left dark:border-zinc-800">
            <DialogTitle className="pr-8 text-[17px] font-semibold text-[#0f172a] dark:text-zinc-50">New account</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-[#64748b] dark:text-zinc-500">
              The initial password is shown only once unless you paste your own below. Clipboard copy runs after successful create.
            </DialogDescription>
          </DialogHeader>
          <form id="admin-create-user-form" onSubmit={handleCreateUser} className="px-6 pb-2 pt-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="admin-modal-new-email" className="text-[12px]">
                  Email <span className="text-red-600 dark:text-red-400">*</span>
                </Label>
                <Input
                  id="admin-modal-new-email"
                  type="email"
                  autoComplete="off"
                  disabled={!canCreateUser}
                  autoFocus
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="mt-1.5 h-10 rounded-xl border-[#e5e7eb] dark:border-zinc-700"
                />
              </div>
              <div>
                <Label htmlFor="admin-modal-new-name" className="text-[12px]">
                  Display name
                </Label>
                <Input
                  id="admin-modal-new-name"
                  disabled={!canCreateUser}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Admin"
                  className="mt-1.5 h-10 rounded-xl border-[#e5e7eb] dark:border-zinc-700"
                />
              </div>
              <div>
                <Label htmlFor="admin-modal-new-role" className="text-[12px]">
                  Role
                </Label>
                <select
                  id="admin-modal-new-role"
                  value={newRole}
                  disabled={!canCreateUser}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="user">user</option>
                  <option value="admin">admin (legacy full)</option>
                  {canAssignRoles ? (
                    <>
                      <option value="super_admin">super_admin</option>
                      <option value="platform_admin">platform_admin</option>
                      <option value="workspace_admin">workspace_admin</option>
                      <option value="moderator">moderator</option>
                      <option value="support_agent">support_agent</option>
                      <option value="analyst">analyst</option>
                    </>
                  ) : null}
                </select>
              </div>
              <div>
                <Label htmlFor="admin-modal-new-password" className="text-[12px]">
                  Password <span className="font-normal text-[#94a3b8]">(optional)</span>
                </Label>
                <Input
                  id="admin-modal-new-password"
                  type="password"
                  autoComplete="new-password"
                  disabled={!canCreateUser}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Auto-generate if empty"
                  className="mt-1.5 h-10 rounded-xl border-[#e5e7eb] dark:border-zinc-700"
                />
              </div>
            </div>
          </form>
          <DialogFooter className="gap-2 border-t border-zinc-100 p-6 dark:border-zinc-800 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={createBusy}
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="admin-create-user-form"
              disabled={createBusy || !canCreateUser}
              className="rounded-xl bg-[#1a56db] font-medium hover:bg-[#1746b3]"
            >
              {createBusy ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader className="space-y-3 pb-3 pt-5 sm:space-y-4 sm:pb-4">
          <div>
            <CardTitle className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Directory</CardTitle>
            <CardDescription className="text-[12.5px] text-[#64748b] dark:text-zinc-500">
              Click a row for full detail (IDs, URLs). Search runs server-side with pagination.
            </CardDescription>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Label htmlFor="admin-user-q" className="sr-only">
                Search users
              </Label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                id="admin-user-q"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Name, email, ID, company, scenario…"
                className="h-9 rounded-xl border-[#e5e7eb] bg-[#fafafa] pl-9 text-[13px] dark:border-zinc-700 dark:bg-zinc-900/60"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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

          <div className="space-y-3 border-t border-[#f1f5f9] pt-3 dark:border-zinc-800">
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] dark:text-zinc-500">Setup stage</p>
              <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
                {setupPills.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setSetupFilter(pill.id)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] dark:text-zinc-500">Role</p>
                <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
                  {rolePills.map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setRoleFilter(pill.id)}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
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
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] dark:text-zinc-500">Auth provider</p>
                <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
                  {authPills.map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setAuthFilter(pill.id)}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
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
                <table className="w-full min-w-[1000px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500">
                      <th className="whitespace-nowrap px-3 py-2.5 pl-5">User</th>
                      <th className="whitespace-nowrap px-3 py-2.5">Role</th>
                      <th className="whitespace-nowrap px-3 py-2.5">Auth</th>
                      <th className="whitespace-nowrap px-3 py-2.5">Password</th>
                      <th className="whitespace-nowrap px-3 py-2.5">Workspace</th>
                      <th className="whitespace-nowrap px-3 py-2.5">Company</th>
                      <th className="whitespace-nowrap px-3 py-2.5">Scenario</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">Library</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">Joined</th>
                      <th className="whitespace-nowrap px-3 py-2.5 pr-5 text-right">Actions</th>
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
                          const shortId =
                            row.id.length > 14 ? `${row.id.slice(0, 10)}…${row.id.slice(-4)}` : row.id;
                          return (
                            <tr
                              key={row.id}
                              tabIndex={0}
                              aria-label={`Open details for ${row.name || row.email}`}
                              className="cursor-pointer bg-white outline-none transition-colors hover:bg-[#fafafa] focus-visible:bg-[#f1f5f9] focus-visible:ring-2 focus-visible:ring-[#1a56db]/25 dark:bg-[#161618] dark:hover:bg-zinc-900/50 dark:focus-visible:bg-zinc-900"
                              onClick={() => setDetailUser(row)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setDetailUser(row);
                                }
                              }}
                            >
                              <td className="max-w-[200px] px-3 py-2.5 pl-5 align-top">
                                <p className="truncate font-medium text-[#0f172a] dark:text-zinc-100">{row.name || "—"}</p>
                                <p className="truncate text-[12px] text-[#64748b] dark:text-zinc-500">{row.email}</p>
                                <p className="mt-0.5 font-mono text-[10px] text-[#94a3b8] dark:text-zinc-600" title={row.id}>
                                  {shortId}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 align-top">
                                <span
                                  className={cn(
                                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    roleBadgeClass(row.role),
                                  )}
                                >
                                  {row.role}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 align-top text-[#475569] dark:text-zinc-400">
                                {authLabel(row.auth_provider)}
                              </td>
                              <td className="max-w-[200px] px-3 py-2.5 align-top">
                                <p className="truncate text-[11px] font-medium text-[#64748b] dark:text-zinc-500">
                                  {passwordStorageLabel(row.password_storage)}
                                </p>
                                {row.password_visible ? (
                                  <div className="mt-1 flex max-w-full items-center gap-1">
                                    <code className="block min-w-0 flex-1 truncate rounded bg-[#f1f5f9] px-1.5 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
                                      {row.password_visible}
                                    </code>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="size-7 min-w-7 shrink-0 p-0 text-[#64748b]"
                                      aria-label="Copy password"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void copyText("Password", row.password_visible!);
                                      }}
                                    >
                                      <Copy className="size-3.5" strokeWidth={1.75} />
                                    </Button>
                                  </div>
                                ) : row.password_storage === "oauth_placeholder" ? (
                                  <p className="mt-0.5 truncate text-[11px] leading-snug text-[#94a3b8] dark:text-zinc-600">
                                    OAuth — use New pwd for email.
                                  </p>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy || pwdBusy || !canRotatePassword}
                                  title={!canRotatePassword ? "Insufficient permission to rotate passwords" : undefined}
                                  className="mt-1.5 h-7 gap-1 rounded-lg border-[#e5e7eb] px-2 text-[11px] font-medium dark:border-zinc-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPasswordRotateModal(row);
                                  }}
                                >
                                  <KeyRound className="size-3.5" strokeWidth={1.75} />
                                  New pwd
                                </Button>
                              </td>
                              <td className="min-w-[120px] max-w-[140px] px-3 py-2.5 align-top">
                                <span
                                  className={cn(
                                    "inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    setup.tone === "ok" &&
                                      "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
                                    setup.tone === "progress" &&
                                      "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
                                    setup.tone === "none" &&
                                      "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300",
                                    setup.tone === "na" &&
                                      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                                  )}
                                  title={setup.label}
                                >
                                  {setup.label}
                                </span>
                              </td>
                              <td className="max-w-[140px] px-3 py-2.5 align-top">
                                {row.company_name ? (
                                  <>
                                    <p className="truncate font-medium text-[#0f172a] dark:text-zinc-100">{row.company_name}</p>
                                    {row.company_website ? (
                                      <p className="truncate text-[11px] text-[#64748b] dark:text-zinc-500" title={row.company_website}>
                                        {row.company_website}
                                      </p>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="text-[#94a3b8] dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="max-w-[130px] px-3 py-2.5 align-top">
                                {row.workspace_scenario || row.primary_region ? (
                                  <>
                                    <p className="truncate text-[#0f172a] dark:text-zinc-100">{row.workspace_scenario ?? "—"}</p>
                                    <p className="truncate text-[11px] text-[#64748b] dark:text-zinc-500">{row.primary_region ?? ""}</p>
                                  </>
                                ) : (
                                  <span className="text-[#94a3b8] dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 align-top text-right tabular-nums text-[12px] text-[#475569] dark:text-zinc-400">
                                {isPlatformStaffRole(row.role) ? (
                                  "—"
                                ) : (
                                  <>
                                    {row.content_count}/{row.competitor_count}
                                    <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-[#94a3b8] dark:text-zinc-600">
                                      content / competitors
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 align-top text-right text-[12px] text-[#64748b] dark:text-zinc-500">
                                {formatDt(row.created_at)}
                                {row.workspace_updated_at ? (
                                  <span className="mt-0.5 block text-[10px] text-[#94a3b8] dark:text-zinc-600">
                                    WS {formatDt(row.workspace_updated_at)}
                                  </span>
                                ) : null}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 pr-5 align-top text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy || isSelf || !canRemoveUser}
                                  title={
                                    isSelf
                                      ? "Cannot remove the signed-in account"
                                      : !canRemoveUser
                                        ? "Insufficient permission to remove accounts"
                                        : "Soft-delete user"
                                  }
                                  className="h-7 gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleRemoveUser(row);
                                  }}
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

      <Dialog open={detailUser !== null} onOpenChange={(open) => !open && setDetailUser(null)}>
        <DialogContent className="max-h-[min(90vh,720px)] max-w-lg gap-0 overflow-y-auto border-[#e5e7eb] bg-white p-0 dark:border-zinc-800 dark:bg-[#161618] sm:max-w-lg">
          {detailUser ? (
            <>
              <DialogHeader className="space-y-1 border-b border-zinc-100 p-6 pb-4 dark:border-zinc-800">
                <DialogTitle className="pr-8 text-left text-[17px] font-semibold">
                  {detailUser.name || "Unnamed user"}
                </DialogTitle>
                <DialogDescription className="text-left text-[13px] text-zinc-500 dark:text-zinc-400">
                  {detailUser.email}
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 py-2">
                <DetailField label="User ID">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="break-all rounded-lg bg-zinc-100 px-2 py-1 font-mono text-[12px] text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                      {detailUser.id}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-[12px]"
                      onClick={() => void copyText("User ID", detailUser.id)}
                    >
                      <Copy className="mr-1 size-3.5" strokeWidth={1.75} />
                      Copy
                    </Button>
                  </div>
                </DetailField>
                <DetailField label="Role">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
                      roleBadgeClass(detailUser.role),
                    )}
                  >
                    {detailUser.role}
                  </span>
                </DetailField>
                <DetailField label="Joined">{formatDtDetail(detailUser.created_at)}</DetailField>
                <DetailField label="Sign-in">{authLabel(detailUser.auth_provider)}</DetailField>
                <DetailField label="Password">{passwordStorageLabel(detailUser.password_storage)}</DetailField>
                {detailUser.password_visible ? (
                  <DetailField label="Legacy password">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="break-all rounded-lg bg-amber-50 px-2 py-1 font-mono text-[12px] text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                        {detailUser.password_visible}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg text-[12px]"
                        onClick={() => void copyText("Password", detailUser.password_visible!)}
                      >
                        Copy
                      </Button>
                    </div>
                  </DetailField>
                ) : null}
                <DetailField label="Workspace">
                  <div className="space-y-1">
                    <p>{setupLabel(detailUser).label}</p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                      {detailUser.has_workspace ? "Workspace row present." : "No workspace row linked."}
                    </p>
                    {detailUser.workspace_updated_at ? (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        Updated {formatDtDetail(detailUser.workspace_updated_at)}
                      </p>
                    ) : null}
                  </div>
                </DetailField>
                <DetailField label="Company">
                  {detailUser.company_name ? (
                    <div>
                      <p className="font-medium">{detailUser.company_name}</p>
                      {detailUser.company_website ? (
                        <a
                          href={hrefWebsite(detailUser.company_website) ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 break-all text-[13px] text-[#1a56db] underline-offset-2 hover:underline dark:text-blue-400"
                        >
                          {detailUser.company_website}
                          <ExternalLink className="size-3.5 shrink-0 opacity-70" strokeWidth={2} />
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    "—"
                  )}
                </DetailField>
                <DetailField label="Scenario / region">
                  {[detailUser.workspace_scenario, detailUser.primary_region].filter(Boolean).length ? (
                    <div>
                      <p>{detailUser.workspace_scenario ?? "—"}</p>
                      {detailUser.primary_region ? (
                        <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">{detailUser.primary_region}</p>
                      ) : null}
                    </div>
                  ) : (
                    "—"
                  )}
                </DetailField>
                <DetailField label="Library">
                  {isPlatformStaffRole(detailUser.role) ? (
                    "—"
                  ) : (
                    <span>
                      {detailUser.content_count} content · {detailUser.competitor_count} competitors
                    </span>
                  )}
                </DetailField>
              </div>
              <DialogFooter className="gap-2 border-t border-zinc-100 p-6 pt-4 dark:border-zinc-800 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={pwdBusy || !canRotatePassword}
                    title={!canRotatePassword ? "Insufficient permission to rotate passwords" : undefined}
                    onClick={() => openPasswordRotateModal(detailUser)}
                  >
                    <KeyRound className="mr-1.5 size-3.5" strokeWidth={1.75} />
                    New password
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                    disabled={
                      rowBusyId === detailUser.id ||
                      (sessionEmail && detailUser.email.trim().toLowerCase() === sessionEmail) ||
                      !canRemoveUser
                    }
                    title={
                      sessionEmail && detailUser.email.trim().toLowerCase() === sessionEmail
                        ? "Cannot remove the signed-in account"
                        : !canRemoveUser
                          ? "Insufficient permission to remove accounts"
                          : undefined
                    }
                    onClick={() => void handleRemoveUser(detailUser)}
                  >
                    <Trash2 className="mr-1.5 size-3.5" strokeWidth={1.75} />
                    Remove user
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={pwdModalUser !== null}
        onOpenChange={(open) => {
          if (!open) resetPwdModalState();
        }}
      >
        <DialogContent className="max-w-md gap-0 border-[#e5e7eb] bg-white p-0 dark:border-zinc-800 dark:bg-[#161618] sm:max-w-md">
          {pwdModalUser && pwdModalStep === "form" ? (
            <form onSubmit={submitPasswordRotate}>
              <DialogHeader className="space-y-2 border-b border-zinc-100 p-6 pb-4 text-left dark:border-zinc-800">
                <DialogTitle className="pr-6 text-[17px] font-semibold">Update password</DialogTitle>
                <DialogDescription className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  The previous password stops working immediately for{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{pwdModalUser.email}</span>.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 px-6 py-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100">
                  Store the new password securely. The user needs it to sign in with email and password.
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    How to set
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60">
                    <button
                      type="button"
                      className={cn(
                        "rounded-lg py-2 text-[13px] font-medium transition-all",
                        pwdUseRandom
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                      )}
                      onClick={() => {
                        setPwdUseRandom(true);
                        setPwdCustom("");
                        setPwdConfirm("");
                      }}
                    >
                      Random
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-lg py-2 text-[13px] font-medium transition-all",
                        !pwdUseRandom
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                      )}
                      onClick={() => setPwdUseRandom(false)}
                    >
                      Custom
                    </button>
                  </div>
                </div>
                {pwdUseRandom ? (
                  <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    A secure random password will be generated. You can copy it on the next step.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="pwd-rotate-custom" className="text-[12px]">
                        New password
                      </Label>
                      <Input
                        id="pwd-rotate-custom"
                        type="password"
                        autoComplete="new-password"
                        value={pwdCustom}
                        onChange={(e) => setPwdCustom(e.target.value)}
                        placeholder="At least 6 characters"
                        className="mt-1.5 h-10 rounded-xl border-[#e5e7eb] dark:border-zinc-700"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pwd-rotate-confirm" className="text-[12px]">
                        Confirm password
                      </Label>
                      <Input
                        id="pwd-rotate-confirm"
                        type="password"
                        autoComplete="new-password"
                        value={pwdConfirm}
                        onChange={(e) => setPwdConfirm(e.target.value)}
                        placeholder="Re-enter new password"
                        className="mt-1.5 h-10 rounded-xl border-[#e5e7eb] dark:border-zinc-700"
                      />
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2 border-t border-zinc-100 p-6 dark:border-zinc-800 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={pwdBusy}
                  onClick={() => resetPwdModalState()}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={pwdBusy || !canRotatePassword}
                  className="rounded-xl bg-[#1a56db] font-medium hover:bg-[#1746b3]"
                >
                  {pwdBusy ? "Updating…" : "Update password"}
                </Button>
              </DialogFooter>
            </form>
          ) : pwdModalUser && pwdModalStep === "done" && pwdResultPlain ? (
            <>
              <DialogHeader className="space-y-2 border-b border-zinc-100 p-6 pb-4 text-left dark:border-zinc-800">
                <DialogTitle className="pr-6 text-[17px] font-semibold">Password updated</DialogTitle>
                <DialogDescription className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{pwdModalUser.email}</span> can sign in
                  with the password below. Copy it now — it is also visible in the user directory after you close this dialog.
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 py-4">
                <Label className="text-[12px]">Password</Label>
                <div className="mt-1.5 flex flex-wrap items-stretch gap-2">
                  <code className="min-h-10 min-w-0 flex-1 break-all rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-[13px] leading-relaxed dark:border-zinc-700 dark:bg-zinc-900">
                    {pwdResultPlain}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto shrink-0 self-stretch rounded-xl px-4"
                    onClick={() => void copyText("New password", pwdResultPlain)}
                  >
                    <Copy className="mr-2 size-3.5" strokeWidth={1.75} />
                    Copy
                  </Button>
                </div>
              </div>
              <DialogFooter className="gap-2 border-t border-zinc-100 p-6 pt-4 dark:border-zinc-800 sm:justify-end">
                <Button type="button" className="rounded-xl bg-[#1a56db] font-medium hover:bg-[#1746b3]" onClick={() => resetPwdModalState()}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
