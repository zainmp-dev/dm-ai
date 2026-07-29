export type BlogEditorPreviewSnapshot = {
  title: string;
  author: string;
  content: string;
  metaDescription: string;
  image: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
  slug: string;
  returnPath: string;
  savedAt: string;
};

const STORAGE_KEY_PREFIX = "blog-editor-preview";

function storageKey(workspaceId: string | null): string {
  return `${STORAGE_KEY_PREFIX}:${workspaceId ?? "default"}`;
}

export function saveBlogEditorPreview(
  snapshot: BlogEditorPreviewSnapshot,
  workspaceId: string | null,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(storageKey(workspaceId), JSON.stringify(snapshot));
}

export function loadBlogEditorPreview(workspaceId: string | null): BlogEditorPreviewSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(storageKey(workspaceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BlogEditorPreviewSnapshot;
  } catch {
    return null;
  }
}

/** Restore editor only when returning from preview to the same create/edit route. */
export function loadBlogEditorPreviewForPath(
  workspaceId: string | null,
  returnPath: string,
): BlogEditorPreviewSnapshot | null {
  const snapshot = loadBlogEditorPreview(workspaceId);
  if (!snapshot || snapshot.returnPath !== returnPath) return null;
  return snapshot;
}

export function clearBlogEditorPreview(workspaceId: string | null): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(storageKey(workspaceId));
}

export const BLOG_EDITOR_PREVIEW_PATH = "/blog/posts/preview";
