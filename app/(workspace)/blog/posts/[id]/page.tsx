import { BlogPostView } from "@/modules/blog/blog-views";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BlogPostPage({ params }: PageProps) {
  const { id } = await params;
  return <BlogPostView postId={id} />;
}
