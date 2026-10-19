import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintPlaceholder } from "@/components/NationalPaintPlaceholder";

export const Route = createFileRoute("/national-paint/finance")({
  head: () => ({
    meta: [
      { title: "Finance — National Paint — FCP Connect" },
      { property: "og:title", content: "Finance — National Paint — FCP Connect" },
    ],
  }),
  component: () => <NationalPaintPlaceholder title="Finance" />,
});
