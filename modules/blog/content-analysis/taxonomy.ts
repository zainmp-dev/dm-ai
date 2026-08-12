export type OfficekitCategoryKey =
  | "hrms"
  | "payroll"
  | "compliance"
  | "attendance"
  | "recruitment"
  | "employee"
  | "performance"
  | "automation"
  | "guides"
  | "trends"
  | "general";

export type SourceTier = 1 | 2 | 3 | 4 | 5;

const CATEGORY_ALIASES: Array<{ key: OfficekitCategoryKey; patterns: RegExp[] }> = [
  { key: "compliance", patterns: [/compliance/i, /labour law/i, /labor law/i, /statutory/i] },
  { key: "payroll", patterns: [/payroll/i, /salary/i, /compensation/i, /ctc/i] },
  { key: "attendance", patterns: [/attendance/i, /\bleave\b/i, /shift/i, /timesheet/i] },
  { key: "recruitment", patterns: [/recruit/i, /onboard/i, /hiring/i, /talent/i] },
  { key: "employee", patterns: [/employee management/i, /people ops/i, /workforce/i] },
  { key: "performance", patterns: [/performance/i, /engagement/i, /appraisal/i, /okr/i] },
  { key: "automation", patterns: [/automation/i, /\bai\b/i, /workflow/i] },
  { key: "guides", patterns: [/guide/i, /template/i, /toolkit/i, /checklist/i] },
  { key: "trends", patterns: [/trend/i, /insight/i, /outlook/i, /future of/i] },
  { key: "hrms", patterns: [/hrms/i, /hr technology/i, /hr tech/i, /human resource management/i] },
];

const CATEGORY_CONCEPTS: Record<OfficekitCategoryKey, string[]> = {
  hrms: ["hrms", "modules", "workflow", "integration", "employee data", "automation", "reporting", "self-service"],
  payroll: ["payroll", "ctc", "gross", "net pay", "deduction", "tax", "payslip", "compliance", "salary"],
  compliance: [
    "applicability",
    "eligibility",
    "contribution",
    "due date",
    "penalty",
    "documentation",
    "authority",
    "threshold",
  ],
  attendance: ["attendance", "shift", "leave", "overtime", "policy", "tracking", "regularization"],
  recruitment: ["sourcing", "screening", "interview", "offer", "onboarding", "candidate"],
  employee: ["employee records", "lifecycle", "transfers", "directory", "documents"],
  performance: ["goals", "feedback", "review", "engagement", "recognition"],
  automation: ["workflow", "automation", "ai", "approvals", "integration"],
  guides: ["steps", "template", "checklist", "example", "how to"],
  trends: ["data", "year", "benchmark", "shift", "implication"],
  general: ["definition", "process", "example", "benefit", "limitation"],
};

const TOPIC_PACKS: Array<{ test: RegExp; concepts: string[]; compliance: boolean }> = [
  {
    test: /\b(pf|epf|epfo|provident fund)\b/i,
    compliance: true,
    concepts: ["epfo", "employee contribution", "employer contribution", "wage ceiling", "uan", "pf"],
  },
  {
    test: /\b(esi|esic|employee state insurance)\b/i,
    compliance: true,
    concepts: ["esic", "contribution", "wage threshold", "eligibility", "esi"],
  },
  {
    test: /\b(tds|tax deducted at source|income tax)\b/i,
    compliance: true,
    concepts: ["tds", "section", "slab", "deduction", "form 16"],
  },
  {
    test: /\bgratuity\b/i,
    compliance: true,
    concepts: ["gratuity", "eligibility", "calculation", "payment of gratuity"],
  },
  {
    test: /\b(payroll compliance|indian payroll|labour law|labor law|minimum wage|bonus act)\b/i,
    compliance: true,
    concepts: ["applicability", "registration", "returns", "due date", "penalty", "records"],
  },
  {
    test: /\b(gcc|uae|saudi|qatar|oman|bahrain|kuwait|wps|mol|mohre)\b/i,
    compliance: true,
    concepts: ["wps", "labour card", "end of service", "working hours", "authority"],
  },
  {
    test: /\b(ctc|cost to company|salary structure)\b/i,
    compliance: false,
    concepts: ["ctc", "basic", "allowance", "deduction", "net pay", "example"],
  },
];

