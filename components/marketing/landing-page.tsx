"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  CheckSquare,
  FileText,
  Filter,
  GitBranch,
  Globe,
  Layers,
  Lock,
  MoreHorizontal,
  Search,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Animation Primitives ────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

// ─── Static Data ─────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Platform", href: "#dashboard" },
  { label: "Governance", href: "#governance" },
  { label: "Analytics", href: "#analytics" },
  { label: "Enterprise", href: "#workflow" },
];

const HERO_CAMPAIGNS = [
  {
    name: "Q2 Global Product Launch",
    status: "In Review",
    statusStyle: "bg-amber-50 text-amber-700 border-amber-200",
    channels: "LinkedIn · X · Email",
    due: "May 15",
    initials: ["MK", "SC", "JL"],
    progress: 72,
  },
  {
    name: "APAC Regional Campaign",
    status: "Approved",
    statusStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
    channels: "LinkedIn · Email",
    due: "May 12",
    initials: ["TN", "KW"],
    progress: 100,
  },
  {
    name: "Healthcare Vertical Refresh",
    status: "Scheduled",
    statusStyle: "bg-blue-50 text-blue-700 border-blue-200",
    channels: "All Channels",
    due: "May 20",
    initials: ["SC", "PL"],
    progress: 89,
  },
  {
    name: "Partner Co-marketing",
    status: "Draft",
    statusStyle: "bg-slate-50 text-slate-500 border-slate-200",
    channels: "LinkedIn",
    due: "Jun 1",
    initials: ["DK"],
    progress: 31,
  },
];

const TRUST_NAMES = [
  "Meridian Health",
  "Vantage Capital",
  "Orion Systems",
  "Beacon Group",
  "Nexus Corp",
  "Atlas Financial",
  "Pinnacle Media",
  "Horizon Retail",
];

const WORKFLOW = [
  {
    n: "01",
    icon: FileText,
    label: "Campaign Brief",
    desc: "Align goals, audiences, and brand constraints before production begins. Structured intake replaces email back-and-forth.",
    time: "~6 min",
  },
  {
    n: "02",
    icon: Layers,
    label: "Content Production",
    desc: "Generate channel-ready drafts with tone controls, format templates, and variant management built in.",
    time: "~14 min",
  },
  {
    n: "03",
    icon: Users,
    label: "Team Review",
    desc: "Route drafts to brand, legal, and stakeholder reviewers — each with a clear role and a deadline.",
    time: "~2–4 hrs",
  },
  {
    n: "04",
    icon: CheckSquare,
    label: "Approval Sign-off",
    desc: "Structured approval chains with role-based permissions. Every decision is logged and time-stamped.",
    time: "~30 min",
  },
  {
    n: "05",
    icon: Globe,
    label: "Regional Scheduling",
    desc: "Publish on time across every timezone. Scheduling accounts for regional calendars and channel audiences.",
    time: "~5 min",
  },
  {
    n: "06",
    icon: BarChart3,
    label: "Performance Loop",
    desc: "Engagement and reach data feeds back into the next brief — closing the planning-to-publish loop.",
    time: "Ongoing",
  },
];

const AUDIT_LOG = [
  {
    initials: "MW",
    name: "M. Webb",
    action: "published",
    item: "Q2 LinkedIn Set — 12 assets",
    time: "2m ago",
    color: "bg-blue-500",
  },
  {
    initials: "SC",
    name: "S. Chen",
    action: "approved",
    item: "Healthcare Legal Copy — Round 2",
    time: "18m ago",
    color: "bg-emerald-500",
  },
  {
    initials: "SY",
    name: "System",
    action: "scheduled",
    item: "8 posts across APAC timezones",
    time: "1h ago",
    color: "bg-slate-400",
  },
  {
    initials: "JP",
    name: "J. Park",
    action: "updated",
    item: "APAC Campaign Brief v3",
    time: "2h ago",
    color: "bg-violet-500",
  },
  {
    initials: "SY",
    name: "System",
    action: "passed compliance for",
    item: "EU Regional Set",
    time: "3h ago",
    color: "bg-slate-400",
  },
];

