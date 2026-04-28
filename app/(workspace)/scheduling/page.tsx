import { redirect } from "next/navigation";

export default function SchedulingRedirect() {
  redirect("/pipeline?tab=scheduling");
}
