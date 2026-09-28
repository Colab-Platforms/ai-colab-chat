"use client";

import { useParams } from "next/navigation";
// Imported by path, not via the feature index — see index.ts.
import { StandalonePreview } from "@/features/code-workspace/components/StandalonePreview";

// Full-screen project preview opened from the code panel's "Open in a new tab".
export default function CodePreviewPage() {
  const params = useParams();
  return <StandalonePreview projectId={Number(params.id)} />;
}
