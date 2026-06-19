import { prioritizeChecksForRecommendations } from "./blog-content-analysis-presentation";

export type ContentAnalysisCategory = "seo" | "geo" | "llm" | "readability";

export type ContentAnalysisInput = {
  title: string;
  keywords: string[];
  metaDescription: string;
  contentHtml: string;
  permalink?: string;
  author?: string;
  featuredImageUrl?: string;
};

export type ContentAnalysisCheck = {
  id: string;
  label: string;
  passed: boolean;
  message: string;
  category: ContentAnalysisCategory;
  /** Points toward category score (weights should sum to 100 per category). */
  weight: number;
  suggestionLabel: string;
};

export type ContentAnalysisSuggestion = {
  label: string;
  impacts: Partial<Record<"seo" | "geo" | "llm" | "readability", number>>;
  totalImpact: number;
};

export type ContentAnalysisResult = {
  seoScore: number;
  geoScore: number;
  llmScore: number;
  readabilityScore: number;
  overallScore: number;
  checks: ContentAnalysisCheck[];
  seoChecks: ContentAnalysisCheck[];
  geoChecks: ContentAnalysisCheck[];
  llmChecks: ContentAnalysisCheck[];
  readabilityChecks: ContentAnalysisCheck[];
  suggestions: ContentAnalysisSuggestion[];
  hasInput: boolean;
};

export const EMPTY_CONTENT_ANALYSIS: ContentAnalysisResult = {
  seoScore: 0,
  geoScore: 0,
  llmScore: 0,
  readabilityScore: 0,
  overallScore: 0,
  checks: [],
  seoChecks: [],
  geoChecks: [],
  llmChecks: [],
  readabilityChecks: [],
  suggestions: [],
  hasInput: false,
};

const ENTITY_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;

export function plainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchAll(html: string, pattern: RegExp): RegExpMatchArray[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return Array.from(html.matchAll(new RegExp(pattern.source, flags)));
}

function countKeywordOccurrences(text: string, keyword: string): number {
  if (!keyword.trim()) return 0;
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (text.match(new RegExp(`\\b${escaped}\\b`, "gi")) || []).length;
}

