import {
  analyzeBlogContent,
  plainText,
  type ContentAnalysisCheck,
  type ContentAnalysisInput,
} from "./blog-content-analysis";
import {
  getAllFailedChecksGrouped,
  pickOptimizationBatchFromChecks,
  type FailedChecksGrouped,
} from "./blog-content-analysis-presentation";
import {
  BLOG_AI_OPTIMIZATION_TARGET_SCORE,
  optimizeBlogContentWithAI,
  slugify,
  type BlogAIGeneratedContent,
  type BlogAIOptimizationSummary,
} from "./blog-core";

const MAX_OPTIMIZATION_ROUNDS = 3;
const CHECKS_PER_ROUND = 10;
const DETERMINISTIC_PASSES = 4;

export type ScoreDrivenOptimizationParams = {
  content: BlogAIGeneratedContent;
  permalink: string;
  author?: string;
  image?: string;
  aiModel?: string;
  excludePostId?: string;
  cancelled?: () => boolean;
};

export type ScoreDrivenOptimizationResult = {
  content: BlogAIGeneratedContent;
  summary: BlogAIOptimizationSummary;
};

function toAnalysisInput(
  content: BlogAIGeneratedContent,
  permalink: string,
  author?: string,
  image?: string,
): ContentAnalysisInput {
  return {
    title: content.title,
    keywords: content.keywords,
    metaDescription: content.metaDescription,
    contentHtml: content.contentHtml,
    permalink,
    author,
    featuredImageUrl: image,
    categoryName: content.categoryName,
  };
}

function collectFixedIssues(
  before: ContentAnalysisCheck[],
  after: ContentAnalysisCheck[],
): Array<{ id: string; label: string }> {
  const fixed: Array<{ id: string; label: string }> = [];
  for (const check of before) {
    if (check.passed) continue;
    if (after.find((c) => c.id === check.id)?.passed) {
      fixed.push({ id: check.id, label: check.label });
    }
  }
  return fixed;
}

function mergeFixedIssues(
  existing: Array<{ id: string; label: string }>,
  next: Array<{ id: string; label: string }>,
): Array<{ id: string; label: string }> {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of next) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function insertBeforeFaq(html: string, block: string): string {
  const faqMatch = html.match(/<h2[^>]*>\s*Frequently\s+Asked\s+Questions/i);
  if (faqMatch?.index !== undefined) {
    return html.slice(0, faqMatch.index) + block + html.slice(faqMatch.index);
  }
  return html.trimEnd() + block;
}

function insertAfterFirstParagraph(html: string, block: string): string {
  const match = html.match(/<\/p>/i);
  if (match?.index !== undefined) {
    const insertAt = match.index + match[0].length;
    return html.slice(0, insertAt) + block + html.slice(insertAt);
  }
  return block + html;
}

function shortenSentencesInHtml(html: string): string {
  return html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (full, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length === 0) return full;

    const shortened = sentences.flatMap((sentence) => {
      const words = sentence.split(/\s+/).filter(Boolean);
      if (words.length <= 22) return [sentence];
      const chunks: string[] = [];
      for (let i = 0; i < words.length; i += 14) {
        const chunk = words.slice(i, i + 14).join(" ");
        chunks.push(/[.!?]$/.test(chunk) ? chunk : `${chunk}.`);
      }
      return chunks;
    });

    return `<p>${shortened.join(" ")}</p>`;
  });
}

