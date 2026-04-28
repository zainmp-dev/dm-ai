import { redirect } from "next/navigation";

export default function ContentPage() {
  redirect("/pipeline?tab=content");
}