function keywordInText(text: string, keyword: string): boolean {
  return keyword.trim().length > 0 && text.toLowerCase().includes(keyword.trim().toLowerCase());
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function categoryScore(checks: ContentAnalysisCheck[]): number {
  if (checks.length === 0) return 0;
  const max = checks.reduce((sum, c) => sum + c.weight, 0);
  const earned = checks.filter((c) => c.passed).reduce((sum, c) => sum + c.weight, 0);
  return clampScore((earned / max) * 100);
}

export function hasAnalysisInput(input: ContentAnalysisInput): boolean {
  return Boolean(
    input.title.trim() ||
      input.metaDescription.trim() ||
      input.keywords.some((k) => k.trim()) ||
      plainText(input.contentHtml).length > 0 ||
      input.permalink?.trim() ||
      input.author?.trim() ||
      input.featuredImageUrl?.trim(),
  );
}

type AnalysisContext = {
  input: ContentAnalysisInput;
  html: string;
  text: string;
  primaryKeyword: string;
  allKeywords: string[];
};

function ctx(input: ContentAnalysisInput): AnalysisContext {
  const html = input.contentHtml || "";
  return {
    input,
    html,
    text: plainText(html),
    primaryKeyword: input.keywords[0]?.trim() ?? "",
    allKeywords: input.keywords.map((k) => k.trim()).filter(Boolean),
  };
}

function hasFaq(html: string, text: string): boolean {
  return (
    /<h[2-4][^>]*>[^<]*\?/i.test(html) ||
    /\bfaq\b/i.test(html) ||
    /\b(frequently asked|common questions)\b/i.test(text)
  );
}

function linkCounts(html: string) {
  const links = matchAll(html, /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi);
  const internal = links.filter((m) => {
    const href = (m[1] || "").trim();
    return href.startsWith("/") || href.startsWith("#");
  }).length;
  return { internal, external: links.length - internal, total: links.length };
}

function imageStats(html: string) {
  const images = matchAll(html, /<img\b[^>]*>/gi);
  const withAlt = images.filter((m) => /\balt=["'][^"']+["']/i.test(m[0])).length;
  return { total: images.length, withAlt };
}

function headingStats(html: string) {
  return {
    h1: matchAll(html, /<h1\b[^>]*>/gi).length,
    h2: matchAll(html, /<h2\b[^>]*>/gi).length,
    h3: matchAll(html, /<h3\b[^>]*>/gi).length,
  };
}

function sentenceStats(text: string) {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  const avgSentenceLength = sentences.length ? words.length / sentences.length : words.length;
  const avgWordLength = words.length
    ? words.reduce((sum, word) => sum + word.replace(/[^a-z0-9]/gi, "").length, 0) / words.length
    : 0;
  return { sentences, words, avgSentenceLength, avgWordLength };
}

function buildSeoChecks(c: AnalysisContext): ContentAnalysisCheck[] {
  const { input, html, text, primaryKeyword } = c;
  const metaLen = input.metaDescription.trim().length;
  const headings = headingStats(html);
  const links = linkCounts(html);
  const images = imageStats(html);
  const faq = hasFaq(html, text);
  const keywordInContent = c.allKeywords.some((kw) => countKeywordOccurrences(text, kw) > 0);
  const hasFeatured = Boolean(input.featuredImageUrl?.trim()) || images.total > 0;

  const defs: Array<Omit<ContentAnalysisCheck, "category"> & { category: "seo" }> = [
    {
      id: "seo-keyword-title",
      label: "Keyword in title",
      suggestionLabel: "Add keyword to title",
      weight: 10,
      passed: Boolean(primaryKeyword) && keywordInText(input.title, primaryKeyword),
      message: primaryKeyword
        ? keywordInText(input.title, primaryKeyword)
          ? `Primary keyword “${primaryKeyword}” is in the title.`
          : `Include “${primaryKeyword}” in the title.`
        : "Add keywords to evaluate title targeting.",
      category: "seo",
    },
    {
      id: "seo-keyword-content",
      label: "Keyword in content",
      suggestionLabel: "Use keywords in body content",
      weight: 10,
      passed: keywordInContent,
      message: keywordInContent
        ? "Target keywords appear in the body."
        : "Weave primary keywords naturally into the content.",
      category: "seo",
    },
    {
      id: "seo-keyword-permalink",
      label: "Keyword in permalink",
      suggestionLabel: "Add keyword to permalink",
      weight: 5,
      passed: Boolean(primaryKeyword) && keywordInText(input.permalink || "", primaryKeyword),
      message: primaryKeyword
        ? keywordInText(input.permalink || "", primaryKeyword)
          ? "Permalink includes the primary keyword."
          : "Add the primary keyword to the permalink slug."
        : "Set keywords to check permalink targeting.",
      category: "seo",
    },
    {
      id: "seo-meta-exists",
      label: "Meta description exists",
      suggestionLabel: "Add meta description",
      weight: 5,
      passed: metaLen > 0,
      message: metaLen > 0 ? "Meta description is present." : "Write a meta description for search snippets.",
      category: "seo",
    },
    {
      id: "seo-meta-length",
      label: "Meta description length",
      suggestionLabel: "Optimize meta description length",
      weight: 10,
      passed: metaLen >= 120 && metaLen <= 160,
      message:
        metaLen === 0
          ? "Meta description missing."
          : metaLen < 120
            ? `Meta description is short (${metaLen}/160).`
            : metaLen > 160
              ? "Meta description exceeds 160 characters."
              : `Meta length is optimal (${metaLen} chars).`,
      category: "seo",
    },
    {
      id: "seo-h1",
      label: "H1 present",
      suggestionLabel: "Add H1 heading",
      weight: 5,
      passed: headings.h1 >= 1 || Boolean(input.title.trim()),
      message:
        headings.h1 >= 1
          ? "H1 heading detected in content."
          : input.title.trim()
            ? "Title serves as H1 — add H2/H3 sections in content."
            : "Add a clear H1 or title.",
      category: "seo",
    },
    {
      id: "seo-headings",
      label: "H2/H3 structure",
      suggestionLabel: "Improve heading structure",
      weight: 10,
      passed: headings.h2 >= 2 && headings.h3 >= 1,
      message:
        headings.h2 >= 2 && headings.h3 >= 1
          ? "Strong H2/H3 hierarchy detected."
          : "Use multiple H2 sections and at least one H3.",
      category: "seo",
    },
    {
      id: "seo-featured-image",
      label: "Featured image added",
      suggestionLabel: "Add featured image",
      weight: 5,
      passed: hasFeatured,
      message: hasFeatured ? "Featured or inline image detected." : "Add a featured image.",
      category: "seo",
    },
    {
      id: "seo-internal-links",
      label: "Internal links",
      suggestionLabel: "Add internal links",
      weight: 10,
      passed: links.internal >= 1,
      message: links.internal >= 1 ? "Internal links present." : "Link to related on-site pages.",
      category: "seo",
    },
    {
      id: "seo-external-links",
      label: "External links",
      suggestionLabel: "Add external links",
      weight: 10,
      passed: links.external >= 1,
      message: links.external >= 1 ? "External references present." : "Add authoritative outbound links.",
      category: "seo",
    },
    {
      id: "seo-faq",
      label: "FAQ section",
      suggestionLabel: "Add FAQ section",
      weight: 10,
      passed: faq,
      message: faq ? "FAQ or question section detected." : "Add an FAQ block with common questions.",
      category: "seo",
    },
    {
      id: "seo-alt-text",
      label: "Image alt text",
      suggestionLabel: "Add image alt text",
      weight: 10,
      passed: images.total === 0 || images.withAlt === images.total,
      message:
        images.total === 0
          ? "No inline images — alt text not required yet."
          : images.withAlt === images.total
            ? "All images have alt text."
            : `${images.total - images.withAlt} image(s) missing alt text.`,
      category: "seo",
    },
  ];
  return defs;
}

function buildGeoChecks(c: AnalysisContext): ContentAnalysisCheck[] {
  const { html, text } = c;
  const faq = hasFaq(html, text);
  const intro = text.slice(0, 400);
  const hasDirectAnswer =
    intro.length >= 40 &&
    (/\b(is|are|means|refers to|helps|enables|allows)\b/i.test(intro) || intro.split(/[.!?]/).length >= 2);
  const hasSummary = /\b(in summary|to summarize|key points|at a glance|overview)\b/i.test(text);
  const bulletLists = matchAll(html, /<ul\b[^>]*>/gi).length;
  const numberedLists = matchAll(html, /<ol\b[^>]*>/gi).length;
  const hasTable = /<table\b/i.test(html);
  const hasStats = /\b\d+(\.\d+)?%|\b\d{1,3}(,\d{3})+\b|\b\d+\s*(users|customers|companies|percent)\b/i.test(text);
  const hasSources =
    /\b(according to|source:|study|research|report|survey)\b/i.test(text) ||
    linkCounts(html).external >= 1;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const topicCoverage = wordCount >= 200 && headingStats(html).h2 >= 2;
  const hasTakeaways = /\b(key takeaway|takeaways|bottom line|in conclusion|final thoughts)\b/i.test(text);

  return [
    {
      id: "geo-direct-answer",
      label: "Direct answer in introduction",
      suggestionLabel: "Add direct answer in intro",
      weight: 10,
      passed: hasDirectAnswer,
      message: hasDirectAnswer
        ? "Introduction answers the topic directly."
        : "Open with a clear, direct answer in the first paragraph.",
      category: "geo",
    },
    {
      id: "geo-summary",
      label: "Summary section",
      suggestionLabel: "Add summary section",
      weight: 10,
      passed: hasSummary,
      message: hasSummary ? "Summary or overview section found." : "Add an “In summary” or key points section.",
      category: "geo",
    },
    {
      id: "geo-faq",
      label: "FAQ section",
      suggestionLabel: "Add FAQ section",
      weight: 10,
      passed: faq,
      message: faq ? "FAQ section detected." : "Add FAQ content for generative search.",
      category: "geo",
    },
    {
      id: "geo-bullets",
      label: "Bullet lists",
      suggestionLabel: "Add bullet lists",
      weight: 10,
      passed: bulletLists >= 1,
      message: bulletLists >= 1 ? "Bullet lists present." : "Use bullet lists for scannable facts.",
      category: "geo",
    },
    {
      id: "geo-numbered",
      label: "Numbered lists",
      suggestionLabel: "Add numbered lists",
      weight: 8,
      passed: numberedLists >= 1,
      message: numberedLists >= 1 ? "Numbered lists present." : "Add step-by-step numbered lists.",
      category: "geo",
    },
    {
      id: "geo-table",
      label: "Comparison table",
      suggestionLabel: "Add comparison table",
      weight: 10,
      passed: hasTable,
      message: hasTable ? "Table structure detected." : "Add a comparison or data table.",
      category: "geo",
    },
    {
      id: "geo-statistics",
      label: "Statistics detected",
      suggestionLabel: "Add statistics",
      weight: 10,
      passed: hasStats,
      message: hasStats ? "Statistics or metrics found." : "Include data points or percentages.",
      category: "geo",
    },
    {
      id: "geo-sources",
      label: "Sources / references",
      suggestionLabel: "Add sources or references",
      weight: 10,
      passed: hasSources,
      message: hasSources ? "Sources or references cited." : "Cite studies, reports, or authoritative sources.",
      category: "geo",
    },
    {
      id: "geo-coverage",
      label: "Topic coverage",
      suggestionLabel: "Expand topic coverage",
      weight: 12,
      passed: topicCoverage,
      message: topicCoverage
        ? "Topic is covered in sufficient depth."
        : "Expand content (~200+ words) with multiple sections.",
      category: "geo",
    },
    {
      id: "geo-takeaways",
      label: "Key takeaways section",
      suggestionLabel: "Add key takeaways",
      weight: 10,
      passed: hasTakeaways,
      message: hasTakeaways ? "Key takeaways section found." : "End with key takeaways or a conclusion.",
      category: "geo",
    },
  ];
}

function buildLlmChecks(c: AnalysisContext): ContentAnalysisCheck[] {
  const { input, html, text } = c;
  const headings = headingStats(html);
  const entities = new Set((text.match(ENTITY_PATTERN) || []).map((e) => e.trim()));
  const hasDefinitions = /\b(is defined as|refers to|means that|in other words)\b/i.test(text);
  const semanticHits = c.allKeywords.filter((kw) => countKeywordOccurrences(text, kw) > 0).length;
  const trustSignals =
    /\b(certified|trusted|proven|award|years of experience|expert|leading)\b/i.test(text) ||
    Boolean(input.author?.trim());
  const terms = c.allKeywords.map((k) => k.toLowerCase());
  const termConsistency =
    terms.length === 0 ||
    terms.every((term) => !text.toLowerCase().includes(term) || countKeywordOccurrences(text, term) >= 2);
  const hasExamples = /\b(for example|e\.g\.|such as|instance)\b/i.test(text);
  const hasCaseStudy = /\b(case study|client story|customer story|success story)\b/i.test(text);
  const hasCitations =
    /\b(according to|citation|reference|source:)\b/i.test(text) || linkCounts(html).external >= 2;

  return [
    {
      id: "llm-entities",
      label: "Entity coverage",
      suggestionLabel: "Add named entities",
      weight: 10,
      passed: entities.size >= 3,
      message: entities.size >= 3 ? `${entities.size} named entities detected.` : "Mention brands, products, or organizations.",
      category: "llm",
    },
    {
      id: "llm-author",
      label: "Author present",
      suggestionLabel: "Add author name",
      weight: 8,
      passed: Boolean(input.author?.trim()),
      message: input.author?.trim() ? "Author is specified." : "Set an author for trust signals.",
      category: "llm",
    },
    {
      id: "llm-headings",
      label: "Clear heading hierarchy",
      suggestionLabel: "Improve heading hierarchy",
      weight: 10,
      passed: headings.h2 >= 2 && headings.h3 >= 1,
      message:
        headings.h2 >= 2 && headings.h3 >= 1
          ? "Clear H2/H3 hierarchy for LLM parsing."
          : "Structure content with H2 and H3 headings.",
      category: "llm",
    },
    {
      id: "llm-definitions",
      label: "Definitions included",
      suggestionLabel: "Add definitions",
      weight: 10,
      passed: hasDefinitions,
      message: hasDefinitions ? "Definitions or explanations included." : "Define key terms clearly.",
      category: "llm",
    },
    {
      id: "llm-semantic",
      label: "Semantic keyword coverage",
      suggestionLabel: "Expand semantic keywords",
      weight: 10,
      passed: c.allKeywords.length === 0 ? false : semanticHits >= Math.min(2, c.allKeywords.length),
      message:
        semanticHits >= 2
          ? "Multiple target keywords used in content."
          : "Use related keywords throughout the article.",
      category: "llm",
    },
    {
      id: "llm-trust",
      label: "Trust signals",
      suggestionLabel: "Add trust signals",
      weight: 10,
      passed: trustSignals,
      message: trustSignals ? "Trust or authority signals present." : "Add credentials, expertise, or social proof.",
      category: "llm",
    },
    {
      id: "llm-terminology",
      label: "Consistent terminology",
      suggestionLabel: "Use consistent terminology",
      weight: 8,
      passed: termConsistency && c.allKeywords.length > 0,
      message:
        c.allKeywords.length === 0
          ? "Add keywords to check terminology consistency."
          : termConsistency
            ? "Terminology is used consistently."
            : "Repeat key terms consistently across sections.",
      category: "llm",
    },
    {
      id: "llm-examples",
      label: "Examples present",
      suggestionLabel: "Add examples",
      weight: 12,
      passed: hasExamples,
      message: hasExamples ? "Examples illustrate key points." : "Add concrete examples (e.g., “for example…”).",
      category: "llm",
    },
    {
      id: "llm-case-study",
      label: "Case study present",
      suggestionLabel: "Add case study",
      weight: 10,
      passed: hasCaseStudy,
      message: hasCaseStudy ? "Case study or success story found." : "Include a brief case study or customer story.",
      category: "llm",
    },
    {
      id: "llm-citations",
      label: "Citations / references",
      suggestionLabel: "Add citations",
      weight: 12,
      passed: hasCitations,
      message: hasCitations ? "Citations or references included." : "Add citations to support claims.",
      category: "llm",
    },
  ];
}

function buildReadabilityChecks(c: AnalysisContext): ContentAnalysisCheck[] {
  const { text } = c;
  const { sentences, words, avgSentenceLength, avgWordLength } = sentenceStats(text);
  const paragraphs =
    matchAll(c.html, /<p\b[^>]*>[\s\S]*?<\/p>/gi).filter((m) => plainText(m[0]).length > 20).length ||
  text.split(/\n{2,}/).filter((p) => p.trim().length > 20).length;

  return [
    {
      id: "read-sentence-length",
      label: "Sentence length",
      suggestionLabel: "Shorten sentences",
      weight: 25,
      passed: words.length < 15 || (avgSentenceLength >= 12 && avgSentenceLength <= 22),
      message:
        words.length < 15
          ? "Add more content to assess sentence length."
          : avgSentenceLength > 22
            ? `Sentences average ${avgSentenceLength.toFixed(0)} words — shorten.`
            : avgSentenceLength < 12
              ? "Sentences are very short."
              : `Comfortable sentence length (${avgSentenceLength.toFixed(0)} words avg).`,
      category: "readability",
    },
    {
      id: "read-word-complexity",
      label: "Word complexity",
      suggestionLabel: "Simplify vocabulary",
      weight: 25,
      passed: words.length < 15 || avgWordLength <= 5.5,
      message:
        words.length < 15
          ? "Add content to assess complexity."
          : avgWordLength <= 5.5
            ? "Vocabulary is accessible."
            : "Simplify long or complex words.",
      category: "readability",
    },
    {
      id: "read-paragraphs",
      label: "Paragraph structure",
      suggestionLabel: "Add paragraph breaks",
      weight: 25,
      passed: paragraphs >= 2,
      message: paragraphs >= 2 ? `${paragraphs} readable paragraphs detected.` : "Split into multiple short paragraphs.",
      category: "readability",
    },
    {
      id: "read-flow",
      label: "Reading flow",
      suggestionLabel: "Expand content depth",
      weight: 25,
      passed: sentences.length >= 3 && words.length >= 60,
      message:
        sentences.length >= 3 && words.length >= 60
          ? "Enough depth for smooth reading."
          : "Add more content for better reading flow.",
      category: "readability",
    },
  ];
}

const CATEGORY_LABEL: Record<ContentAnalysisCategory, "seo" | "geo" | "llm" | "readability"> = {
  seo: "seo",
  geo: "geo",
  llm: "llm",
  readability: "readability",
};

function buildRecommendations(checks: ContentAnalysisCheck[]): ContentAnalysisSuggestion[] {
  return prioritizeChecksForRecommendations(checks)
    .slice(0, 5)
    .map((c) => {
      const cat = CATEGORY_LABEL[c.category];
      const impacts: ContentAnalysisSuggestion["impacts"] = { [cat]: c.weight };
      return {
        label: c.suggestionLabel,
        impacts,
        totalImpact: c.weight,
      };
    });
}

export function formatSuggestionImpact(s: ContentAnalysisSuggestion): string {
  const parts: string[] = [];
  if (s.impacts.seo) parts.push(`+${s.impacts.seo} SEO`);
  if (s.impacts.geo) parts.push(`+${s.impacts.geo} GEO`);
  if (s.impacts.llm) parts.push(`+${s.impacts.llm} LLM`);
  if (s.impacts.readability) parts.push(`+${s.impacts.readability} Read`);
  return parts.join(", ");
}

const CATEGORY_SHORT: Record<ContentAnalysisCategory, string> = {
  seo: "SEO",
  geo: "GEO",
  llm: "LLM",
  readability: "Read",
};

export function formatCheckImpact(check: ContentAnalysisCheck): string {
  return `+${check.weight} ${CATEGORY_SHORT[check.category]}`;
}

export type ChecklistSummary = {
  passed: number;
  total: number;
  remaining: number;
};

export function summarizeChecks(checks: ContentAnalysisCheck[]): ChecklistSummary {
  const passed = checks.filter((c) => c.passed).length;
  return { passed, total: checks.length, remaining: checks.length - passed };
}

export function analyzeBlogContent(input: ContentAnalysisInput): ContentAnalysisResult {
  if (!hasAnalysisInput(input)) {
    return EMPTY_CONTENT_ANALYSIS;
  }

  const c = ctx(input);
  const seoChecks = buildSeoChecks(c);
  const geoChecks = buildGeoChecks(c);
  const llmChecks = buildLlmChecks(c);
  const readabilityChecks = buildReadabilityChecks(c);
  const checks = [...seoChecks, ...geoChecks, ...llmChecks, ...readabilityChecks];

  const seoScore = categoryScore(seoChecks);
  const geoScore = categoryScore(geoChecks);
  const llmScore = categoryScore(llmChecks);
  const readabilityScore = categoryScore(readabilityChecks);
  const overallScore = clampScore((seoScore + geoScore + llmScore + readabilityScore) / 4);

  return {
    seoScore,
    geoScore,
    llmScore,
    readabilityScore,
    overallScore,
    checks,
    seoChecks,
    geoChecks,
    llmChecks,
    readabilityChecks,
    suggestions: buildRecommendations(checks),
    hasInput: true,
  };
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#059669";
  if (score >= 60) return "#1a56db";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}
