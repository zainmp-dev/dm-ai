import { BlogEditor } from "@/modules/blog/blog-editor";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BlogPostEditPage({ params }: PageProps) {
  const { id } = await params;
  return <BlogEditor postId={id} />;
}
