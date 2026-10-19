import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintPlaceholder } from "@/components/NationalPaintPlaceholder";

export const Route = createFileRoute("/national-paint/cmic")({
  head: () => ({
    meta: [
      { title: "CMiC — National Paint — FCP Connect" },
      { property: "og:title", content: "CMiC — National Paint — FCP Connect" },
    ],
  }),
  component: () => <NationalPaintPlaceholder title="CMiC" />,
});
