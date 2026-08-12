import {
  classifySourceDomain,
  extractHost,
  isComplianceTopic,
  isInternalHref,
  requiredConcepts,
  type SourceTier,
} from "./taxonomy";

export type SearchIntentType = "informational" | "commercial" | "transactional" | "navigational" | "unknown";

export type ExtractedLink = {
  href: string;
  anchor: string;
  internal: boolean;
  domain: string;
  tier: SourceTier;
};

export type ExtractedClaim = {
  text: string;
  requiresEvidence: boolean;
  hasCitationNearby: boolean;
  nearbyTier: SourceTier | null;
};

export type ArticleFeatures = {
  title: string;
  seoTitle: string;
  metaDescription: string;
  permalink: string;
  author: string;
  categoryName: string;
  subcategory: string;
  keywords: string[];
  primaryKeyword: string;
  html: string;
  text: string;
  words: number;
  sentences: string[];
  paragraphs: string[];
  avgSentenceLength: number;
  avgWordLength: number;
  avgParagraphWords: number;
  h1Count: number;
  h2s: string[];
  h3s: string[];
  listCount: number;
  tableCount: number;
  imageCount: number;
  imagesWithAlt: number;
  links: ExtractedLink[];
  intro: string;
  fillerCount: number;
  marketingCount: number;
  promoCount: number;
  uniqueSentenceRatio: number;
  hasFaq: boolean;
  faqHeadings: string[];
  claims: ExtractedClaim[];
  entities: string[];
  isComplianceTopic: boolean;
  requiredConcepts: string[];
  coveredConcepts: string[];
  coverageRatio: number;
  intent: SearchIntentType;
  featuredImage: boolean;
};

const FILLER =
  /\b(in today's (fast-paced|digital|competitive) world|it goes without saying|needless to say|at the end of the day|game[- ]changer|unlock the (full )?power|leverage synergies|cutting[- ]edge solution|revolutionize (your|the)|seamless(ly)? integrate|ever[- ]evolving landscape|holistic approach|robust (and )?scalable|empower your (team|workforce)|navigate the complexities)\b/gi;

const MARKETING =
  /\b(best[- ]in[- ]class|number one|#1|unmatched|unbeatable|guaranteed results|world[- ]class|industry[- ]leading|ultimate (guide|solution)|secret (to|weapon))\b/gi;

const PROMOTIONAL =
  /\b(why (choose|officekit)|book a (demo|call)|start (your )?free trial|sign up (now|today)|buy now|get started (today|now)|contact (us|sales)|request a demo)\b/gi;

const ENTITY_PATTERN =
  /\b([A-Z]{2,}[A-Za-z0-9]*|[A-Z][A-Za-z0-9.&'-]*(?:\s+[A-Z][A-Za-z0-9.&'-]*){0,4})\b/g;

const CLAIM_PATTERN =
  /([^.!?\n]{0,80}(?:\d+(?:\.\d+)?%|must (?:contribute|pay|file|comply|deduct)|shall (?:be|pay)|wage ceiling|threshold of|section \d+|INR\s?\d|Rs\.?\s?\d)[^.!?\n]{0,80})/gi;

export function plainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function matchAll(html: string, pattern: RegExp): RegExpMatchArray[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return Array.from(html.matchAll(new RegExp(pattern.source, flags)));
}

function headingTexts(html: string, tag: string): string[] {
  return matchAll(html, new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi")).map((m) =>
    plainText(m[1] || "").trim(),
  );
}

function paragraphTexts(html: string): string[] {
  const fromTags = matchAll(html, /<p\b[^>]*>([\s\S]*?)<\/p>/gi)
    .map((m) => plainText(m[1] || "").trim())
    .filter((p) => p.length > 20);
  if (fromTags.length) return fromTags;
  return plainText(html)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
}

function extractLinks(html: string): ExtractedLink[] {
  return matchAll(html, /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi).map((m) => {
    const href = (m[1] || "").trim();
    const internal = isInternalHref(href);
    return {
      href,
      anchor: plainText(m[2] || "").trim(),
      internal,
      domain: extractHost(href),
      tier: internal ? (5 as SourceTier) : classifySourceDomain(href),
    };
  });
}

function citationNearby(html: string, claim: string): { nearby: boolean; tier: SourceTier | null } {
  const idx = html.toLowerCase().indexOf(claim.slice(0, 40).toLowerCase());
  const window = idx >= 0 ? html.slice(Math.max(0, idx - 80), idx + claim.length + 280) : html;
  const links = extractLinks(window).filter((l) => !l.internal);
  if (links.length) {
    const best = Math.min(...links.map((l) => l.tier)) as SourceTier;
    return { nearby: true, tier: best };
  }
  if (/\b(according to|source:|see:|cited|epfo|esic|income tax department)\b/i.test(window)) {
    return { nearby: true, tier: null };
  }
  return { nearby: false, tier: null };
}

function extractClaims(html: string, text: string): ExtractedClaim[] {
  const raw = text.match(CLAIM_PATTERN) || [];
  const unique = [...new Set(raw.map((c) => c.replace(/\s+/g, " ").trim()))].slice(0, 20);
  return unique.map((claim) => {
    const requiresEvidence = /\d|must |shall |threshold|ceiling|section /i.test(claim);
    const cite = citationNearby(html, claim);
    return {
      text: claim,
      requiresEvidence,
      hasCitationNearby: cite.nearby,
      nearbyTier: cite.tier,
    };
  });
}

function detectIntent(title: string, keywords: string[], text: string): SearchIntentType {
  const signal = `${title} ${keywords.join(" ")} ${text.slice(0, 280)}`.toLowerCase();
  if (/\b(buy|pricing|price|sign up|demo|trial|purchase|cost of)\b/.test(signal)) return "transactional";
  if (/\b(best|vs|versus|compare|comparison|alternative|top \d+)\b/.test(signal)) return "commercial";
  if (/\b(login|sign in|dashboard|portal|download)\b/.test(signal)) return "navigational";
  if (/\b(what is|how to|guide|explain|meaning|definition|why|when to|step-by-step)\b/.test(signal)) {
    return "informational";
  }
  if (keywords.some((k) => /^(what|how|why|when)\b/i.test(k)) || /\?/.test(title)) return "informational";
  return "informational";
}

function conceptCovered(text: string, concept: string): boolean {
  const hay = text.toLowerCase();
  if (concept.includes(" ")) return hay.includes(concept.toLowerCase());
  const escaped = concept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text) || hay.includes(concept.toLowerCase());
}

