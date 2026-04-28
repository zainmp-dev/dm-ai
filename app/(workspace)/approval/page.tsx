import { redirect } from "next/navigation";

export default function ApprovalRedirect() {
  redirect("/pipeline?tab=approval");
}