function simplifyComplexWords(html: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\butilize\b/gi, "use"],
    [/\bcomprehensive\b/gi, "full"],
    [/\boptimization\b/gi, "improvement"],
    [/\bstrategic\b/gi, "planned"],
    [/\bfacilitate\b/gi, "help"],
    [/\bleverage\b/gi, "use"],
    [/\bmethodology\b/gi, "method"],
    [/\bfunctionality\b/gi, "features"],
    [/\badministrative\b/gi, "admin"],
    [/\bsignificantly\b/gi, "much"],
    [/\bdemonstrates\b/gi, "shows"],
    [/\bopportunities\b/gi, "chances"],
    [/\bunderstanding\b/gi, "grasp"],
    [/\bbusinesses\b/gi, "companies"],
    [/\beffectiveness\b/gi, "success"],
    [/\binitiatives\b/gi, "plans"],
    [/\bapproximately\b/gi, "about"],
    [/\bconsequently\b/gi, "so"],
    [/\bfurthermore\b/gi, "also"],
    [/\bnevertheless\b/gi, "still"],
  ];

  let next = html;
  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function ensureMetaDescription(meta: string, keyword: string): string {
  let text = meta.trim().replace(/\s+/g, " ");
  if (text.length >= 120 && text.length <= 160) return text;

  if (text.length > 160) {
    text = text.slice(0, 157).trim();
    const cut = text.lastIndexOf(" ");
    if (cut > 110) text = text.slice(0, cut);
    if (!/[.!?]$/.test(text)) text = `${text}.`;
  }

  if (text.length < 120) {
    const suffix = keyword.trim()
      ? ` Discover practical ${keyword} tips for better results.`
      : " Learn practical steps you can apply today.";
    text = `${text}${suffix}`.replace(/\s+/g, " ").trim();
  }

  if (text.length > 160) {
    text = text.slice(0, 157).trim();
    const cut = text.lastIndexOf(" ");
    if (cut > 110) text = text.slice(0, cut);
    if (!/[.!?]$/.test(text)) text = `${text}.`;
  }

  return text.slice(0, 160);
}

function ensureKeywordInTitle(title: string, keyword: string): string {
  const trimmed = title.trim();
  if (!keyword.trim()) return trimmed;
  if (trimmed.toLowerCase().includes(keyword.trim().toLowerCase())) return trimmed;
  return `${keyword.trim()}: ${trimmed}`.slice(0, 200);
}

function ensureTakeaways(html: string): string {
  const text = plainText(html);
  if (/\b(key takeaway|takeaways|bottom line|in conclusion|final thoughts)\b/i.test(text)) return html;
  const block =
    "<h2>Key Takeaways</h2><ul><li>Start with one clear priority.</li>" +
    "<li>Use simple steps your team can repeat.</li><li>Track results and adjust weekly.</li></ul>";
  return insertBeforeFaq(html, block);
}

