import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BlogList } from "@/modules/blog/blog-views";

function BlogListFallback() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-[0.5rem]" />
      ))}
    </div>
  );
}

export default function BlogPostsPage() {
  return (
    <Suspense fallback={<BlogListFallback />}>
      <BlogList />
    </Suspense>
  );
}
