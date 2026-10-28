import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Editor } from "@/components/editor/Editor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arabic Calligraphy Studio — Compose Arabic calligraphy" },
      { name: "description", content: "A browser design studio for composing, styling and exporting Arabic calligraphy with correct shaping and diacritics." },
      { property: "og:title", content: "Arabic Calligraphy Studio" },
      { property: "og:description", content: "Compose Arabic calligraphy with real shaping, diacritics, layers and PNG/SVG export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  // The editor relies on browser-only APIs (fonts, canvas measuring, storage).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="flex h-screen items-center justify-center bg-surround text-sm text-muted-foreground">Loading studio…</div>;
  }
  return <Editor />;
}
