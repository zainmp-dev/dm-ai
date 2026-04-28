const storageKey = (id: string) => `fp-competitor-view:${id}`;

export type CompetitorViewCachePayload = {
  id: string;
  name: string;
  website: string;
  domain: string;
  positioning: string;
  marketRank: string;
  marketGap: string;
  marketingPurpose: string;
  strengths: string[];
  weaknesses: string[];
  source: "Setup" | "Generated";
};

export type CompetitorViewCacheEntry = CompetitorViewCachePayload & {
  viewedAt: string;
};

export function stashCompetitorView(payload: CompetitorViewCachePayload): void {
  if (typeof window === "undefined") return;
  const viewedAt = new Date().toISOString();
  try {
    window.sessionStorage.setItem(storageKey(payload.id), JSON.stringify({ ...payload, viewedAt }));
  } catch {
    /* quota or private mode */
  }
}

export function readCompetitorView(id: string): CompetitorViewCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CompetitorViewCacheEntry> & { id?: string; viewedAt?: string };
    if (!parsed || parsed.id !== id || !parsed.viewedAt) return null;
    return {
      id: parsed.id,
      name: parsed.name ?? "",
      website: parsed.website ?? "",
      domain: parsed.domain ?? "",
      positioning: parsed.positioning ?? "",
      marketRank: parsed.marketRank ?? "",
      marketGap: parsed.marketGap ?? "",
      marketingPurpose: parsed.marketingPurpose ?? "",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      source: parsed.source === "Setup" ? "Setup" : "Generated",
      viewedAt: parsed.viewedAt,
    };
  } catch {
    return null;
  }
}
