import { BlogShell } from "@/modules/blog/blog-views";
import "@/modules/blog/blog-officekit.css";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <BlogShell>{children}</BlogShell>;
}
