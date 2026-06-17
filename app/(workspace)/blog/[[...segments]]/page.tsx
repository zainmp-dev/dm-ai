import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BlogClicked, BlogDashboard, BlogList, BlogPostView } from "@/modules/blog/blog-views";
import { BlogEditor } from "@/modules/blog/blog-editor";

function BlogListFallback() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-2xl" />
      ))}
    </div>
  );
}

type PageProps = {
  params: Promise<{ segments?: string[] }>;
};

export default async function BlogRoutePage({ params }: PageProps) {
  const { segments = [] } = await params;

  if (segments.length === 0) {
    return <BlogDashboard />;
  }

  if (segments.length === 1 && segments[0] === "clicks") {
    return <BlogClicked />;
  }

  if (segments.length === 1 && segments[0] === "posts") {
    return (
      <Suspense fallback={<BlogListFallback />}>
        <BlogList />
      </Suspense>
    );
  }

  if (segments.length === 2 && segments[0] === "posts" && segments[1] === "create") {
    return <BlogEditor />;
  }

  if (segments.length === 2 && segments[0] === "posts") {
    return <BlogPostView postId={segments[1]} />;
  }

  if (segments.length === 3 && segments[0] === "posts" && segments[2] === "edit") {
    return <BlogEditor postId={segments[1]} />;
  }

  return <BlogDashboard />;
}
