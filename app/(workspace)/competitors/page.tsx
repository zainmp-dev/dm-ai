import { redirect } from "next/navigation";

/** Competitor detail URLs live under `/competitors/[id]`; the index routes to the strategy hub. */
export default function CompetitorsIndexPage() {
  redirect("/strategy");
}
