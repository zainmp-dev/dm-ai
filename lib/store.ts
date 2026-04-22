"use client";

import { isBefore } from "date-fns";
import { create } from "zustand";
import { makeActivities, makeCampaigns, makeContent, makeLeads } from "@/lib/mock-data";
import type { ContentItem, ContentStatus, LeadItem, PublishingLogItem } from "@/lib/types";

type DashboardSeriesItem = { name: string; scheduled: number; leads: number };

interface MarketingState {
  campaigns: ReturnType<typeof makeCampaigns>;
  content: ContentItem[];
  leads: LeadItem[];
  publishingLog: PublishingLogItem[];
  activities: ReturnType<typeof makeActivities>;
  dashboardSeries: DashboardSeriesItem[];
  updateContent: (id: string, patch: Partial<ContentItem>) => void;
  setStatus: (ids: string[], status: ContentStatus) => void;
  scheduleContent: (id: string, dateIso: string) => void;
  publishDueContent: () => { success: number; failed: number; leadsAdded: number };
  syncLeadToCrm: (id: string) => void;
}

const initialContent = makeContent();

export const useMarketingStore = create<MarketingState>((set, get) => ({
  campaigns: makeCampaigns(),
  content: initialContent,
  leads: makeLeads(),
  publishingLog: [],
  activities: makeActivities(),
  dashboardSeries: [
    { name: "Mon", scheduled: 3, leads: 2 },
    { name: "Tue", scheduled: 5, leads: 4 },
    { name: "Wed", scheduled: 4, leads: 3 },
    { name: "Thu", scheduled: 6, leads: 5 },
    { name: "Fri", scheduled: 7, leads: 4 },
    { name: "Sat", scheduled: 2, leads: 1 },
    { name: "Sun", scheduled: 3, leads: 2 },
  ],
  updateContent: (id, patch) =>
    set((state) => ({
      content: state.content.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
  setStatus: (ids, status) =>
    set((state) => ({
      content: state.content.map((item) => {
        if (!ids.includes(item.id)) return item;
        return {
          ...item,
          status,
          scheduledAt: status === "APPROVED" ? item.scheduledAt : null,
        };
      }),
    })),
  scheduleContent: (id, dateIso) =>
    set((state) => ({
      content: state.content.map((item) =>
        item.id === id && item.status === "APPROVED" ? { ...item, scheduledAt: dateIso } : item,
      ),
    })),
  publishDueContent: () => {
    const now = new Date();
    const toPublish = get().content.filter(
      (item) => item.status === "APPROVED" && item.scheduledAt && isBefore(new Date(item.scheduledAt), now),
    );
    let success = 0;
    let failed = 0;
    let leadsAdded = 0;

    set((state) => {
      const nextLog = [...state.publishingLog];
      const nextContent = state.content.map((item) => {
        const publishable = toPublish.find((post) => post.id === item.id);
        if (!publishable) return item;
        const status = Math.random() > 0.2 ? "Success" : "Failed";
        nextLog.unshift({
          id: `pub-${Date.now()}-${item.id}`,
          contentId: item.id,
          platform: item.platform,
          timestamp: new Date().toISOString(),
          status,
        });
        if (status === "Success") {
          success += 1;
          return { ...item, scheduledAt: null };
        }
        failed += 1;
        return item;
      });

      const nextLeads = [...state.leads];
      if (success > 0 && Math.random() > 0.5) {
        leadsAdded = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < leadsAdded; i += 1) {
          nextLeads.unshift({
            id: `lead-${Date.now()}-${i}`,
            name: ["Noah Brooks", "Mia Chen", "Daniel Ortiz", "Priya Kapoor"][(i + Math.floor(Math.random() * 4)) % 4],
            email: `lead${Math.floor(Math.random() * 900) + 100}@businessmail.com`,
            sourceCampaign: state.campaigns[Math.floor(Math.random() * state.campaigns.length)].name,
            status: "New",
            crmStatus: "Pending",
          });
        }
      }

      return { content: nextContent, publishingLog: nextLog, leads: nextLeads };
    });

    return { success, failed, leadsAdded };
  },
  syncLeadToCrm: (id) =>
    set((state) => ({
      leads: state.leads.map((lead) => (lead.id === id ? { ...lead, crmStatus: "Synced" } : lead)),
    })),
}));
