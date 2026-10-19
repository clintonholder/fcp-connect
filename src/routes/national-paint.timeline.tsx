import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintTimeline } from "@/components/NationalPaintTimeline";

export const Route = createFileRoute("/national-paint/timeline")({
  head: () => ({
    meta: [
      { title: "Project Timeline — National Paint — FCP Connect" },
      { property: "og:title", content: "Project Timeline — National Paint — FCP Connect" },
    ],
  }),
  component: NationalPaintTimeline,
});
