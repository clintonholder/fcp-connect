import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintPlaceholder } from "@/components/NationalPaintPlaceholder";

export const Route = createFileRoute("/national-paint/capacity")({
  head: () => ({
    meta: [
      { title: "Crew Capacity — National Paint — FCP Connect" },
      { property: "og:title", content: "Crew Capacity — National Paint — FCP Connect" },
    ],
  }),
  component: () => <NationalPaintPlaceholder title="Crew Capacity" />,
});
