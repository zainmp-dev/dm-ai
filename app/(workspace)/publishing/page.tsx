import { redirect } from "next/navigation";

export default function PublishingRedirect() {
  redirect("/pipeline?tab=publishing");
}
