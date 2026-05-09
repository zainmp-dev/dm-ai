import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/marketing/landing-page";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("flowpilot_token")?.value;
  if (token) {
    redirect("/dashboard");
  }
  return <LandingPage />;
}
