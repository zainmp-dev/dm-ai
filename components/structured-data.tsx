"use client";

import { useServerInsertedHTML } from "next/navigation";

// Injects JSON-LD structured data into the SSR stream without rendering a
// <script> tag through React's client tree. This avoids the React 19
// "Encountered a script tag while rendering React component" warning while
// still emitting valid `application/ld+json` for crawlers.
export function StructuredData({ data }: { data: unknown }) {
  useServerInsertedHTML(() => (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  ));

  return null;
}
