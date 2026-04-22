"use client";

import { formatDistanceToNow } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketingStore } from "@/lib/store";

export default function DashboardPage() {
  const campaigns = useMarketingStore((s) => s.campaigns);
  const content = useMarketingStore((s) => s.content);
  const leads = useMarketingStore((s) => s.leads);
  const activities = useMarketingStore((s) => s.activities);
  const series = useMarketingStore((s) => s.dashboardSeries);

  const metrics = [
    { label: "Total campaigns", value: campaigns.length },
    { label: "Pending approvals", value: content.filter((item) => item.status === "PENDING").length },
    { label: "Scheduled posts", value: content.filter((item) => item.scheduledAt).length },
    { label: "Leads captured", value: leads.length },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-zinc-500">{metric.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Weekly Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="name" stroke="#71717a" />
                <YAxis stroke="#71717a" />
                <Tooltip />
                <Bar dataKey="scheduled" fill="#18181b" radius={[8, 8, 0, 0]} />
                <Bar dataKey="leads" fill="#a1a1aa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Activity Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="rounded-xl border border-zinc-200 p-3">
                <p className="text-sm text-zinc-800">{activity.text}</p>
                <p className="mt-1 text-xs text-zinc-500">{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
