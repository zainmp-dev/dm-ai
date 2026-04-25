import { redirect } from "next/navigation";

// Middleware sends unauthenticated users to /login. This runs when a session cookie is present.
export default function Home() {
  redirect("/dashboard");
}
