import { WEAK_ANCHORS } from "./taxonomy";
import { countKeyword, keywordIn, type ArticleFeatures, type SearchIntentType } from "./extract";

export type IssueSeverity = "critical" | "high" | "medium" | "low";
export type DimensionKey = "seo" | "geo" | "llm" | "quality" | "readability";

export type SubScore = {
  id: string;
  label: string;
  dimension: DimensionKey;
  points: number;
  max: number;
  reason: string;
  strengths: string[];
  weaknesses: string[];
  suggestion: string;
};

export type DimensionReport = {
  score: number;
  max: 100;
  reason: string;
  strengths: string[];
  weaknesses: string[];
  subs: SubScore[];
};

export type CanonicalIssue = {
  id: string;
  severity: IssueSeverity;
  dimension: DimensionKey;
  title: string;
  impact: number;
  recommendation: string;
  evidence: string;
};

export type PublishingBand =
  | "do_not_publish"
  | "major_revision"
  | "revise_before_publishing"
  | "publish_ready_minor"
  | "high_quality";

export type EvidenceProfile = {
  claimCount: number;
  evidenceRequired: number;
  sourcedRequired: number;
  bestTier: number | null;
  hasTier1: boolean;
  unsourcedRequired: number;
  fabricatedRisk: boolean;
  genericCitation: boolean;
  score: number;
};

export type EngineResult = {
  seo: DimensionReport;
  geo: DimensionReport;
  llm: DimensionReport;
  quality: DimensionReport;
  readability: DimensionReport;
  overallRaw: number;
  overallScore: number;
  penaltiesApplied: number;
  capsApplied: string[];
  issues: CanonicalIssue[];
  evidence: EvidenceProfile;
  intent: SearchIntentType;
  categoryRelevance: number;
  confidence: number;
  publishing: { band: PublishingBand; label: string };
  emptyBody: boolean;
};

const OVERALL_WEIGHTS = { seo: 0.25, geo: 0.2, llm: 0.2, quality: 0.2, readability: 0.15 } as const;

