import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintRevenue } from "@/components/NationalPaintRevenue";

export const Route = createFileRoute("/national-paint/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue — National Paint — FCP Connect" },
      { property: "og:title", content: "Revenue — National Paint — FCP Connect" },
    ],
  }),
  component: NationalPaintRevenue,
});