export type AnalysisInputLike = {
  title: string;
  keywords: string[];
  metaDescription: string;
  contentHtml: string;
  permalink?: string;
  author?: string;
  featuredImageUrl?: string;
  seoTitle?: string;
  categoryName?: string;
  subcategory?: string;
};

export function extractArticle(input: AnalysisInputLike): ArticleFeatures {
  const html = input.contentHtml || "";
  const text = plainText(html);
  const wordsArr = text.split(/\s+/).filter(Boolean);
  const words = wordsArr.length;
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 8);
  const paragraphs = paragraphTexts(html);
  const avgSentenceLength = sentences.length ? words / sentences.length : words;
  const avgWordLength = words
    ? wordsArr.reduce((sum, w) => sum + w.replace(/[^a-z0-9]/gi, "").length, 0) / words
    : 0;
  const paraWords = paragraphs.map((p) => wordCount(p));
  const avgParagraphWords = paraWords.length ? paraWords.reduce((a, b) => a + b, 0) / paraWords.length : words;
  const uniqueRatio =
    sentences.length >= 4
      ? new Set(sentences.map((s) => s.toLowerCase().slice(0, 70))).size / sentences.length
      : 1;
  const h2s = headingTexts(html, "h2");
  const h3s = headingTexts(html, "h3");
  const faqHeadings = [...h2s, ...h3s].filter((h) => /\?/.test(h) || /\bfaq\b/i.test(h));
  const hasFaq = faqHeadings.length > 0 || /\b(frequently asked|common questions)\b/i.test(text);
  const images = matchAll(html, /<img\b[^>]*>/gi);
  const keywords = (input.keywords || []).map((k) => k.trim()).filter(Boolean);
  const required = requiredConcepts({
    categoryName: input.categoryName,
    subcategory: input.subcategory,
    title: input.title,
    keywords,
  });
  const covered = required.filter((c) => conceptCovered(text, c));
  const intro = [paragraphs[0], paragraphs[1]].filter(Boolean).join(" ").slice(0, 500) || text.slice(0, 420);
  const entities = [...new Set((text.match(ENTITY_PATTERN) || []).map((e) => e.trim()))].filter(
    (e) => e.length > 2 && !/^(The|This|That|With|From|Your)$/.test(e),
  );

  return {
    title: input.title.trim(),
    seoTitle: (input.seoTitle ?? input.title).trim(),
    metaDescription: input.metaDescription.trim(),
    permalink: (input.permalink || "").trim(),
    author: (input.author || "").trim(),
    categoryName: (input.categoryName || "").trim(),
    subcategory: (input.subcategory || "").trim(),
    keywords,
    primaryKeyword: keywords[0] || "",
    html,
    text,
    words,
    sentences,
    paragraphs,
    avgSentenceLength,
    avgWordLength,
    avgParagraphWords,
    h1Count: matchAll(html, /<h1\b[^>]*>/gi).length,
    h2s,
    h3s,
    listCount: matchAll(html, /<[uo]l\b/gi).length,
    tableCount: matchAll(html, /<table\b/gi).length,
    imageCount: images.length,
    imagesWithAlt: images.filter((m) => /\balt=["'][^"']+["']/i.test(m[0])).length,
    links: extractLinks(html),
    intro,
    fillerCount: (text.match(FILLER) || []).length,
    marketingCount: (text.match(MARKETING) || []).length,
    promoCount: (text.match(PROMOTIONAL) || []).length,
    uniqueSentenceRatio: uniqueRatio,
    hasFaq,
    faqHeadings,
    claims: extractClaims(html, text),
    entities: entities.slice(0, 40),
    isComplianceTopic: isComplianceTopic({
      categoryName: input.categoryName,
      subcategory: input.subcategory,
      title: input.title,
      keywords,
      text,
    }),
    requiredConcepts: required,
    coveredConcepts: covered,
    coverageRatio: required.length ? covered.length / required.length : 0,
    intent: detectIntent(input.title, keywords, text),
    featuredImage: Boolean(input.featuredImageUrl?.trim()) || images.length > 0,
  };
}

export function countKeyword(text: string, keyword: string): number {
  if (!keyword.trim()) return 0;
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (text.match(new RegExp(`\\b${escaped}\\b`, "gi")) || []).length;
}

export function keywordIn(text: string, keyword: string): boolean {
  return keyword.trim().length > 0 && text.toLowerCase().includes(keyword.trim().toLowerCase());
}
