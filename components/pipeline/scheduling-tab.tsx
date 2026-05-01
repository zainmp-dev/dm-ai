"use client";

import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";

export function SchedulingTab() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const schedule = useWorkspaceStore((s) => s.schedule);
  const { push } = useToast();
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor] = useState(new Date());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDateTime, setEditingDateTime] = useState("");

  const schedulable = useMemo(
    () => workspace?.content.filter((item) => item.status === "APPROVED" || item.status === "SCHEDULED") ?? [],
    [workspace?.content],
  );

  const unscheduled = schedulable.filter((item) => item.status === "APPROVED" && !item.scheduledAt);
  const editingItem = schedulable.find((item) => item.id === editingId) ?? null;

  const range = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 1 });
      const end = endOfWeek(anchor, { weekStartsOn: 1 });
      return { start, end };
    }
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    return { start, end };
  }, [anchor, view]);

  const days = useMemo(() => {
    const list: Date[] = [];
    let current = range.start;
    while (current <= range.end) {
      list.push(current);
      current = addDays(current, 1);
    }
    return list;
  }, [range]);

  if (shellPending) {
    return <Skeleton className="h-[480px] w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[minmax(260px,22rem)_minmax(0,1fr)]">
      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Approved content</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant={view === "month" ? "default" : "secondary"} className="rounded-lg" onClick={() => setView("month")}>
              Month
            </Button>
            <Button size="sm" variant={view === "week" ? "default" : "secondary"} className="rounded-lg" onClick={() => setView("week")}>
              Week
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {unscheduled.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500">
              Nothing waiting for a slot.{" "}
              <Link href="/pipeline?tab=command" className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                Command Center
              </Link>
            </div>
          )}
          {unscheduled.map((item) => (
            <div
              key={item.id}
              className="cursor-grab rounded-xl border border-zinc-200 p-3 text-sm shadow-sm transition hover:border-zinc-300"
              draggable
              onDragStart={(event) => {
                setDraggingId(item.id);
                event.dataTransfer.setData("text/post-id", item.id);
              }}
              onDragEnd={() => setDraggingId(null)}
            >
              <p className="font-medium text-zinc-900">{item.title}</p>
              <p className="text-xs text-zinc-500">{item.selectedPlatform ?? "No platform"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Scheduling calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const assigned = schedulable.filter((item) => item.scheduledAt?.startsWith(key));
              return (
                <div
                  key={key}
                  className="min-h-28 rounded-xl border border-zinc-200 bg-zinc-50/80 p-2 shadow-sm transition hover:border-zinc-300"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    const id = event.dataTransfer.getData("text/post-id");
                    if (!id) return;
                    setDraggingId(null);
                    void schedule(id, new Date(`${key}T10:00:00`).toISOString()).then(() => push("Schedule updated"));
                  }}
                >
                  <p className="text-xs font-medium text-zinc-500">{format(day, "MMM d")}</p>
                  <div className="mt-2 space-y-1">
                    {assigned.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm"
                        draggable
                        onDragStart={(event) => {
                          setDraggingId(item.id);
                          event.dataTransfer.setData("text/post-id", item.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                      >
                        <p className="truncate font-medium">{item.title}</p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-zinc-500">
                            {item.scheduledAt ? format(new Date(item.scheduledAt), "p") : "10:00 AM"}
                          </span>
                          <button
                            type="button"
                            className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-200"
                            onClick={() => {
                              setEditingId(item.id);
                              setEditingDateTime(toDateTimeLocalValue(item.scheduledAt));
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {draggingId && <p className="mt-3 text-xs text-zinc-500">Drag the post to another day to reschedule dynamically.</p>}
        </CardContent>
      </Card>
      {editingItem && (
        <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit scheduled time</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-zinc-600">{editingItem.title}</p>
            <Input type="datetime-local" value={editingDateTime} onChange={(e) => setEditingDateTime(e.target.value)} className="rounded-xl" />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                onClick={() => {
                  if (!editingDateTime) return;
                  void schedule(editingItem.id, new Date(editingDateTime).toISOString()).then(() => {
                    push("Schedule time updated");
                    setEditingId(null);
                  });
                }}
              >
                Save time
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function toDateTimeLocalValue(value: string | null) {
  const date = value ? new Date(value) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
