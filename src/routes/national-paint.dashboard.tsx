import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintPlaceholder } from "@/components/NationalPaintPlaceholder";

export const Route = createFileRoute("/national-paint/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — National Paint — FCP Connect" },
      { property: "og:title", content: "Dashboard — National Paint — FCP Connect" },
    ],
  }),
  component: () => <NationalPaintPlaceholder title="Dashboard" />,
});
