/**
 * TS AI pipeline route — calls OpenRouter only via lib/ai (chat completions).
 * Protected by FLOW_AI_PIPELINE_SECRET when set (Bearer token).
 *
 * SAMPLE REQUEST:
 * POST /api/ai/pipeline
 * Headers: Authorization: Bearer <FLOW_AI_PIPELINE_SECRET> | Content-Type: application/json
 * Body:
 * {
 *   "workspace_id": "ws_demo",
 *   "company_name": "OfficeKit HRMS",
 *   "website": "https://example.com",
 *   "scenario": "HRMS",
 *   "plan": "free",
 *   "calendar_days": 14,
 *   "overrides": { "research": "deepseek/deepseek-v3.2" }
 * }
 *
 * SAMPLE RESPONSE (truncated):
 * { "ok": true, "research": { ... }, "strategy": { ... }, "content": { ... }, "distribution": { ... }, "telemetry": [...] }
 */

import { NextResponse } from "next/server";

import type { PlanTier } from "@/lib/ai/types";
import { OpenRouterChatError } from "@/lib/ai/openrouter-client";
import { runFullPipeline } from "@/lib/agents/pipeline";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.FLOW_AI_PIPELINE_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization")?.trim() ?? "";
    const expected = `Bearer ${secret}`;
    if (auth !== expected) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: "OPENROUTER_API_KEY is not configured on this server.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const companyName = typeof b.company_name === "string" ? b.company_name.trim() : "";
  const website = typeof b.website === "string" ? b.website.trim() : "";
  if (!companyName || !website) {
    return NextResponse.json({ ok: false, error: "company_name and website are required." }, { status: 400 });
  }

  const planRaw = typeof b.plan === "string" ? b.plan.trim().toLowerCase() : "free";
  const plan: PlanTier = planRaw === "pro" ? "pro" : "free";

  const calendarDaysRaw = typeof b.calendar_days === "number" ? b.calendar_days : 14;
  const calendarDays = Math.min(60, Math.max(1, Math.round(calendarDaysRaw)));

  const workspaceId = typeof b.workspace_id === "string" ? b.workspace_id.trim() : undefined;
  const scenario = typeof b.scenario === "string" ? b.scenario : undefined;
  const region = typeof b.region === "string" ? b.region : undefined;

  const overrides =
    b.overrides && typeof b.overrides === "object"
      ? (Object.fromEntries(
          Object.entries(b.overrides as Record<string, unknown>).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>)
      : undefined;

  const competitors = Array.isArray(b.competitors)
    ? b.competitors
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((c) => ({
          name: typeof c.name === "string" ? c.name : "",
          website: typeof c.website === "string" ? c.website : undefined,
          focus: typeof c.focus === "string" ? c.focus : undefined,
        }))
        .filter((c) => c.name.trim())
    : undefined;

  try {
    const result = await runFullPipeline(
      {
        workspaceId: workspaceId ?? null,
        companyName,
        website,
        scenario,
        region,
        competitors,
      },
      {
        workspaceId: workspaceId ?? null,
        plan,
        calendarDays,
        overrides,
        startDateIso: typeof b.start_date_iso === "string" ? b.start_date_iso : undefined,
      },
    );

    return NextResponse.json({
      ok: true,
      workspace_id: workspaceId ?? null,
      plan,
      research: result.research,
      strategy: result.strategy,
      content: result.content,
      distribution: result.distribution,
      telemetry: result.telemetry,
    });
  } catch (e) {
    if (e instanceof OpenRouterChatError) {
      const status = e.status ?? 502;
      return NextResponse.json(
        { ok: false, error: e.message, role: "pipeline" },
        { status: status >= 400 && status < 600 ? status : 502 },
      );
    }
    const message = e instanceof Error ? e.message : "Pipeline failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
