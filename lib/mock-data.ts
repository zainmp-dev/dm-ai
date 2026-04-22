import { addDays, subDays } from "date-fns";
import type {
  ActivityItem,
  Campaign,
  Competitor,
  ContentItem,
  LeadItem,
  StrategyPlan,
} from "@/lib/types";

const companies = [
  "Northline Digital",
  "Brightforge Labs",
  "MarketBridge Co",
  "Summit Growth",
  "Pulse Creative",
  "Launch Harbor",
  "Atlas Reach",
  "Cobalt Media",
  "Verve Commerce",
  "Bluepeak Studio",
];

export function makeCompetitors(company: string): Competitor[] {
  const total = 5 + Math.floor(Math.random() * 6);
  return Array.from({ length: total }).map((_, index) => ({
    id: `comp-${index + 1}`,
    name: `${companies[index]} ${company.split(" ")[0] ?? ""}`.trim(),
    positioning: ["Premium performance marketing", "SMB-friendly creative services", "Enterprise automation with reporting"][index % 3],
    strengths: ["Strong paid social execution", "Consistent brand storytelling", "Fast campaign turnaround"],
    weaknesses: ["Limited SEO depth", "Higher monthly retainers", "Regional market focus"],
  }));
}

export function makeStrategy(): StrategyPlan {
  return {
    targetAudience: "Marketing leaders at B2B SaaS companies with teams of 20-200 employees.",
    contentThemes: ["Pipeline acceleration", "Campaign performance insights", "Cross-channel coordination", "Brand consistency"],
    platformFocus: ["LinkedIn thought leadership", "Instagram brand proof", "Email nurture touchpoints"],
  };
}

const contentSnippets = [
  "Share a short customer win with a measurable impact and clear CTA.",
  "Break down one campaign experiment and what changed after optimization.",
  "Highlight a practical framework marketing teams can apply this week.",
  "Post a behind-the-scenes process from planning to reporting.",
  "Publish a quarterly trend summary with actionable recommendations.",
];

export function makeContent(): ContentItem[] {
  const total = 10 + Math.floor(Math.random() * 11);
  return Array.from({ length: total }).map((_, index) => ({
    id: `content-${index + 1}`,
    title: `Campaign Asset ${index + 1}`,
    platform: index % 2 === 0 ? "LinkedIn" : "Instagram",
    contentText: contentSnippets[index % contentSnippets.length],
    mediaType: ["Image", "Video", "Carousel"][index % 3] as ContentItem["mediaType"],
    mediaPreview: `https://picsum.photos/seed/marketing-${index + 1}/640/360`,
    status: "PENDING",
    scheduledAt: index < 2 ? subDays(new Date(), index + 1).toISOString() : index < 5 ? addDays(new Date(), index + 2).toISOString() : null,
  }));
}

export function makeCampaigns(): Campaign[] {
  return [
    { id: "cmp-1", name: "Q2 Product Awareness", budget: 18000, status: "Active" },
    { id: "cmp-2", name: "Partner Webinar Push", budget: 9000, status: "Active" },
    { id: "cmp-3", name: "Customer Story Series", budget: 12000, status: "Draft" },
    { id: "cmp-4", name: "Retention Nurture", budget: 7600, status: "Paused" },
  ];
}

export function makeActivities(): ActivityItem[] {
  return [
    { id: "act-1", text: "Updated Q2 messaging brief", createdAt: subDays(new Date(), 1).toISOString() },
    { id: "act-2", text: "Approved 3 LinkedIn assets", createdAt: subDays(new Date(), 2).toISOString() },
    { id: "act-3", text: "Scheduled carousel for next Tuesday", createdAt: subDays(new Date(), 3).toISOString() },
    { id: "act-4", text: "Published retention campaign recap", createdAt: subDays(new Date(), 4).toISOString() },
  ];
}

export function makeLeads(): LeadItem[] {
  return [
    {
      id: "lead-1",
      name: "Alicia Gardner",
      email: "alicia.gardner@oaklane.com",
      sourceCampaign: "Q2 Product Awareness",
      status: "Qualified",
      crmStatus: "Pending",
    },
    {
      id: "lead-2",
      name: "Ravi Menon",
      email: "ravi.menon@northpine.io",
      sourceCampaign: "Partner Webinar Push",
      status: "New",
      crmStatus: "Pending",
    },
  ];
}