const TIER1_DOMAINS = [
  "epfo.gov.in",
  "esic.gov.in",
  "incometax.gov.in",
  "incometaxindia.gov.in",
  "labour.gov.in",
  "labour.gov",
  "india.gov.in",
  "gst.gov.in",
  "uidai.gov.in",
  "mohfw.gov.in",
  "rbi.org.in",
  "cbic.gov.in",
  "egazette.gov.in",
  "mohre.gov.ae",
  "u.ae",
  "mol.gov.ae",
  "hrsd.gov.sa",
  "mlsd.gov.qa",
  "ilo.org",
];

const TIER2_DOMAINS = [
  "shrm.org",
  "oecd.org",
  "nasscom.in",
  "icai.org",
  "icsi.edu",
  "worldbank.org",
  "imf.org",
  "who.int",
];

const TIER3_DOMAINS = [
  "economictimes.indiatimes.com",
  "livemint.com",
  "business-standard.com",
  "reuters.com",
  "bloomberg.com",
  "hbr.org",
  "forbes.com",
  "bbc.com",
  "thehindu.com",
  "indianexpress.com",
];

const TIER4_DOMAINS = [
  "medium.com",
  "linkedin.com",
  "wordpress.com",
  "blogspot.com",
  "substack.com",
  "quora.com",
];

export function normalizeCategory(categoryName?: string, subcategory?: string): OfficekitCategoryKey {
  const blob = `${categoryName || ""} ${subcategory || ""}`.trim();
  if (!blob) return "general";
  for (const row of CATEGORY_ALIASES) {
    if (row.patterns.some((p) => p.test(blob))) return row.key;
  }
  return "general";
}

export function isComplianceTopic(input: {
  categoryName?: string;
  subcategory?: string;
  title?: string;
  keywords?: string[];
  text?: string;
}): boolean {
  const key = normalizeCategory(input.categoryName, input.subcategory);
  if (key === "compliance") return true;
  const blob = `${input.title || ""} ${(input.keywords || []).join(" ")} ${input.text?.slice(0, 800) || ""}`;
  return TOPIC_PACKS.some((pack) => pack.compliance && pack.test.test(blob));
}

export function requiredConcepts(input: {
  categoryName?: string;
  subcategory?: string;
  title?: string;
  keywords?: string[];
}): string[] {
  const key = normalizeCategory(input.categoryName, input.subcategory);
  const concepts = new Set<string>(CATEGORY_CONCEPTS[key]);
  const blob = `${input.title || ""} ${(input.keywords || []).join(" ")}`;
  for (const pack of TOPIC_PACKS) {
    if (pack.test.test(blob)) pack.concepts.forEach((c) => concepts.add(c));
  }
  for (const kw of input.keywords || []) {
    const cleaned = kw.trim().toLowerCase();
    if (cleaned.length >= 3) concepts.add(cleaned);
  }
  const titleWords = (input.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        !/^(what|when|where|which|with|from|this|that|your|into|about|guide|tips|step|by-step)$/.test(w),
    );
  titleWords.slice(0, 6).forEach((w) => concepts.add(w));
  return [...concepts].slice(0, 14);
}

export function classifySourceDomain(href: string): SourceTier {
  const host = extractHost(href);
  if (!host) return 5;
  if (TIER1_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)) || host.endsWith(".gov.in") || host.endsWith(".gov")) {
    return 1;
  }
  if (TIER2_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return 2;
  if (TIER3_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return 3;
  if (TIER4_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return 4;
  if (/\.gov(\.|$)/i.test(host) || /\.nic\.in$/i.test(host)) return 1;
  return 5;
}

export function extractHost(href: string): string {
  try {
    const url = new URL(href, "https://officekit.hr");
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isInternalHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return false;
  if (trimmed.startsWith("/")) return true;
  return /officekit\.hr/i.test(trimmed);
}

export const WEAK_ANCHORS = /^(click here|here|read more|learn more|this|link|website|source)$/i;