const ROLES = [
  { name: "Content Editor", perms: [true, false, false, false, false] },
  { name: "Campaign Manager", perms: [true, true, false, false, true] },
  { name: "Legal Reviewer", perms: [false, true, true, false, true] },
  { name: "Exec Approver", perms: [false, false, true, false, true] },
  { name: "Publisher", perms: [false, false, false, true, true] },
];

const PERM_LABELS = ["Create", "Review", "Approve", "Publish", "Audit"];

const ANALYTICS_METRICS = [
  { label: "Campaigns shipped", value: "127", delta: "+18%", up: true, period: "This month" },
  { label: "Avg. approval time", value: "2.3 hrs", delta: "−31%", up: true, period: "vs last quarter" },
  { label: "Publishing accuracy", value: "99.4%", delta: "+0.6%", up: true, period: "Across all channels" },
  { label: "Active regions", value: "14", delta: "+3 regions", up: true, period: "Since Q1" },
];

const BAR_DATA = [48, 63, 71, 58, 82, 76, 91, 84, 95, 87, 110, 127];
const MONTH_LABELS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"];

// ─── Root ────────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <main className="bg-[#F5F7FA] text-[#0B1020] antialiased">
      <Nav />
      <HeroSection />
      <TrustBar />
      <WorkflowSection />
      <DashboardSection />
      <GovernanceSection />
      <AnalyticsSection />
      <CtaSection />
      <Footer />
    </main>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(15,23,42,0.06)] bg-[#F5F7FA]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-6 md:px-10">
        <Link href="/" className="text-[13px] font-semibold tracking-[0.12em] text-[#0B1020]">
          FlowPilot
        </Link>

        <nav className="hidden items-center gap-8 text-[13px] text-[#5B6475] md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.label} href={l.href} className="transition-colors hover:text-[#0B1020]">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button
              variant="ghost"
              className="h-9 rounded-lg px-4 text-[13px] text-[#5B6475] hover:bg-black/5 hover:text-[#0B1020]"
            >
              Sign in
            </Button>
          </Link>
          <Link href="/signup">
            <Button className="h-9 rounded-lg bg-[#0B1020] px-4 text-[13px] text-white shadow-none hover:bg-[#1e293b]">
              Request demo
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-0 pt-20 md:px-10 lg:pt-28">
      <div className="grid gap-14 lg:grid-cols-[1fr_1.15fr] lg:items-start">
        {/* Left */}
        <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-[560px]">
          <motion.span
            variants={fadeUp}
            className="mb-6 inline-block rounded-full border border-[rgba(37,99,235,0.18)] bg-[rgba(37,99,235,0.05)] px-3.5 py-1 text-[11px] font-medium tracking-[0.16em] text-[#2563EB]"
          >
            ENTERPRISE MARKETING OPERATIONS
          </motion.span>

          <motion.h1
            variants={fadeUp}
            className="text-balance text-[2.75rem] font-semibold leading-[1.06] tracking-[-0.035em] text-[#0B1020] md:text-[3.25rem]"
          >
            Campaign orchestration{" "}
            <span className="text-[#5B6475]">at enterprise scale.</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="mt-6 text-[17px] leading-relaxed text-[#5B6475]">
            FlowPilot gives marketing operations teams a governed pipeline for
            planning, review, approval, and multi-channel publishing — so campaigns
            ship on time without sacrificing compliance.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup">
              <Button className="group h-10 rounded-lg bg-[#0B1020] px-5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e293b]">
                Request a demo
                <ArrowRight className="ml-2 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                variant="ghost"
                className="h-10 rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-5 text-[13px] font-medium text-[#0B1020] hover:bg-[#F8FAFC]"
              >
                See how it works
              </Button>
            </Link>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-10 flex items-center gap-8 border-t border-[rgba(15,23,42,0.06)] pt-8"
          >
            {[
              { val: "2.3 hrs", label: "avg. approval time" },
              { val: "99.4%", label: "publishing accuracy" },
              { val: "127+", label: "campaigns / month" },
            ].map((m) => (
              <div key={m.label}>
                <p className="text-[1.25rem] font-semibold tracking-[-0.025em] text-[#0B1020]">{m.val}</p>
                <p className="mt-0.5 text-[12px] text-[#5B6475]">{m.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Right: Product Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.18, ease: EASE }}
          className="-mr-6 md:-mr-10"
        >
          <ProductMockup />
        </motion.div>
      </div>
    </section>
  );
}

function ProductMockup() {
  return (
    <div className="overflow-hidden rounded-tl-2xl border border-[rgba(15,23,42,0.08)] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.1),0_4px_16px_rgba(15,23,42,0.05)]">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-[rgba(15,23,42,0.06)] bg-[#F8FAFC] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FC7070]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FDBC40]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#34C759]" />
        <span className="mx-auto max-w-[200px] flex-1 rounded bg-[#E8ECF0] px-3 py-1 text-center text-[11px] text-[#94A3B8]">
          app.flowpilot.com/campaigns
        </span>
      </div>

      {/* App shell */}
      <div className="flex h-[420px] overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-[48px] flex-col items-center gap-1 border-r border-[rgba(15,23,42,0.06)] bg-white py-3">
          {[
            { Icon: Layers, active: true },
            { Icon: CheckSquare, active: false },
            { Icon: Calendar, active: false },
            { Icon: BarChart3, active: false },
            { Icon: Shield, active: false },
          ].map(({ Icon, active }, i) => (
            <div
              key={i}
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                active ? "bg-[#0B1020] text-white" : "text-[#94A3B8]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
          ))}
          <div className="mt-auto">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[#C8D0DA]">
              <Settings className="h-3.5 w-3.5" />
            </div>
          </div>
        </aside>

        {/* Main panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.06)] px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-[#0B1020]">Active Campaigns</p>
              <p className="text-[11px] text-[#94A3B8]">4 active · 2 pending review</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(15,23,42,0.08)] text-[#94A3B8]">
                <Filter className="h-3 w-3" />
              </button>
              <button className="flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(15,23,42,0.08)] text-[#94A3B8]">
                <Search className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Table header */}
          <div className="flex items-center gap-3 border-b border-[rgba(15,23,42,0.04)] bg-[#F8FAFC] px-4 py-2">
            {["Campaign", "Status", "Channels", "Due", "Team"].map((h, i) => (
              <span
                key={h}
                className={`text-[10px] font-medium uppercase tracking-[0.1em] text-[#94A3B8] ${
                  i === 0 ? "flex-1" : i === 1 ? "w-[82px]" : i === 2 ? "w-[100px]" : i === 3 ? "w-[46px]" : "w-[56px]"
                }`}
              >
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          <div className="flex-1 divide-y divide-[rgba(15,23,42,0.04)] overflow-auto">
            {HERO_CAMPAIGNS.map((c) => (
              <div
                key={c.name}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#F8FAFC]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-[#0B1020]">{c.name}</p>
                  <div className="mt-1.5 h-[3px] w-full max-w-[130px] overflow-hidden rounded-full bg-[#E8ECF0]">
                    <div
                      className="h-full rounded-full bg-[#2563EB]"
                      style={{ width: `${c.progress}%`, opacity: c.progress === 100 ? 0.4 : 0.8 }}
                    />
                  </div>
                </div>
                <div className="w-[82px]">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${c.statusStyle}`}>
                    {c.status}
                  </span>
                </div>
                <div className="w-[100px]">
                  <p className="text-[11px] text-[#5B6475]">{c.channels}</p>
                </div>
                <div className="w-[46px]">
                  <p className="text-[11px] text-[#5B6475]">{c.due}</p>
                </div>
                <div className="flex w-[56px] -space-x-1.5">
                  {c.initials.slice(0, 3).map((ini) => (
                    <div
                      key={ini}
                      className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#E2E8F0] text-[8px] font-semibold text-[#64748B]"
                    >
                      {ini[0]}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between border-t border-[rgba(15,23,42,0.06)] px-4 py-2">
            <p className="text-[11px] text-[#94A3B8]">Showing 4 of 18 campaigns</p>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-[11px] font-medium text-[#5B6475]">3 need attention</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trust Bar ───────────────────────────────────────────────────────────────

function TrustBar() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-10">
      <div className="border-t border-[rgba(15,23,42,0.06)] pt-14">
        <p className="text-center text-[11px] tracking-[0.18em] text-[#94A3B8]">
          TRUSTED BY MARKETING OPERATIONS TEAMS AT
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {TRUST_NAMES.map((name) => (
            <span key={name} className="text-[13px] font-medium tracking-tight text-[#C8D0DA]">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Workflow Section ────────────────────────────────────────────────────────

function WorkflowSection() {
  return (
    <section id="workflow" className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="max-w-xl">
          <p className="text-[11px] tracking-[0.18em] text-[#94A3B8]">THE PIPELINE</p>
          <h2 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] md:text-[2.5rem]">
            One governed pipeline,
            <br />
            end to end.
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-[#5B6475]">
            From brief to published post, every step has an owner, a deadline, and an
            audit trail — built into the platform.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          className="mt-12 overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white shadow-[0_8px_40px_rgba(15,23,42,0.05)]"
        >
          <div className="grid gap-px bg-[rgba(15,23,42,0.06)] sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW.map((step) => (
              <motion.div
                key={step.n}
                variants={fadeUp}
                className="group bg-white px-7 py-7 transition-colors hover:bg-[#F8FAFC]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.07)] bg-[#F5F7FA]">
                    <step.icon className="h-4 w-4 text-[#5B6475]" />
                  </div>
                  <span className="font-mono text-[11px] text-[#D1D9E0]">{step.n}</span>
                </div>
                <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.01em] text-[#0B1020]">
                  {step.label}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#5B6475]">{step.desc}</p>
                <p className="mt-4 text-[11px] font-medium text-[#2563EB]">{step.time}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ─── Dashboard Section ───────────────────────────────────────────────────────

function DashboardSection() {
  return (
    <section id="dashboard" className="mx-auto max-w-7xl px-6 pb-16 md:px-10 md:pb-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="max-w-xl">
          <p className="text-[11px] tracking-[0.18em] text-[#94A3B8]">COMMAND CENTER</p>
          <h2 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] md:text-[2.5rem]">
            Everything your team needs.
            <br />
            <span className="text-[#5B6475]">Nothing they don't.</span>
          </h2>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-10 overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
        >
          <FullDashboard />
        </motion.div>
      </motion.div>
    </section>
  );
}

function FullDashboard() {
  const dashCampaigns = [
    ...HERO_CAMPAIGNS,
    {
      name: "US Q2 Demand Gen — Wave 2",
      status: "Published",
      statusStyle: "bg-slate-50 text-slate-400 border-slate-200",
      channels: "All Channels",
      due: "Done",
      initials: ["MK", "SC", "TN", "JP"],
      progress: 100,
    },
  ];

  return (
    <div className="flex h-[540px] overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-[196px] flex-col border-r border-[rgba(15,23,42,0.06)] bg-white p-3">
        <div className="mb-5 flex items-center gap-2.5 px-2 pt-1">
          <div className="h-6 w-6 rounded-md bg-[#0B1020]" />
          <span className="text-[12px] font-semibold tracking-tight text-[#0B1020]">FlowPilot</span>
        </div>

        <div className="space-y-0.5">
          {[
            { label: "Campaigns", Icon: Layers, active: true },
            { label: "Approvals", Icon: CheckSquare, active: false, badge: "3" },
            { label: "Publishing", Icon: Calendar, active: false },
            { label: "Analytics", Icon: BarChart3, active: false },
            { label: "Governance", Icon: Shield, active: false },
            { label: "Team", Icon: Users, active: false },
          ].map(({ label, Icon, active, badge }) => (
            <div
              key={label}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                active ? "bg-[#F1F5F9] text-[#0B1020]" : "text-[#5B6475]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[12px] font-medium">{label}</span>
              </div>
              {badge && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#2563EB] px-1 text-[9px] font-bold text-white">
                  {badge}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-bold text-white">
            MK
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#0B1020]">Maya Kim</p>
            <p className="text-[10px] text-[#94A3B8]">Campaign Lead</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.06)] px-5 py-3">
          <p className="text-[14px] font-semibold text-[#0B1020]">Campaigns</p>
          <div className="flex items-center gap-3">
            <Bell className="h-4 w-4 text-[#C8D0DA]" />
            <div className="h-4 w-px bg-[rgba(15,23,42,0.06)]" />
            <button className="flex h-7 items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.1)] bg-white px-3 text-[11px] font-medium text-[#0B1020] hover:bg-[#F8FAFC]">
              + New Campaign
            </button>
          </div>
        </div>

        {/* Metrics strip */}
        <div className="flex border-b border-[rgba(15,23,42,0.06)] bg-[#F8FAFC]">
          {[
            { label: "Active", val: "18" },
            { label: "In Review", val: "4" },
            { label: "Approved", val: "7" },
            { label: "Scheduled", val: "11" },
          ].map((m, i) => (
            <div
              key={m.label}
              className={`flex-1 px-5 py-3 ${i < 3 ? "border-r border-[rgba(15,23,42,0.06)]" : ""}`}
            >
              <p className="text-[18px] font-semibold tracking-[-0.02em] text-[#0B1020]">{m.val}</p>
              <p className="text-[10px] text-[#94A3B8]">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <div className="flex items-center gap-3 border-b border-[rgba(15,23,42,0.04)] px-5 py-2">
            {["Campaign", "Status", "Channels", "Owner", "Due", ""].map((h, i) => (
              <span
                key={`${h}-${i}`}
                className={`text-[10px] font-medium uppercase tracking-[0.1em] text-[#94A3B8] ${
                  i === 0
                    ? "flex-1"
                    : i === 1
                    ? "w-[88px]"
                    : i === 2
                    ? "w-[100px]"
                    : i === 3
                    ? "w-[72px]"
                    : i === 4
                    ? "w-[52px]"
                    : "w-[28px]"
                }`}
              >
                {h}
              </span>
            ))}
          </div>

          <div className="divide-y divide-[rgba(15,23,42,0.04)]">
            {dashCampaigns.map((c) => (
              <div
                key={c.name}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#F8FAFC]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#0B1020]">{c.name}</p>
                  <div className="mt-1.5 h-[3px] w-full max-w-[180px] overflow-hidden rounded-full bg-[#E8ECF0]">
                    <div
                      className="h-full rounded-full bg-[#2563EB]"
                      style={{ width: `${c.progress}%`, opacity: c.progress === 100 ? 0.3 : 0.7 }}
                    />
                  </div>
                </div>
                <div className="w-[88px]">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${c.statusStyle}`}>
                    {c.status}
                  </span>
                </div>
                <div className="w-[100px]">
                  <p className="text-[11px] text-[#5B6475]">{c.channels}</p>
                </div>
                <div className="flex w-[72px] -space-x-1.5">
                  {c.initials.slice(0, 3).map((ini) => (
                    <div
                      key={ini}
                      className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#E2E8F0] text-[8px] font-semibold text-[#64748B]"
                    >
                      {ini[0]}
                    </div>
                  ))}
                  {c.initials.length > 3 && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#F1F5F9] text-[8px] font-medium text-[#94A3B8]">
                      +{c.initials.length - 3}
                    </div>
                  )}
                </div>
                <div className="w-[52px]">
                  <p className="text-[11px] text-[#5B6475]">{c.due}</p>
                </div>
                <div className="flex w-[28px] justify-end">
                  <button className="text-[#D1D9E0] hover:text-[#5B6475]">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <aside className="hidden w-[212px] flex-col border-l border-[rgba(15,23,42,0.06)] bg-white xl:flex">
        <div className="border-b border-[rgba(15,23,42,0.06)] px-4 py-3">
          <p className="text-[12px] font-semibold text-[#0B1020]">Pending Approvals</p>
          <p className="text-[10px] text-[#94A3B8]">3 items need review</p>
        </div>

        <div className="divide-y divide-[rgba(15,23,42,0.04)]">
          {[
            {
              task: "Healthcare Legal Copy",
              type: "Legal Review",
              urgency: "Urgent",
              urgencyStyle: "text-red-600 bg-red-50",
              initials: "SC",
              avatarBg: "bg-emerald-500",
            },
            {
              task: "APAC Brand Deck v4",
              type: "Brand Review",
              urgency: "Today",
              urgencyStyle: "text-amber-700 bg-amber-50",
              initials: "TN",
              avatarBg: "bg-violet-500",
            },
            {
              task: "Q2 Exec Summary",
              type: "Exec Sign-off",
              urgency: "This week",
              urgencyStyle: "text-slate-500 bg-slate-50",
              initials: "JP",
              avatarBg: "bg-blue-500",
            },
          ].map((item) => (
            <div key={item.task} className="px-4 py-3">
              <div className="flex items-start gap-2.5">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${item.avatarBg}`}
                >
                  {item.initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-[#0B1020]">{item.task}</p>
                  <p className="text-[10px] text-[#94A3B8]">{item.type}</p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${item.urgencyStyle}`}>
                  {item.urgency}
                </span>
                <button className="text-[11px] font-medium text-[#2563EB]">Review →</button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto border-t border-[rgba(15,23,42,0.06)] px-4 py-4">
          <p className="text-[11px] font-semibold text-[#0B1020]">Publishing Queue</p>
          <div className="mt-2.5 space-y-1.5">
            {[
              { label: "14 posts scheduled today", dot: "bg-blue-500" },
              { label: "6 regions · 3 channels", dot: "bg-emerald-500" },
              { label: "Next publish in 22 min", dot: "bg-amber-400" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`} />
                <span className="text-[10px] text-[#5B6475]">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Governance Section ───────────────────────────────────────────────────────

function GovernanceSection() {
  return (
    <section id="governance" className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
        className="grid gap-14 lg:grid-cols-2 lg:items-start"
      >
        {/* Left */}
        <motion.div variants={fadeUp}>
          <p className="text-[11px] tracking-[0.18em] text-[#94A3B8]">GOVERNANCE & COMPLIANCE</p>
          <h2 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] md:text-[2.5rem]">
            Enterprise-grade controls,
            <br />
            <span className="text-[#5B6475]">built into every action.</span>
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#5B6475]">
            Role-based permissions ensure the right people approve the right content.
            Every decision is time-stamped, attributed, and auditable — out of the box.
          </p>

          <div className="mt-10 space-y-6">
            {[
              {
                Icon: Lock,
                title: "Role-based access control",
                desc: "Granular permissions for every stage of the campaign pipeline — from drafting to final publish.",
              },
              {
                Icon: GitBranch,
                title: "Structured approval chains",
                desc: "Multi-tier sign-off flows that adapt to regional and legal requirements without manual configuration.",
              },
              {
                Icon: Shield,
                title: "Complete audit trail",
                desc: "Every edit, approval, and publish action is logged with user attribution and timestamp.",
              },
              {
                Icon: Globe,
                title: "Regional governance",
                desc: "Enforce jurisdiction-specific publishing rules for EU, APAC, LATAM, and US markets.",
              },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(15,23,42,0.07)] bg-white shadow-[0_1px_4px_rgba(15,23,42,0.05)]">
                  <Icon className="h-3.5 w-3.5 text-[#5B6475]" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#0B1020]">{title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#5B6475]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right */}
        <motion.div variants={fadeUp} className="space-y-4">
          {/* Audit log */}
          <div className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.06)] px-5 py-3.5">
              <p className="text-[13px] font-semibold text-[#0B1020]">Audit Log</p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-[#94A3B8]">Live</span>
              </div>
            </div>
            <div className="divide-y divide-[rgba(15,23,42,0.04)]">
              {AUDIT_LOG.map((entry) => (
                <div key={entry.item} className="flex items-center gap-3 px-5 py-3">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white ${entry.color}`}
                  >
                    {entry.initials}
                  </div>
                  <p className="min-w-0 flex-1 truncate text-[12px] text-[#0B1020]">
                    <span className="font-medium">{entry.name}</span>{" "}
                    <span className="text-[#5B6475]">{entry.action}</span>{" "}
                    <span>{entry.item}</span>
                  </p>
                  <span className="shrink-0 text-[10px] text-[#94A3B8]">{entry.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Role permission matrix */}
          <div className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.07)] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.06)]">
            <div className="border-b border-[rgba(15,23,42,0.06)] px-5 py-3.5">
              <p className="text-[13px] font-semibold text-[#0B1020]">Permission Matrix</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px]">
                <thead>
                  <tr className="border-b border-[rgba(15,23,42,0.04)] bg-[#F8FAFC]">
                    <th className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-[#94A3B8]">
                      Role
                    </th>
                    {PERM_LABELS.map((l) => (
                      <th
                        key={l}
                        className="px-3 py-2.5 text-center text-[10px] font-medium uppercase tracking-[0.1em] text-[#94A3B8]"
                      >
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(15,23,42,0.04)]">
                  {ROLES.map((role) => (
                    <tr key={role.name} className="transition-colors hover:bg-[#F8FAFC]">
                      <td className="px-5 py-3 text-[12px] font-medium text-[#0B1020]">{role.name}</td>
                      {role.perms.map((p, i) => (
                        <td key={i} className="px-3 py-3 text-center">
                          {p ? (
                            <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-[#2563EB]" />
                          ) : (
                            <span className="mx-auto block h-px w-3 bg-[#E2E8F0]" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ─── Analytics Section ────────────────────────────────────────────────────────

function AnalyticsSection() {
  const maxBar = Math.max(...BAR_DATA);

  return (
    <section id="analytics" className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
        className="rounded-3xl border border-[rgba(15,23,42,0.07)] bg-white px-8 py-10 shadow-[0_16px_64px_rgba(15,23,42,0.07)] md:px-12 md:py-14"
      >
        <motion.div
          variants={fadeUp}
          className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <p className="text-[11px] tracking-[0.18em] text-[#94A3B8]">ANALYTICS</p>
            <h2 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em]">
              Operations performance
              <br />
              at a glance.
            </h2>
          </div>
          <p className="text-[13px] text-[#94A3B8]">Last 12 months</p>
        </motion.div>

        {/* Metric cards */}
        <motion.div
          variants={stagger}
          className="mt-8 overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.06)] bg-[rgba(15,23,42,0.025)]"
        >
          <div className="grid gap-px bg-[rgba(15,23,42,0.06)] sm:grid-cols-2 lg:grid-cols-4">
            {ANALYTICS_METRICS.map((m) => (
              <motion.div key={m.label} variants={fadeUp} className="bg-white px-6 py-5">
                <p className="text-[11px] text-[#94A3B8]">{m.label}</p>
                <p className="mt-2 text-[1.8rem] font-semibold tracking-[-0.03em] text-[#0B1020]">{m.value}</p>
                <p className="mt-1 text-[12px] font-medium text-emerald-600">{m.delta}</p>
                <p className="text-[10px] text-[#C8D0DA]">{m.period}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bar chart */}
        <motion.div variants={fadeUp} className="mt-10">
          <p className="mb-5 text-[12px] font-medium text-[#5B6475]">Campaigns shipped per month</p>
          <div className="flex h-24 items-end justify-between gap-1.5">
            {BAR_DATA.map((val, i) => {
              const isLast = i === BAR_DATA.length - 1;
              const heightPct = (val / maxBar) * 100;
              return (
                <div key={i} className="group flex flex-1 flex-col items-center gap-0">
                  <div
                    className={`relative w-full rounded-sm transition-all ${
                      isLast ? "bg-[#2563EB]" : "bg-[#2563EB]"
                    }`}
                    style={{
                      height: `${heightPct}%`,
                      opacity: isLast ? 1 : 0.18 + (i / BAR_DATA.length) * 0.6,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between">
            {MONTH_LABELS.map((m, i) => (
              <span key={i} className="flex-1 text-center text-[9px] text-[#C8D0DA]">
                {m}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Trust signals */}
        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-wrap items-center gap-3 border-t border-[rgba(15,23,42,0.06)] pt-8"
        >
          {["SOC 2 Type II", "GDPR Compliant", "SSO + SAML", "RBAC Controls", "99.98% Uptime", "API & Webhooks"].map(
            (item) => (
              <span
                key={item}
                className="rounded-full border border-[rgba(15,23,42,0.08)] bg-[#F5F7FA] px-3.5 py-1.5 text-[11px] font-medium text-[#5B6475]"
              >
                {item}
              </span>
            )
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}

// ─── CTA Section ─────────────────────────────────────────────────────────────

function CtaSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-16 md:px-10 md:pb-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={stagger}
        className="rounded-3xl bg-[#0B1020] px-8 py-20 text-center md:px-16"
      >
        <motion.p
          variants={fadeUp}
          className="text-[11px] tracking-[0.18em] text-[rgba(255,255,255,0.35)]"
        >
          GET STARTED
        </motion.p>
        <motion.h2
          variants={fadeUp}
          className="mx-auto mt-4 max-w-2xl text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] text-white md:text-[2.5rem]"
        >
          Ready to run a tighter
          <br />
          campaign operation?
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="mx-auto mt-5 max-w-[480px] text-[16px] leading-relaxed text-[rgba(255,255,255,0.45)]"
        >
          See how FlowPilot helps enterprise marketing teams ship more campaigns
          with less coordination overhead and full governance.
        </motion.p>
        <motion.div
          variants={fadeUp}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link href="/signup">
            <Button className="group h-11 rounded-lg bg-white px-6 text-[14px] font-medium text-[#0B1020] shadow-none hover:bg-[#F1F5F9]">
              Request a demo
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
          <Link href="/login">
            <Button
              variant="ghost"
              className="h-11 rounded-lg border border-[rgba(255,255,255,0.14)] px-6 text-[14px] font-medium text-white hover:bg-[rgba(255,255,255,0.08)]"
            >
              Sign in to your account
            </Button>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  const FOOTER_COLS = [
    {
      heading: "Platform",
      links: [
        { label: "Campaigns", href: "#dashboard" },
        { label: "Approvals", href: "#governance" },
        { label: "Publishing", href: "#workflow" },
        { label: "Analytics", href: "#analytics" },
      ],
    },
    {
      heading: "Governance",
      links: [
        { label: "Access control", href: "#governance" },
        { label: "Audit logs", href: "#governance" },
        { label: "Compliance", href: "#governance" },
        { label: "Permissions", href: "#governance" },
      ],
    },
    {
      heading: "Account",
      links: [
        { label: "Sign in", href: "/login" },
        { label: "Sign up", href: "/signup" },
        { label: "Request demo", href: "/signup" },
      ],
    },
  ];

  return (
    <footer className="border-t border-[rgba(15,23,42,0.06)] bg-[#F5F7FA]">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4 md:px-10">
        <div>
          <p className="text-[13px] font-semibold tracking-[0.1em] text-[#0B1020]">FlowPilot</p>
          <p className="mt-2.5 max-w-[200px] text-[13px] leading-relaxed text-[#5B6475]">
            Enterprise marketing operations and campaign orchestration.
          </p>
        </div>

        {FOOTER_COLS.map((col) => (
          <div key={col.heading}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0B1020]">
              {col.heading}
            </p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[13px] text-[#5B6475] transition-colors hover:text-[#0B1020]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[rgba(15,23,42,0.06)] px-6 py-5 md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <p className="text-[12px] text-[#94A3B8]">© 2024 FlowPilot. All rights reserved.</p>
          <div className="flex items-center gap-5 text-[12px] text-[#94A3B8]">
            {["Privacy", "Terms", "Security"].map((l) => (
              <a key={l} href="#" className="transition-colors hover:text-[#5B6475]">
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