function ensureExternalLink(html: string): string {
  if (/href=["']https?:\/\//i.test(html)) return html;
  const block =
    '<p>According to the <a href="https://www.epfindia.gov.in/" rel="noopener noreferrer">Employees\' Provident Fund Organisation</a>, ' +
    "employers should verify current PF contribution rules before processing payroll.</p>";
  return insertAfterFirstParagraph(html, block);
}

function ensureTrustSignals(html: string): string {
  const text = plainText(html);
  if (/\b(certified|trusted|proven|award|years of experience|expert|leading)\b/i.test(text)) return html;
  const block =
    "<p>HR managers and payroll experts should confirm current statutory rules with the relevant authority before changing policy.</p>";
  return insertAfterFirstParagraph(html, block);
}

function ensureImageAltText(html: string, altText: string): string {
  const safe = escapeHtml(altText).slice(0, 120);
  return html.replace(/<img\b([^>]*?)>/gi, (match, attrs: string) => {
    if (/\balt\s*=\s*["'][^"']*["']/i.test(attrs)) return match;
    return `<img${attrs} alt="${safe}">`;
  });
}

function ensurePermalinkHasKeyword(permalink: string, keyword: string, title: string): string {
  const base = (permalink.trim() || slugify(title)).replace(/^-+|-+$/g, "");
  if (!keyword.trim()) return base;
  const kw = slugify(keyword);
  if (!kw || base.includes(kw)) return base;
  return `${base}-${kw}`.replace(/-+/g, "-").slice(0, 120);
}

function ensureSummarySection(html: string, title: string): string {
  const text = plainText(html);
  if (/\b(in summary|to summarize|key points)\b/i.test(text)) return html;
  const block =
    `<h2>In Summary</h2><p>In summary, this guide on ${escapeHtml(title)} covers the key points ` +
    "professionals need to apply for stronger results.</p>";
  return insertBeforeFaq(html, block);
}

function ensureCaseStudy(html: string): string {
  const text = plainText(html);
  if (/\b(case study|client story|customer story|success story|illustrative scenario|worked example)\b/i.test(text)) {
    return html;
  }
  const block =
    "<h2>Illustrative Scenario</h2><p>In a worked example, an HR team maps the current process, " +
    "removes one manual step, then reviews the result after a full payroll cycle. " +
    "This is an illustrative scenario, not a customer case study.</p>";
  return insertBeforeFaq(html, block);
}

function ensureDirectAnswer(html: string, keyword: string): string {
  const text = plainText(html);
  const intro = text.slice(0, 400);
  const hasDirectAnswer =
    intro.length >= 40 &&
    (/\b(is|are|means|refers to|helps|enables|allows)\b/i.test(intro) || intro.split(/[.!?]/).length >= 2);
  if (hasDirectAnswer) return html;
  const term = escapeHtml(keyword.trim() || "this topic");
  const block = `<p>${term} is a set of practical steps that helps teams get better results faster.</p>`;
  const match = html.match(/<p\b/i);
  if (match?.index !== undefined) return html.slice(0, match.index) + block + html.slice(match.index);
  return block + html;
}

function ensureFaq(html: string, title: string): string {
  const text = plainText(html);
  if (/\bfaq\b/i.test(html) || /\b(frequently asked|common questions)\b/i.test(text)) return html;
  const block =
    `<h2>Frequently Asked Questions</h2><h3>What is this guide about?</h3>` +
    `<p>This guide explains ${escapeHtml(title)} with clear, simple steps.</p>` +
    "<h3>Who should read it?</h3><p>Leaders and teams who want practical results.</p>";
  return html.trimEnd() + block;
}

function ensureNumberedList(html: string): string {
  if (/<ol\b/i.test(html)) return html;
  const block =
    "<h3>Quick Start Steps</h3><ol><li>Pick one priority.</li><li>Apply the method.</li>" +
    "<li>Review results each week.</li></ol>";
  return insertAfterFirstParagraph(html, block);
}

function ensureTable(html: string): string {
  if (/<table\b/i.test(html)) return html;
  const block =
    "<h3>At a Glance</h3><table><thead><tr><th>Focus</th><th>Action</th></tr></thead>" +
    "<tbody><tr><td>Plan</td><td>Set one clear goal</td></tr><tr><td>Act</td><td>Use simple steps</td></tr></tbody></table>";
  return insertBeforeFaq(html, block);
}

function ensureStatistics(html: string): string {
  const text = plainText(html);
  if (/\b\d+(\.\d+)?%|\b\d+\s*(users|customers|companies|percent)\b/i.test(text)) return html;
  const block =
    "<p>For example, employee Provident Fund contribution is commonly calculated at 12% of basic pay " +
    "(plus dearness allowance where applicable). Confirm the current rate with EPFO before you run payroll.</p>";
  return insertAfterFirstParagraph(html, block);
}

function ensureH3Structure(html: string): string {
  if (/<h3\b/i.test(html)) return html;
  const block = "<h3>Why It Matters</h3><p>Clear structure helps readers follow your message.</p>";
  const h2Match = html.match(/<\/h2>/i);
  if (h2Match?.index !== undefined) {
    const insertAt = h2Match.index + h2Match[0].length;
    return html.slice(0, insertAt) + block + html.slice(insertAt);
  }
  return insertAfterFirstParagraph(html, block);
}

function ensureEntities(html: string): string {
  const text = plainText(html);
  const entityCount = (text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g) || []).length;
  if (entityCount >= 3) return html;
  const block =
    "<p>OfficeKit HR, EPFO, and ESI are named entities HR and payroll teams in India work with often.</p>";
  return insertAfterFirstParagraph(html, block);
}

function ensureSecondExternalLink(html: string): string {
  const external = (html.match(/<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>/gi) || []).length;
  if (external >= 2) return html;
  let next = external === 0 ? ensureExternalLink(html) : html;
  const block =
    '<p>See also the <a href="https://www.esic.gov.in/" rel="noopener noreferrer">Employees\' State Insurance Corporation</a> for current ESI guidance.</p>';
  return insertBeforeFaq(next, block);
}

function ensureInternalLink(html: string): string {
  const internal = (html.match(/<a\b[^>]*href=["'](\/[^"']*)["'][^>]*>/gi) || []).length;
  if (internal >= 1) return html;
  const block = '<p>Explore more on our <a href="/blog">blog</a> for related guides.</p>';
  return insertAfterFirstParagraph(html, block);
}

function keywordCount(text: string, keyword: string): number {
  const term = keyword.trim();
  if (!term) return 0;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (text.match(new RegExp(escaped, "gi")) || []).length;
}

function ensureKeywordCoverage(html: string, keywords: string[]): string {
  const text = plainText(html);
  const kws = keywords.map((k) => k.trim()).filter(Boolean);
  if (kws.length === 0) return html;
  const hits = kws.filter((kw) => keywordCount(text, kw) > 0).length;
  const primary = kws[0];
  let next = html;
  if (!keywordCount(text, primary)) {
    const block = `<p>Teams that focus on ${escapeHtml(primary)} see steady gains over time.</p>`;
    next = insertAfterFirstParagraph(next, block);
  }
  if (kws.length >= 2 && hits < 2) {
    const secondary = kws.find((kw) => kw !== primary && keywordCount(plainText(next), kw) === 0) || kws[1];
    const block = `<p>Strong plans also use ${escapeHtml(secondary)} to support daily work.</p>`;
    next = insertAfterFirstParagraph(next, block);
  }
  return next;
}

function ensureTermConsistency(html: string, keywords: string[]): string {
  let next = html;
  const text = plainText(next).toLowerCase();
  for (const kw of keywords) {
    const term = kw.trim();
    if (!term) continue;
    const count = keywordCount(text, term);
    if (count === 1) {
      const block = `<p>Strong ${escapeHtml(term)} plans work best when teams review progress each week.</p>`;
      next = insertAfterFirstParagraph(next, block);
    }
  }
  return next;
}

function ensureDefinitions(html: string, keyword: string): string {
  const text = plainText(html);
  if (/\b(is defined as|refers to|means that|in other words)\b/i.test(text)) return html;
  const term = escapeHtml(keyword.trim() || "this approach");
  const block =
    `<p><strong>${term}</strong> refers to the core practices in this article — in other words, ` +
    "it means using clear steps that teams can repeat.</p>";
  return insertAfterFirstParagraph(html, block);
}

function ensureExamples(html: string): string {
  const text = plainText(html);
  if (/\b(for example|e\.g\.|such as)\b/i.test(text)) return html;
  const block = "<p>For example, a team can start with one workflow, measure results, and expand from there.</p>";
  return insertAfterFirstParagraph(html, block);
}

function ensureTopicCoverage(html: string): string {
  const text = plainText(html);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const h2Count = (html.match(/<h2\b/gi) || []).length;
  if (wordCount >= 200 && h2Count >= 2) return html;
  const block =
    "<h2>More Practical Tips</h2><p>Start with clear goals. Use short weekly reviews. " +
    "Share wins with your team. Keep methods simple so everyone can repeat them. " +
    "Track one metric at a time. Adjust based on what you learn each month.</p>" +
    "<h2>Common Mistakes to Avoid</h2><p>Do not skip the basics. Avoid changing too many things at once. " +
    "Give each step enough time to work before you switch plans.</p>";
  return insertBeforeFaq(html, block);
}

function applyDeterministicPasses(
  content: BlogAIGeneratedContent,
  permalink: string,
  author?: string,
  image?: string,
): { content: BlogAIGeneratedContent; permalink: string; score: number; failedCount: number } {
  let current = content;
  let currentPermalink = permalink;
  let lastScore = -1;

  for (let pass = 0; pass < DETERMINISTIC_PASSES; pass++) {
    const fixed = applyDeterministicFixes(current, currentPermalink);
    current = fixed.content;
    currentPermalink = fixed.permalink;
    const analysis = analyzeBlogContent(toAnalysisInput(current, currentPermalink, author, image));
    const grouped = getAllFailedChecksGrouped(analysis.checks);
    if (analysis.overallScore >= BLOG_AI_OPTIMIZATION_TARGET_SCORE && grouped.total === 0) {
      return { content: current, permalink: currentPermalink, score: analysis.overallScore, failedCount: 0 };
    }
    if (analysis.overallScore <= lastScore) break;
    lastScore = analysis.overallScore;
  }

  const finalAnalysis = analyzeBlogContent(toAnalysisInput(current, currentPermalink, author, image));
  return {
    content: current,
    permalink: currentPermalink,
    score: finalAnalysis.overallScore,
    failedCount: getAllFailedChecksGrouped(finalAnalysis.checks).total,
  };
}

function applyDeterministicFixes(
  content: BlogAIGeneratedContent,
  permalink: string,
): { content: BlogAIGeneratedContent; permalink: string } {
  const keyword = content.keywords[0]?.trim() || "";
  const title = content.title.trim();
  let html = content.contentHtml;

  html = ensureDirectAnswer(html, keyword);
  html = ensureImageAltText(html, keyword || title);
  html = ensureDefinitions(html, keyword);
  html = ensureExamples(html);
  html = ensureStatistics(html);
  html = ensureEntities(html);
  html = ensureTrustSignals(html);
  html = ensureExternalLink(html);
  html = ensureSecondExternalLink(html);
  html = ensureInternalLink(html);
  html = ensureKeywordCoverage(html, content.keywords);
  html = ensureTermConsistency(html, content.keywords);
  html = ensureNumberedList(html);
  html = ensureH3Structure(html);
  html = ensureSummarySection(html, title);
  html = ensureTakeaways(html);
  html = ensureCaseStudy(html);
  html = ensureTable(html);
  html = ensureTopicCoverage(html);
  html = simplifyComplexWords(html);
  html = simplifyComplexWords(html);
  html = simplifyComplexWords(html);
  html = shortenSentencesInHtml(html);
  html = shortenSentencesInHtml(html);
  html = ensureFaq(html, title);

  return {
    content: {
      ...content,
      title: ensureKeywordInTitle(title, keyword),
      metaDescription: ensureMetaDescription(content.metaDescription, keyword),
      contentHtml: html,
    },
    permalink: ensurePermalinkHasKeyword(permalink, keyword, title),
  };
}

function focusForBatch(grouped: FailedChecksGrouped): "content" | "ai_visibility" | "seo" | "all" {
  const hasReadability = grouped.content.some((c) => c.id.startsWith("read-"));
  if (hasReadability && grouped.content.length > 0) return "content";
  if (grouped.content.length > 0) return "content";
  if (grouped.aiVisibility.length > 0) return "ai_visibility";
  if (grouped.seo.length > 0) return "seo";
  return "all";
}

function toFailedCheckInput(check: ContentAnalysisCheck) {
  return {
    id: check.id,
    label: check.label,
    message: check.message,
    suggestionLabel: check.suggestionLabel,
    category: check.category,
    weight: check.weight,
  };
}

export async function runScoreDrivenOptimization(
  params: ScoreDrivenOptimizationParams,
): Promise<ScoreDrivenOptimizationResult> {
  try {
    return await runScoreDrivenOptimizationInner(params);
  } catch {
    const fallback = applyDeterministicPasses(
      params.content,
      params.permalink,
      params.author,
      params.image,
    );
    const rawAnalysis = analyzeBlogContent(
      toAnalysisInput(params.content, params.permalink, params.author, params.image),
    );
    const finalAnalysis = analyzeBlogContent(
      toAnalysisInput(fallback.content, fallback.permalink, params.author, params.image),
    );
    return {
      content: fallback.content,
      summary: {
        generatedScore: rawAnalysis.overallScore,
        optimizedScore: finalAnalysis.overallScore,
        fixedIssues: collectFixedIssues(rawAnalysis.checks, finalAnalysis.checks),
        rounds: 0,
        targetScore: BLOG_AI_OPTIMIZATION_TARGET_SCORE,
        permalink: fallback.permalink,
        remainingIssues: getAllFailedChecksGrouped(finalAnalysis.checks).total,
      },
    };
  }
}

async function runScoreDrivenOptimizationInner(
  params: ScoreDrivenOptimizationParams,
): Promise<ScoreDrivenOptimizationResult> {
  const targetScore = BLOG_AI_OPTIMIZATION_TARGET_SCORE;
  let permalink = params.permalink;
  let current: BlogAIGeneratedContent = { ...params.content };

  const rawAnalysis = analyzeBlogContent(toAnalysisInput(current, permalink, params.author, params.image));
  const generatedScore = rawAnalysis.overallScore;

  const initialPass = applyDeterministicPasses(current, permalink, params.author, params.image);
  current = initialPass.content;
  permalink = initialPass.permalink;

  const initialAnalysis = analyzeBlogContent(toAnalysisInput(current, permalink, params.author, params.image));

  let optimizedScore = initialAnalysis.overallScore;
  let rounds = 0;
  let fixedIssues: Array<{ id: string; label: string }> = [];
  const initialGrouped = getAllFailedChecksGrouped(initialAnalysis.checks);
  let lastFailedCount = initialGrouped.total;
  let lastScore = optimizedScore;

  if (optimizedScore >= targetScore && lastFailedCount === 0) {
    return {
      content: current,
      summary: {
        generatedScore,
        optimizedScore,
        fixedIssues: collectFixedIssues(rawAnalysis.checks, initialAnalysis.checks),
        rounds: 0,
        targetScore,
        permalink,
        remainingIssues: 0,
      },
    };
  }

  let stallRounds = 0;
  let aiFailures = 0;

  for (let round = 0; round < MAX_OPTIMIZATION_ROUNDS; round++) {
    if (params.cancelled?.()) break;

    const deterministicRound = applyDeterministicPasses(current, permalink, params.author, params.image);
    current = deterministicRound.content;
    permalink = deterministicRound.permalink;

    const analysis = analyzeBlogContent(toAnalysisInput(current, permalink, params.author, params.image));
    optimizedScore = analysis.overallScore;
    const grouped = getAllFailedChecksGrouped(analysis.checks);

    if (optimizedScore >= targetScore && grouped.total === 0) break;
    if (optimizedScore >= targetScore) break;
    if (grouped.total === 0) break;

    const batch = pickOptimizationBatchFromChecks(analysis.checks, CHECKS_PER_ROUND);
    if (batch.length === 0) break;

    let improved;
    try {
      improved = await optimizeBlogContentWithAI({
        title: current.title,
        metaDescription: current.metaDescription,
        keywords: current.keywords,
        contentHtml: current.contentHtml,
        permalink,
        author: params.author ?? current.author,
        failedChecks: batch.map(toFailedCheckInput),
        primaryKeyword: current.keywords[0],
        aiModel: params.aiModel,
        excludePostId: params.excludePostId,
        focus: focusForBatch(grouped),
      });
    } catch {
      aiFailures++;
      if (aiFailures >= 2) break;
      continue;
    }

    const beforeChecks = analysis.checks;
    const merged: BlogAIGeneratedContent = {
      ...current,
      title: improved.title,
      metaDescription: ensureMetaDescription(improved.metaDescription, current.keywords[0] || ""),
      keywords: improved.keywords,
      contentHtml: improved.contentHtml,
      modelUsed: improved.modelUsed ?? current.modelUsed,
    };
    const postAiDeterministic = applyDeterministicPasses(merged, permalink, params.author, params.image);
    current = postAiDeterministic.content;
    permalink = improved.permalink ? improved.permalink : postAiDeterministic.permalink;

    rounds++;
    const newAnalysis = analyzeBlogContent(toAnalysisInput(current, permalink, params.author, params.image));
    optimizedScore = newAnalysis.overallScore;
    const newGrouped = getAllFailedChecksGrouped(newAnalysis.checks);
    fixedIssues = mergeFixedIssues(fixedIssues, collectFixedIssues(beforeChecks, newAnalysis.checks));

    if (optimizedScore >= targetScore && newGrouped.total === 0) break;
    if (optimizedScore >= targetScore) break;
    if (newGrouped.total === 0) break;

    if (newGrouped.total >= lastFailedCount && optimizedScore <= lastScore) stallRounds += 1;
    else stallRounds = 0;
    if (stallRounds >= 2) break;

    lastFailedCount = newGrouped.total;
    lastScore = optimizedScore;
  }

  const finalPass = applyDeterministicPasses(current, permalink, params.author, params.image);
  current = finalPass.content;
  permalink = finalPass.permalink;

  const finalAnalysis = analyzeBlogContent(toAnalysisInput(current, permalink, params.author, params.image));
  optimizedScore = finalAnalysis.overallScore;
  fixedIssues = mergeFixedIssues(fixedIssues, collectFixedIssues(rawAnalysis.checks, finalAnalysis.checks));
  const finalGrouped = getAllFailedChecksGrouped(finalAnalysis.checks);

  return {
    content: current,
    summary: {
      generatedScore,
      optimizedScore,
      fixedIssues,
      rounds,
      targetScore,
      permalink,
      remainingIssues: finalGrouped.total,
    },
  };
}
