"use client";

import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketingStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";

export default function CalendarPage() {
  const content = useMarketingStore((s) => s.content);
  const scheduleContent = useMarketingStore((s) => s.scheduleContent);
  const { push } = useToast();
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor] = useState(new Date());

  const approved = useMemo(() => content.filter((item) => item.status === "APPROVED"), [content]);
  const unscheduled = approved.filter((item) => !item.scheduledAt);

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

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Approved Content</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant={view === "month" ? "default" : "secondary"} onClick={() => setView("month")}>
              Month
            </Button>
            <Button size="sm" variant={view === "week" ? "default" : "secondary"} onClick={() => setView("week")}>
              Week
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {unscheduled.map((item) => (
            <div
              key={item.id}
              className="cursor-grab rounded-xl border border-zinc-200 p-3 text-sm"
              draggable
              onDragStart={(event) => event.dataTransfer.setData("text/post-id", item.id)}
            >
              <p className="font-medium text-zinc-900">{item.title}</p>
              <p className="text-xs text-zinc-500">{item.platform}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduling Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const assigned = approved.filter((item) => item.scheduledAt?.startsWith(key));
              return (
                <div
                  key={key}
                  className="min-h-28 rounded-xl border border-zinc-200 bg-zinc-50 p-2"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    const id = event.dataTransfer.getData("text/post-id");
                    scheduleContent(id, new Date(`${key}T10:00:00`).toISOString());
                    push("Publish date assigned");
                  }}
                >
                  <p className="text-xs font-medium text-zinc-500">{format(day, "MMM d")}</p>
                  <div className="mt-2 space-y-1">
                    {assigned.map((item) => (
                      <div key={item.id} className="rounded-lg bg-white px-2 py-1 text-xs text-zinc-700">
                        {item.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
