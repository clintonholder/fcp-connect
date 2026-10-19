import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintPlaceholder } from "@/components/NationalPaintPlaceholder";

export const Route = createFileRoute("/national-paint/timeline")({
  head: () => ({
    meta: [
      { title: "Project Timeline — National Paint — FCP Connect" },
      { property: "og:title", content: "Project Timeline — National Paint — FCP Connect" },
    ],
  }),
  component: () => <NationalPaintPlaceholder title="Project Timeline" />,
});
