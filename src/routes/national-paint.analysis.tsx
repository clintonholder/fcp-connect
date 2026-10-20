import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintAnalysis } from "@/components/NationalPaintAnalysis";

export const Route = createFileRoute("/national-paint/analysis")({
  head: () => ({
    meta: [
      { title: "Project Analysis — National Paint — FCP Connect" },
      { property: "og:title", content: "Project Analysis — National Paint — FCP Connect" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    job: typeof search.job === "string" ? search.job : undefined,
  }),
  component: () => <NationalPaintAnalysis />,
});
