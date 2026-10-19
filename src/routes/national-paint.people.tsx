import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintPlaceholder } from "@/components/NationalPaintPlaceholder";

export const Route = createFileRoute("/national-paint/people")({
  head: () => ({
    meta: [
      { title: "People and crews — National Paint — FCP Connect" },
      { property: "og:title", content: "People and crews — National Paint — FCP Connect" },
    ],
  }),
  component: () => <NationalPaintPlaceholder title="People and crews" />,
});