const CLICKBAIT = /\b(you won't believe|shocking|secret|ultimate hack|mind-blowing|gone wrong)\b/i;

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function ratioPoints(max: number, ratio: number): number {
  return clamp(ratio, 0, 1) * max;
}

function sub(
  id: string,
  label: string,
  dimension: DimensionKey,
  max: number,
  ratio: number,
  reason: string,
  suggestion: string,
  strengths: string[] = [],
  weaknesses: string[] = [],
): SubScore {
  return {
    id,
    label,
    dimension,
    points: ratioPoints(max, ratio),
    max,
    reason,
    suggestion,
    strengths,
    weaknesses,
  };
}

function dimensionFromSubs(subs: SubScore[], fallback: string): DimensionReport {
  const max = subs.reduce((s, x) => s + x.max, 0) || 100;
  const points = subs.reduce((s, x) => s + x.points, 0);
  const score = max ? (points / max) * 100 : 0;
  const ranked = [...subs].sort((a, b) => a.points / a.max - b.points / b.max);
  const weak = ranked.filter((s) => s.points / s.max < 0.75).slice(0, 2);
  const strong = [...subs].filter((s) => s.points / s.max >= 0.8).slice(0, 2);
  const weaknesses = weak.map((s) => s.reason);
  const strengths = strong.map((s) => s.reason);
  const reason =
    weak.length > 0
      ? weak.map((s) => s.reason).join(" ")
      : strengths[0] || fallback;
  return { score, max: 100, reason, strengths, weaknesses, subs };
}

function buildEvidence(f: ArticleFeatures): EvidenceProfile {
  const required = f.claims.filter((c) => c.requiresEvidence);
  const sourced = required.filter((c) => c.hasCitationNearby && (c.nearbyTier === null || c.nearbyTier <= 3));
  const external = f.links.filter((l) => !l.internal);
  const bestTier = external.length ? Math.min(...external.map((l) => l.tier)) : null;
  const hasTier1 = external.some((l) => l.tier === 1);
  const unsourcedRequired = required.filter((c) => !c.hasCitationNearby).length;
  const genericCitation = /\b(studies show|research shows|experts say|according to (a |recent )?(study|experts|research))\b/i.test(
    f.text,
  );
  const fabricatedRisk = genericCitation && external.filter((l) => l.tier <= 3).length === 0;

  let score = 0.15;
  if (required.length === 0) {
    score = external.length >= 2 && (bestTier ?? 5) <= 3 ? 0.78 : external.length >= 1 ? 0.48 : 0.28;
    if (hasTier1) score = Math.max(score, 0.82);
  } else {
    let sourcedCount = sourced.length;
    if (f.isComplianceTopic && hasTier1) {
      sourcedCount = Math.max(
        sourcedCount,
        required.filter((c) => /\b(pf|epf|esi|tds|gratuity|epfo|esic|wage|12%)\b/i.test(c.text)).length,
      );
    }
    const sourcedRatio = sourcedCount / required.length;
    score = 0.12 + sourcedRatio * 0.58;
    if (hasTier1) score += 0.22;
    else if ((bestTier ?? 5) <= 2) score += 0.12;
    else if ((bestTier ?? 5) <= 3) score += 0.05;
    if (f.isComplianceTopic && !hasTier1) score = Math.min(score, 0.42);
  }
  if (fabricatedRisk) score = Math.min(score, 0.2);
  return {
    claimCount: f.claims.length,
    evidenceRequired: required.length,
    sourcedRequired: sourced.length,
    bestTier,
    hasTier1,
    unsourcedRequired,
    fabricatedRisk,
    genericCitation,
    score: clamp(score, 0, 1),
  };
}

function keywordDensity(f: ArticleFeatures): number {
  if (!f.primaryKeyword || f.words === 0) return 0;
  return countKeyword(f.text, f.primaryKeyword) / f.words;
}

function relevantInternal(f: ArticleFeatures) {
  return f.links.filter((l) => {
    if (!l.internal) return false;
    if (!l.anchor || WEAK_ANCHORS.test(l.anchor)) return false;
    return true;
  });
}

function scoreSeo(f: ArticleFeatures, evidence: EvidenceProfile): DimensionReport {
  const empty = f.words < 40;
  const intentFit = (() => {
    if (empty) return 0.15;
    const introExplains =
      /\b(is|are|means|refers to|helps|enables|how to|step)\b/i.test(f.intro) && f.intro.length > 80;
    const promoHeavy = f.promoCount >= 3 || (f.intent === "informational" && f.promoCount >= 2 && f.coverageRatio < 0.4);
    let r = 0.2;
    if (introExplains) r += 0.3;
    if (f.coverageRatio >= 0.55) r += 0.25;
    else if (f.coverageRatio >= 0.35) r += 0.12;
    if (f.h2s.length >= 3) r += 0.15;
    if (promoHeavy && f.intent === "informational") r = Math.min(r, 0.35);
    if (f.intent === "commercial" && !/\b(compare|versus|vs|pros|cons|features)\b/i.test(f.text)) r = Math.min(r, 0.45);
    return clamp(r, 0, 1);
  })();

  const stuffing =
    keywordDensity(f) > (f.primaryKeyword.length <= 4 ? 0.045 : 0.032) &&
    countKeyword(f.text, f.primaryKeyword) >= 12;
  const kw = (() => {
    if (!f.primaryKeyword) return 0.1;
    if (stuffing) return 0.28;
    let r = 0.1;
    if (keywordIn(f.seoTitle || f.title, f.primaryKeyword)) r += 0.22;
    if (keywordIn(f.intro, f.primaryKeyword)) r += 0.18;
    const inHeading = f.h2s.some((h) => keywordIn(h, f.primaryKeyword)) || f.h3s.some((h) => keywordIn(h, f.primaryKeyword));
    if (inHeading) r += 0.18;
    const bodyHits = countKeyword(f.text, f.primaryKeyword);
    if (bodyHits >= 1 && bodyHits <= 10 && keywordDensity(f) <= 0.02) r += 0.22;
    else if (bodyHits > 0) r += 0.08;
    return clamp(r, 0, 1);
  })();

  const titleLen = f.title.length;
  const title = (() => {
    if (!f.title) return 0;
    let r = 0.25;
    if (titleLen >= 35 && titleLen <= 70) r += 0.25;
    else if (titleLen >= 20 && titleLen <= 90) r += 0.12;
    if (f.primaryKeyword && keywordIn(f.title, f.primaryKeyword)) r += 0.2;
    if (!CLICKBAIT.test(f.title)) r += 0.15;
    else r -= 0.25;
    if (!/\b(ultimate|everything you need|complete guide to success)\b/i.test(f.title) || f.primaryKeyword) r += 0.1;
    return clamp(r, 0, 1);
  })();

  const metaLen = f.metaDescription.length;
  const meta = (() => {
    if (!metaLen) return 0;
    let r = 0.25;
    if (metaLen >= 120 && metaLen <= 160) r += 0.4;
    else if (metaLen >= 80 && metaLen <= 180) r += 0.18;
    if (f.primaryKeyword && keywordIn(f.metaDescription, f.primaryKeyword)) r += 0.2;
    if (f.title && keywordIn(f.metaDescription, f.title.split(" ")[0] || "")) r += 0.1;
    return clamp(r, 0, 1);
  })();

  const headings = (() => {
    if (empty) return 0.1;
    const hasH1 = f.h1Count >= 1 || Boolean(f.title);
    let r = hasH1 ? 0.2 : 0;
    if (f.h2s.length >= 4) r += 0.35;
    else if (f.h2s.length >= 3) r += 0.25;
    else if (f.h2s.length >= 2) r += 0.12;
    if (f.h3s.length >= 2) r += 0.2;
    else if (f.h3s.length >= 1) r += 0.1;
    const distinct = new Set(f.h2s.map((h) => h.toLowerCase().slice(0, 24))).size;
    if (distinct >= 3) r += 0.15;
    return clamp(r, 0, 1);
  })();

  const internals = relevantInternal(f);
  const internal = (() => {
    if (empty) return 0;
    const n = internals.length;
    if (n === 0) return f.links.some((l) => l.internal) ? 0.18 : 0;
    if (n === 1) return 0.38;
    if (n === 2) return 0.62;
    if (n >= 3) return 0.92;
    return 0.5;
  })();

  const external = (() => {
    const outs = f.links.filter((l) => !l.internal);
    if (outs.length === 0) return 0;
    const useful = outs.filter((l) => l.tier <= 3);
    if (f.isComplianceTopic) {
      if (evidence.hasTier1 && useful.length >= 1) return 0.95;
      if (useful.length >= 1) return 0.45;
      return 0.2;
    }
    if (useful.length >= 2) return 0.9;
    if (useful.length === 1) return 0.65;
    return 0.28;
  })();

  const slug = (() => {
    if (!f.permalink) return 0;
    const clean = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(f.permalink.replace(/^\/+|\/+$/g, ""));
    let r = clean ? 0.55 : 0.25;
    if (f.primaryKeyword && keywordIn(f.permalink.replace(/-/g, " "), f.primaryKeyword)) r += 0.4;
    return clamp(r, 0, 1);
  })();

  const media = (() => {
    if (!f.featuredImage && f.imageCount === 0) return 0.15;
    if (f.imageCount === 0) return 0.55;
    if (f.imagesWithAlt === f.imageCount) return 1;
    return 0.35;
  })();

  const completeness = (() => {
    if (empty) return 0.05;
    let r = 0.15;
    r += f.coverageRatio * 0.45;
    if (f.paragraphs.some((p) => wordCountish(p) < 25) && f.h2s.length >= 2) r -= 0.05;
    const thinSections = f.h2s.length >= 3 && f.words / Math.max(f.h2s.length, 1) < 60;
    if (thinSections) r *= 0.55;
    if (f.words >= 800 && f.coverageRatio >= 0.65) r += 0.25;
    else if (f.words >= 400) r += 0.1;
    return clamp(r, 0, 1);
  })();

  return dimensionFromSubs(
    [
      sub("seo-intent", "Search intent alignment", "seo", 16, intentFit, intentReason(f, intentFit), "Rewrite the opening to satisfy the likely search intent before pitching a product.", [], intentFit < 0.6 ? ["Search intent is only partially satisfied."] : []),
      sub("seo-keyword", "Primary keyword targeting", "seo", 12, kw, stuffing ? "Keyword usage looks stuffed rather than natural." : "Keyword placement in title, intro, and headings was evaluated for natural use.", "Place the primary keyword naturally in the title, introduction, and headings without stuffing.", [], stuffing ? ["Keyword stuffing detected."] : []),
      sub("seo-title", "Title quality", "seo", 8, title, f.title ? `Title is ${titleLen} characters.` : "No title provided.", "Write a descriptive, intent-aligned title of about 35–70 characters."),
      sub("seo-meta", "Meta description", "seo", 8, meta, metaLen ? `Meta description is ${metaLen} characters.` : "Meta description is missing.", "Write a 120–160 character meta description that matches the article."),
      sub("seo-headings", "Heading architecture", "seo", 12, headings, `Found ${f.h2s.length} H2 and ${f.h3s.length} H3 headings.`, "Use a logical H2/H3 hierarchy that covers the topic."),
      sub("seo-internal", "Internal linking", "seo", 12, internal, `Found ${internals.length} contextual internal link(s).`, "Add 3–5 contextual internal links with descriptive anchors."),
      sub("seo-external", "External references", "seo", 8, external, `${f.links.filter((l) => !l.internal).length} external link(s); best tier ${evidence.bestTier ?? "none"}.`, "Cite relevant authoritative sources that support claims."),
      sub("seo-url", "URL / permalink", "seo", 4, slug, f.permalink ? `Permalink: ${f.permalink}` : "Permalink missing.", "Use a hyphenated slug that includes the primary keyword."),
      sub("seo-media", "Image / alt text", "seo", 4, media, f.imageCount ? `${f.imagesWithAlt}/${f.imageCount} images have alt text.` : "No inline images.", "Add a relevant image with descriptive alt text."),
      sub("seo-complete", "Technical completeness", "seo", 16, completeness, `Topic coverage ${Math.round(f.coverageRatio * 100)}% across ${f.requiredConcepts.length} expected concepts.`, "Cover missing subtopics and avoid thin sections."),
    ],
    "SEO reflects on-page targeting and content completeness, not checklist presence.",
  );
}

function wordCountish(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function intentReason(f: ArticleFeatures, fit: number): string {
  if (fit >= 0.8) return `The article appears to satisfy ${f.intent} intent.`;
  if (f.intent === "informational" && f.promoCount >= 2) {
    return "Informational intent is diluted by promotional language before the topic is fully explained.";
  }
  return `Search intent (${f.intent}) is only partly satisfied; important questions remain unanswered.`;
}

function scoreGeo(f: ArticleFeatures, evidence: EvidenceProfile): DimensionReport {
  if (f.words < 40) {
    return dimensionFromSubs(
      geoSubs(0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, f, evidence),
      "No article body to extract AI-search answers from.",
    );
  }

  const direct = (() => {
    const first = f.intro.split(/[.!?]/)[0] || "";
    const fillerOpen = /\b(in today's|game-changer|unlock the power|fast-paced|digital world)\b/i.test(first);
    const definition =
      !fillerOpen &&
      /\b(is|are) (a|an|the|software|process|set|system)\b/i.test(first) &&
      first.length > 50;
    const answersAfterHeadings = [...f.h2s, ...f.h3s].filter((h) => /\?/.test(h)).length;
    let r = definition ? 0.5 : fillerOpen ? 0.08 : 0.12;
    if (answersAfterHeadings >= 3) r += 0.32;
    else if (answersAfterHeadings >= 1) r += 0.18;
    else if (f.hasFaq) r += 0.1;
    if (f.intro.length > 120 && !fillerOpen) r += 0.18;
    return clamp(r, 0, 1);
  })();

  const extractable = (() => {
    const shortLead = f.paragraphs.filter((p) => wordCountish(p) <= 70).length;
    const defs = (f.text.match(/\b(is defined as|refers to|means that|in other words)\b/gi) || []).length;
    let r = 0.15;
    if (shortLead >= 3) r += 0.3;
    if (defs >= 1) r += 0.2;
    if (f.listCount >= 1) r += 0.15;
    if (f.avgParagraphWords > 140) r -= 0.2;
    return clamp(r, 0, 1);
  })();

  const entities = (() => {
    const n = f.entities.length;
    let r = n >= 8 ? 0.7 : n >= 5 ? 0.52 : n >= 3 ? 0.32 : n >= 1 ? 0.12 : 0.05;
    if (f.isComplianceTopic) {
      const legal = /\b(EPFO|ESIC|Income Tax|Ministry of Labour|Gratuity Act|Factories Act|WPS|MOHRE)\b/i.test(f.text);
      r = legal ? Math.max(r, 0.82) : Math.min(r, 0.4);
    }
    if (/\b(India|UAE|Saudi|GCC|Qatar)\b/i.test(f.text)) r += 0.12;
    return clamp(r, 0, 1);
  })();

  const specific = (() => {
    const nums = (
      f.text.match(
        /\b\d+(\.\d+)?%|\b(19|20)\d{2}\b|\bINR\s?\d|\bRs\.?\s?\d|\b\d{1,3}(,\d{3})+\b|\b\d+\s*[-–]\s*\d+\s*(days|hours|cycles)?|\b\d+[-–]person\b|\b\d+\s*(days|hours|employees|rupees|years|minutes)\b/gi,
      ) || []
    ).length;
    const process = /\b(step|first|then|next|finally|process)\b/i.test(f.text);
    let r = nums >= 5 ? 0.62 : nums >= 3 ? 0.45 : nums >= 1 ? 0.22 : 0.06;
    if (process) r += 0.18;
    if (/\bfor example\b/i.test(f.text) && nums >= 1) r += 0.15;
    if (f.fillerCount >= 3) r = Math.min(r, 0.32);
    return clamp(r, 0, 1);
  })();

  const structured = (() => {
    let r = 0;
    if (f.listCount >= 2) r += 0.32;
    else if (f.listCount === 1) r += 0.16;
    if (f.tableCount >= 1) r += 0.28;
    if (f.hasFaq) r += 0.18;
    if (f.h2s.length >= 3) r += 0.18;
    return clamp(r, 0, 1);
  })();

  const questions = (() => {
    const qHeadings = [...f.h2s, ...f.h3s].filter((h) => /\?/.test(h)).length;
    let r = f.coverageRatio * 0.55;
    if (qHeadings >= 3) r += 0.3;
    else if (qHeadings >= 1 || f.hasFaq) r += 0.15;
    return clamp(r, 0, 1);
  })();

  const sources = f.isComplianceTopic ? Math.min(evidence.score, evidence.hasTier1 ? 1 : 0.42) : evidence.score;

  return dimensionFromSubs(
    geoSubs(direct, extractable, entities, specific, structured, questions, sources, f, evidence),
    "GEO reflects whether an AI system can extract citable answers.",
  );
}

function geoSubs(
  direct: number,
  extractable: number,
  entities: number,
  specific: number,
  structured: number,
  questions: number,
  sources: number,
  f: ArticleFeatures,
  evidence: EvidenceProfile,
): SubScore[] {
  return [
    sub("geo-direct", "Direct answers", "geo", 20, direct, direct >= 0.75 ? "Key questions have direct opening answers." : "Important questions lack a clear, direct answer.", "Open with a direct answer and answer each H2 in the first sentence."),
    sub("geo-extract", "Answer extractability", "geo", 15, extractable, "Facts should be stated in concise, quotable sentences.", "Put key facts in short sentences, lists, or definition lines."),
    sub("geo-entities", "Entity clarity", "geo", 15, entities, `${f.entities.length} named entities detected.`, "Name organizations, laws, processes, and locations explicitly."),
    sub("geo-specific", "Factual specificity", "geo", 15, specific, "Specific numbers, dates, and processes were counted — not vague claims.", "Replace vague claims with numbers, thresholds, and concrete steps."),
    sub("geo-structure", "Structured information", "geo", 10, structured, `Lists: ${f.listCount}, tables: ${f.tableCount}, FAQ: ${f.hasFaq ? "yes" : "no"}.`, "Add lists, steps, or tables where they help extraction."),
    sub("geo-questions", "Search question coverage", "geo", 15, questions, `Coverage of expected concepts: ${Math.round(f.coverageRatio * 100)}%.`, "Answer related questions users would ask after the primary query."),
    sub("geo-sources", "Source transparency", "geo", 10, sources, evidence.fabricatedRisk ? "Citation language appears without a real source." : `Evidence score ${(evidence.score * 100).toFixed(0)}%.`, "Cite authoritative sources next to important claims."),
  ];
}

function scoreLlm(f: ArticleFeatures, evidence: EvidenceProfile): DimensionReport {
  if (f.words < 40) {
    return dimensionFromSubs(
      llmSubs(0, 0, 0, 0, 0.05, 0, 0.1, f),
      "Empty body cannot be used as an LLM source.",
    );
  }

  const factual = (() => {
    const declarative = (f.text.match(/\b(is|are|includes|requires|must|should)\b/gi) || []).length;
    const vague = (f.text.match(/\b(things|stuff|various|etc\.|many aspects|a number of)\b/gi) || []).length;
    let r = declarative >= 12 ? 0.55 : declarative >= 6 ? 0.34 : 0.1;
    if (f.claims.length >= 2) r += 0.22;
    if (f.tableCount >= 1) r += 0.1;
    r -= Math.min(0.25, vague * 0.04);
    if (f.fillerCount >= 3) r = Math.min(r, 0.35);
    return clamp(r, 0, 1);
  })();

  const selfContained = (() => {
    let r = f.words >= 550 ? 0.38 : f.words >= 320 ? 0.26 : 0.1;
    r += f.coverageRatio * 0.42;
    if (/\b(is defined as|refers to|means|is software|is the)\b/i.test(f.text)) r += 0.18;
    return clamp(r, 0, 1);
  })();

  const orig = (() => {
    const examples = /\b(for example|for instance|e\.g\.|such as)\b/i.test(f.text);
    const worked = /\b(\d+%|INR|Rs\.|step \d|if an employee)\b/i.test(f.text);
    const firstHand = /\b(we (found|learned|observed|implemented)|in practice|a typical case)\b/i.test(f.text);
    let r = 0.18;
    if (examples) r += 0.28;
    if (worked) r += 0.32;
    if (firstHand) r += 0.2;
    if (f.tableCount >= 1) r += 0.1;
    if (f.fillerCount >= 3 || f.uniqueSentenceRatio < 0.72) r = Math.min(r, 0.28);
    return clamp(r, 0, 1);
  })();

  const relations = (() => {
    let r = f.entities.length >= 6 ? 0.45 : f.entities.length >= 3 ? 0.28 : 0.1;
    if (/\b(unlike|compared with|leads to|results in|required by|administered by)\b/i.test(f.text)) r += 0.3;
    return clamp(r, 0, 1);
  })();

  const citable = (() => {
    const shortFacts = f.sentences.filter((s) => s.length > 40 && s.length < 180 && /\d|must |is |are /.test(s)).length;
    let r = shortFacts >= 6 ? 0.7 : shortFacts >= 3 ? 0.42 : 0.15;
    if (f.hasFaq && f.faqHeadings.length >= 2) r += 0.15;
    return clamp(r, 0, 1);
  })();

  const fluff = (() => {
    let r = 1;
    r -= Math.min(0.45, f.fillerCount * 0.12);
    r -= Math.min(0.2, f.marketingCount * 0.08);
    if (f.uniqueSentenceRatio < 0.7) r -= 0.25;
    return clamp(r, 0, 1);
  })();

  const ev = f.isComplianceTopic ? Math.min(evidence.score, evidence.hasTier1 ? 1 : 0.4) : evidence.score;

  return dimensionFromSubs(
    llmSubs(factual, selfContained, ev, orig, relations, citable, fluff, f),
    "LLM score is citability — whether a model could confidently use this as a source.",
  );
}

function llmSubs(
  factual: number,
  selfContained: number,
  evidence: number,
  orig: number,
  relations: number,
  citable: number,
  fluff: number,
  f: ArticleFeatures,
): SubScore[] {
  return [
    sub("llm-factual", "Clear factual statements", "llm", 20, factual, "Declarative, checkable statements were measured against vague phrasing.", "State facts in plain sentences that can be quoted."),
    sub("llm-contained", "Self-contained explanations", "llm", 15, selfContained, `Body length ${f.words} words with ${Math.round(f.coverageRatio * 100)}% concept coverage.`, "Define terms so the article stands alone."),
    sub("llm-evidence", "Evidence and sources", "llm", 20, evidence, "Citability requires sources next to important claims, not merely a URL somewhere in the page.", "Support important claims with identifiable sources."),
    sub("llm-original", "Original / useful information", "llm", 15, orig, "Worked examples and practice notes raise citability; generic summaries do not.", "Add original examples, calculations, or process detail."),
    sub("llm-entities", "Entities and relationships", "llm", 10, relations, "Named entities and explicit relationships help models ground answers.", "Spell out who administers what, and how concepts relate."),
    sub("llm-citable", "Citation-worthy passages", "llm", 10, citable, "Short, specific passages are more citation-worthy than long vague paragraphs.", "Write concise answer passages under key headings."),
    sub("llm-fluff", "Low ambiguity / low fluff", "llm", 10, fluff, f.fillerCount ? `${f.fillerCount} generic filler phrase(s) detected.` : "Fluff signals are limited.", "Remove generic AI filler and vague references."),
  ];
}

function scoreQuality(f: ArticleFeatures, evidence: EvidenceProfile): DimensionReport {
  if (f.words < 40) {
    return dimensionFromSubs(
      qualitySubs(0, 0, 0, 0, 0, 0, 0.1, f),
      "No article body to evaluate.",
    );
  }

  const intent = (() => {
    let r = f.coverageRatio * 0.5;
    if (/\b(how to|step|should|recommend)\b/i.test(f.text)) r += 0.2;
    if (f.intent === "informational" && f.promoCount >= 3) r = Math.min(r, 0.35);
    if (f.h2s.length >= 3) r += 0.15;
    return clamp(r, 0, 1);
  })();

  const depth = (() => {
    const examples = /\b(for example|for instance|e\.g\.)\b/i.test(f.text);
    const edge = /\b(except|however|if the employee|part-time|contractor|exception|edge case)\b/i.test(f.text);
    const steps = f.listCount >= 1 || /\bstep \d\b/i.test(f.text);
    const compare = /\b(compared|versus|vs\.|unlike|difference)\b/i.test(f.text);
    let r = f.coverageRatio * 0.4;
    if (examples) r += 0.15;
    if (edge) r += 0.15;
    if (steps) r += 0.12;
    if (compare) r += 0.1;
    if (f.words > 1600 && f.coverageRatio < 0.45) r = Math.min(r, 0.4);
    return clamp(r, 0, 1);
  })();

  const accuracy = (() => {
    let r = 0.58;
    if (evidence.fabricatedRisk) r = 0.15;
    if (f.isComplianceTopic && !evidence.hasTier1) r = Math.min(r, 0.38);
    else if (evidence.hasTier1) r += 0.22;
    else if ((evidence.bestTier ?? 5) <= 3) r += 0.12;
    if (evidence.unsourcedRequired >= 3) r -= 0.2;
    if (evidence.sourcedRequired >= 2 && evidence.hasTier1) r = Math.max(r, 0.88);
    return clamp(r, 0, 1);
  })();

  const originality = (() => {
    let r = 0.22;
    if (/\b(for example|in practice|a typical|worked example)\b/i.test(f.text)) r += 0.32;
    if (/\d+%|\bINR\b|\bRs\b/.test(f.text)) r += 0.22;
    if (f.tableCount >= 1) r += 0.08;
    r -= Math.min(0.4, f.fillerCount * 0.1);
    if (f.uniqueSentenceRatio < 0.72) r -= 0.2;
    return clamp(r, 0, 1);
  })();

  const useful = (() => {
    const practical = /\b(how to|checklist|template|calculate|example|step)\b/i.test(f.text);
    return practical && /\d/.test(f.text) ? 0.85 : practical ? 0.5 : 0.2;
  })();

  const ev = f.isComplianceTopic && !evidence.hasTier1 ? Math.min(evidence.score, 0.4) : evidence.score;

  const fluff = clamp(1 - f.fillerCount * 0.14 - (1 - f.uniqueSentenceRatio) * 0.5 - f.marketingCount * 0.06, 0, 1);

  return dimensionFromSubs(
    qualitySubs(intent, depth, accuracy, originality, useful, ev, fluff, f),
    "Quality is depth, usefulness, and evidence — not word count or FAQ presence.",
  );
}

function qualitySubs(
  intent: number,
  depth: number,
  accuracy: number,
  originality: number,
  useful: number,
  evidence: number,
  fluff: number,
  f: ArticleFeatures,
): SubScore[] {
  return [
    sub("quality-intent", "Search intent satisfaction", "quality", 20, intent, "Whether the article actually answers the implied query.", "Cover the questions a reader with this query would have."),
    sub("quality-depth", "Depth and completeness", "quality", 20, depth, `Concept coverage ${Math.round(f.coverageRatio * 100)}% — depth is topic completeness, not length (${f.words} words).`, "Add examples, edge cases, and process steps for uncovered subtopics."),
    sub("quality-accuracy", "Accuracy and reliability", "quality", 20, accuracy, f.isComplianceTopic ? "Compliance topics require authoritative legal/regulatory sources." : "Factual reliability depends on sourced claims.", "Verify legal/numeric claims against primary sources."),
    sub("quality-original", "Originality / added value", "quality", 15, originality, "Generic summaries score low; worked examples score higher.", "Add original calculations, scenarios, or practical notes."),
    sub("quality-examples", "Examples and practical usefulness", "quality", 10, useful, "Practical usefulness requires actionable steps or worked examples.", "Include a concrete example a practitioner could follow."),
    sub("quality-evidence", "Evidence / source quality", "quality", 10, evidence, "Source quality is scored by authority and claim support, not link count.", "Use primary or recognized sources next to key claims."),
    sub("quality-fluff", "Avoidance of repetition/fluff", "quality", 5, fluff, f.fillerCount ? `${f.fillerCount} filler phrase(s); uniqueness ${(f.uniqueSentenceRatio * 100).toFixed(0)}%.` : "Repetition and filler are limited.", "Cut generic introductions and repeated conclusions."),
  ];
}

function scoreReadability(f: ArticleFeatures): DimensionReport {
  if (f.words < 40) {
    return dimensionFromSubs(
      [
        sub("read-sentence", "Sentence clarity", "readability", 20, 0, "No body text.", "Write the article body."),
        sub("read-paragraphs", "Paragraph length", "readability", 13, 0, "No paragraphs to evaluate.", "Use short paragraphs."),
        sub("read-scan", "Heading / scannability", "readability", 13, 0, "No headings in a body.", "Add scannable headings."),
        sub("read-vocab", "Vocabulary accessibility", "readability", 13, 0, "No vocabulary to evaluate.", "Write the article."),
        sub("read-voice", "Direct writing", "readability", 13, 0, "No body text.", "Write in direct, active language."),
        sub("read-flow", "Logical flow", "readability", 13, 0, "No body text.", "Structure a beginning, middle, and end."),
        sub("read-format", "Formatting", "readability", 15, 0, "No formatting to evaluate.", "Use lists or tables where useful."),
      ],
      "Readability is 0 without article content.",
    );
  }

  const sentence = f.avgSentenceLength >= 12 && f.avgSentenceLength <= 22 ? 0.9 : f.avgSentenceLength <= 28 ? 0.6 : 0.35;
  const para = f.avgParagraphWords <= 70 && f.paragraphs.length >= 4 ? 0.9 : f.avgParagraphWords <= 110 ? 0.6 : 0.3;
  const scan = f.h2s.length >= 3 && (f.listCount >= 1 || f.paragraphs.length >= 5) ? 0.9 : f.h2s.length >= 2 ? 0.55 : 0.25;
  const vocab = f.avgWordLength <= 5.4 ? 0.9 : f.avgWordLength <= 6.2 ? 0.6 : 0.35;
  const passiveHits = (f.text.match(/\b(is|are|was|were|be|been)\s+\w+ed\b/gi) || []).length;
  const voice = passiveHits / Math.max(f.sentences.length, 1) < 0.25 ? 0.85 : 0.5;
  const flow = f.h2s.length >= 3 && f.uniqueSentenceRatio >= 0.75 ? 0.85 : f.h2s.length >= 2 ? 0.55 : 0.3;
  const format = f.listCount + f.tableCount >= 2 ? 0.9 : f.listCount + f.tableCount >= 1 ? 0.6 : 0.25;

  return dimensionFromSubs(
    [
      sub("read-sentence", "Sentence clarity", "readability", 20, sentence, `Average sentence length ${f.avgSentenceLength.toFixed(1)} words.`, "Keep most sentences around 12–22 words."),
      sub("read-paragraphs", "Paragraph length", "readability", 13, para, `Average paragraph ${f.avgParagraphWords.toFixed(0)} words.`, "Break long paragraphs into shorter blocks."),
      sub("read-scan", "Heading / scannability", "readability", 13, scan, `${f.h2s.length} H2 headings and ${f.listCount} lists.`, "Use descriptive headings and scannable lists."),
      sub("read-vocab", "Vocabulary accessibility", "readability", 13, vocab, `Average word length ${f.avgWordLength.toFixed(2)}.`, "Prefer plain language where precision allows."),
      sub("read-voice", "Direct writing", "readability", 13, voice, "Passive constructions were estimated from auxiliary + -ed patterns.", "Prefer direct, active phrasing."),
      sub("read-flow", "Logical flow", "readability", 13, flow, "Flow is inferred from heading progression and sentence variety.", "Order sections from definition → process → examples → caveats."),
      sub("read-format", "Tables / lists / formatting", "readability", 15, format, `Lists ${f.listCount}, tables ${f.tableCount}.`, "Add lists or tables where they make the process easier to follow."),
    ],
    "Readability combines clarity, scanability, and structure — not sentence length alone.",
  );
}

function collectIssues(
  f: ArticleFeatures,
  evidence: EvidenceProfile,
  dims: { seo: DimensionReport; geo: DimensionReport; llm: DimensionReport; quality: DimensionReport; readability: DimensionReport },
): CanonicalIssue[] {
  const issues: CanonicalIssue[] = [];
  const seen = new Set<string>();
  const add = (issue: CanonicalIssue) => {
    if (seen.has(issue.id)) return;
    seen.add(issue.id);
    issues.push(issue);
  };

  if (evidence.fabricatedRisk) {
    add({
      id: "SOURCE_FABRICATED_001",
      severity: "critical",
      dimension: "quality",
      title: "Possible fabricated or unsourced research claims",
      impact: -10,
      recommendation: "Remove unsourced ‘studies show’ claims or cite a real primary source.",
      evidence: "Citation language without an identifiable source URL, or placeholder domains.",
    });
  }

  if (f.isComplianceTopic && evidence.unsourcedRequired >= 2 && !evidence.hasTier1) {
    add({
      id: "SOURCE_QUALITY_001",
      severity: "high",
      dimension: "geo",
      title: "Important compliance claims lack authoritative sources",
      impact: -5,
      recommendation: "Cite EPFO, ESIC, Income Tax Department, Ministry of Labour, or the relevant GCC authority next to numeric/legal claims.",
      evidence: `${evidence.unsourcedRequired} evidence-requiring claims without nearby citations; no Tier-1 government/regulator link.`,
    });
  } else if (evidence.unsourcedRequired >= 3) {
    add({
      id: "SOURCE_QUALITY_001",
      severity: "high",
      dimension: "llm",
      title: "Important claims lack evidence",
      impact: -5,
      recommendation: "Add citations that actually support the numeric or legal claims.",
      evidence: `${evidence.unsourcedRequired} claims appear to need evidence but have none nearby.`,
    });
  }

  if (f.words >= 40 && f.intent === "informational" && f.promoCount >= 3 && f.coverageRatio < 0.45) {
    add({
      id: "INTENT_MISMATCH_001",
      severity: "high",
      dimension: "seo",
      title: "Search intent mismatch",
      impact: -5,
      recommendation: "Explain the topic fully before product promotion.",
      evidence: "Promotional CTAs dominate an informational query with weak topical coverage.",
    });
  }

  if (f.words > 0 && f.words < 220) {
    add({
      id: "THIN_CONTENT_001",
      severity: "high",
      dimension: "quality",
      title: "Article is extremely thin",
      impact: -5,
      recommendation: "Develop the topic with complete sections, examples, and answers.",
      evidence: `Body is ${f.words} words.`,
    });
  }

  if (f.fillerCount >= 3 && f.uniqueSentenceRatio < 0.78) {
    add({
      id: "GENERIC_AI_001",
      severity: "high",
      dimension: "quality",
      title: "Mostly generic AI filler",
      impact: -4,
      recommendation: "Rewrite with specific HR/payroll facts, examples, and original guidance.",
      evidence: `${f.fillerCount} filler phrases and low sentence uniqueness.`,
    });
  }

  if (keywordDensity(f) > 0.03 && countKeyword(f.text, f.primaryKeyword) >= 8) {
    add({
      id: "KEYWORD_STUFFING_001",
      severity: "medium",
      dimension: "seo",
      title: "Keyword stuffing",
      impact: -3,
      recommendation: "Reduce forced repetition; prefer natural topical language.",
      evidence: `Primary keyword density ≈ ${(keywordDensity(f) * 100).toFixed(1)}%.`,
    });
  }

  if (relevantInternal(f).length === 0 && f.words >= 40) {
    add({
      id: "INTERNAL_LINKS_001",
      severity: "medium",
      dimension: "seo",
      title: "Weak or missing internal linking",
      impact: -3,
      recommendation: "Add 3–5 contextual links to related Officekit pages or topic-cluster posts.",
      evidence: "No contextual internal links with descriptive anchor text.",
    });
  }

  // Surface the weakest dimension gaps as issues without extra overall penalties
  // (those gaps already reduced the dimension score).
  for (const dim of [dims.seo, dims.geo, dims.llm, dims.quality, dims.readability]) {
    const weakest = [...dim.subs].sort((a, b) => a.points / a.max - b.points / b.max)[0];
    if (!weakest) continue;
    const ratio = weakest.max ? weakest.points / weakest.max : 1;
    if (ratio >= 0.7) continue;
    add({
      id: weakest.id,
      severity: ratio < 0.3 ? "high" : ratio < 0.5 ? "medium" : "low",
      dimension: weakest.dimension,
      title: weakest.label,
      impact: 0,
      recommendation: weakest.suggestion,
      evidence: weakest.reason,
    });
  }

  return issues;
}

function publishingBand(score: number, f: ArticleFeatures, evidence: EvidenceProfile, issues: CanonicalIssue[]): {
  band: PublishingBand;
  label: string;
} {
  const complianceBlock =
    f.isComplianceTopic && !evidence.hasTier1 && f.words >= 40 && (evidence.unsourcedRequired > 0 || evidence.evidenceRequired > 0);
  let band: PublishingBand;
  if (score < 60) band = "do_not_publish";
  else if (score < 70) band = "major_revision";
  else if (score < 80) band = "revise_before_publishing";
  else if (score < 90) band = "publish_ready_minor";
  else band = "high_quality";

  if (complianceBlock && (band === "publish_ready_minor" || band === "high_quality" || band === "revise_before_publishing")) {
    band = score >= 70 ? "major_revision" : band;
  }
  if (issues.some((i) => i.severity === "critical")) band = "do_not_publish";

  const labels: Record<PublishingBand, string> = {
    do_not_publish: "DO NOT PUBLISH",
    major_revision: "MAJOR REVISION",
    revise_before_publishing: "REVISE BEFORE PUBLISHING",
    publish_ready_minor: "PUBLISH-READY WITH MINOR IMPROVEMENTS",
    high_quality: "HIGH-QUALITY / STRONG PUBLISH CANDIDATE",
  };
  return { band, label: labels[band] };
}

export function scoreArticle(f: ArticleFeatures): EngineResult {
  const emptyBody = f.words < 40;
  const evidence = buildEvidence(f);
  let seo = scoreSeo(f, evidence);
  let geo = scoreGeo(f, evidence);
  let llm = scoreLlm(f, evidence);
  let quality = scoreQuality(f, evidence);
  const readability = scoreReadability(f);

  const capsApplied: string[] = [];

  if (emptyBody) {
    geo = { ...geo, score: 0, reason: "No article body — GEO cannot be scored." };
    llm = { ...llm, score: 0, reason: "No article body — LLM citability cannot be scored." };
    quality = { ...quality, score: 0, reason: "No article body — content quality is 0." };
    if (seo.score > 80) {
      seo = { ...seo, score: 80 };
      capsApplied.push("Empty body: SEO capped at 80 (metadata only).");
    }
  }

  if (evidence.fabricatedRisk) {
    // overall cap applied later
  }
  if (f.words > 0 && f.words < 220) {
    if (quality.score > 59) {
      quality = { ...quality, score: 59 };
      capsApplied.push("Extremely thin article: Quality capped at 59.");
    }
  }
  if (f.fillerCount >= 3 && f.uniqueSentenceRatio < 0.78 && quality.score > 69) {
    quality = { ...quality, score: 69 };
    capsApplied.push("Generic AI filler: Quality capped at 69.");
  }
  if (f.intent === "informational" && f.promoCount >= 3 && f.coverageRatio < 0.4 && seo.score > 59) {
    seo = { ...seo, score: 59 };
    capsApplied.push("Search intent substantially mismatched: SEO capped at 59.");
  }
  const needsEvidence = f.isComplianceTopic || evidence.evidenceRequired >= 2;
  if (needsEvidence && evidence.unsourcedRequired >= 2 && !evidence.hasTier1) {
    if (geo.score > 69) {
      geo = { ...geo, score: 69 };
      capsApplied.push("Unsupported important claims: GEO capped at 69.");
    }
    if (llm.score > 69) {
      llm = { ...llm, score: 69 };
      capsApplied.push("Unsupported important claims: LLM capped at 69.");
    }
  }

  const issues = emptyBody
    ? [
        {
          id: "EMPTY_BODY_001",
          severity: "critical" as const,
          dimension: "quality" as const,
          title: "Article body is missing or too short to analyze",
          impact: -20,
          recommendation: "Add substantial blog content before scoring quality, GEO, LLM, or readability.",
          evidence: `Body word count: ${f.words}.`,
        },
      ]
    : collectIssues(f, evidence, { seo, geo, llm, quality, readability });

  const overallRaw =
    seo.score * OVERALL_WEIGHTS.seo +
    geo.score * OVERALL_WEIGHTS.geo +
    llm.score * OVERALL_WEIGHTS.llm +
    quality.score * OVERALL_WEIGHTS.quality +
    readability.score * OVERALL_WEIGHTS.readability;

  const uniquePenalty = issues.reduce((sum, i) => sum + Math.abs(i.impact), 0);
  // Penalties apply once per canonical ID. Dimension scores already absorbed most of the gap.
  const penalty = Math.min(uniquePenalty, 12);
  let overall = clamp(overallRaw - penalty, 0, 100);

  if (evidence.fabricatedRisk && overall > 69) {
    overall = 69;
    capsApplied.push("Fabricated/unsourced research claims: overall capped at 69.");
  }
  if (emptyBody && overall > 20) {
    overall = Math.min(overall, 20);
    capsApplied.push("Empty/thin body: overall capped at 20.");
  }

  const hasCritical = issues.some((i) => i.severity === "critical");
  const hasHigh = issues.some((i) => i.severity === "high");
  const eligible90 =
    seo.score >= 85 &&
    geo.score >= 85 &&
    llm.score >= 85 &&
    quality.score >= 85 &&
    readability.score >= 80 &&
    !hasCritical &&
    !hasHigh &&
    f.coverageRatio >= 0.7 &&
    evidence.score >= 0.7 &&
    f.fillerCount === 0;

  if (overall >= 90 && !eligible90) {
    overall = Math.min(overall, 89);
    capsApplied.push("90+ requires strong scores on every dimension, no critical/high issues, evidence, and original usefulness.");
  }

  const categoryRelevance = clamp(f.coverageRatio * 100, 0, 100);
  const confidence = clamp(
    0.35 +
      Math.min(0.3, f.words / 2000) +
      (f.keywords.length ? 0.1 : 0) +
      (f.claims.length ? 0.1 : 0) +
      (f.links.length ? 0.1 : 0),
    0.2,
    0.95,
  );

  return {
    seo,
    geo,
    llm,
    quality,
    readability,
    overallRaw,
    overallScore: Math.round(overall),
    penaltiesApplied: penalty,
    capsApplied,
    issues,
    evidence,
    intent: f.intent,
    categoryRelevance,
    confidence,
    publishing: publishingBand(Math.round(overall), f, evidence, issues),
    emptyBody,
  };
}

export { OVERALL_WEIGHTS };
