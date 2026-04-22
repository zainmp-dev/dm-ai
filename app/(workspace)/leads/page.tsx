"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmStatusBadge } from "@/components/status-badge";
import { useMarketingStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";

export default function LeadsPage() {
  const leads = useMarketingStore((s) => s.leads);
  const syncLeadToCrm = useMarketingStore((s) => s.syncLeadToCrm);
  const { push } = useToast();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Lead Management</CardTitle>
        <Button
          variant="secondary"
          onClick={() => {
            leads.filter((lead) => lead.crmStatus !== "Synced").forEach((lead) => syncLeadToCrm(lead.id));
            push("All pending leads sent to CRM");
          }}
        >
          Send all pending to CRM
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Source</th>
              <th className="py-2">Status</th>
              <th className="py-2">CRM</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-zinc-100">
                <td className="py-3">{lead.name}</td>
                <td className="py-3 text-zinc-600">{lead.email}</td>
                <td className="py-3 text-zinc-600">{lead.sourceCampaign}</td>
                <td className="py-3">{lead.status}</td>
                <td className="py-3">
                  <CrmStatusBadge status={lead.crmStatus} />
                </td>
                <td className="py-3">
                  <Button
                    size="sm"
                    onClick={() => {
                      syncLeadToCrm(lead.id);
                      push("Lead synced to CRM");
                    }}
                  >
                    Send to CRM
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
