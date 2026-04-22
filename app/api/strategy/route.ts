import { NextResponse } from "next/server";
import { makeCompetitors, makeStrategy } from "@/lib/mock-data";

export async function POST(req: Request) {
  const body = (await req.json()) as { company?: string };
  const company = body.company?.trim() || "Client Brand";
  await new Promise((resolve) => setTimeout(resolve, 900));
  return NextResponse.json({
    competitors: makeCompetitors(company),
    strategy: makeStrategy(),
  });
}
