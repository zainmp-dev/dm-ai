import { BlogShell } from "@/modules/blog/blog-views";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <BlogShell>{children}</BlogShell>;
}
