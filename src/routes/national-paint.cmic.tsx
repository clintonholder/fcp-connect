import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintCmic } from "@/components/NationalPaintCmic";

export const Route = createFileRoute("/national-paint/cmic")({
  head: () => ({
    meta: [
      { title: "CMiC — National Paint — FCP Connect" },
      { property: "og:title", content: "CMiC — National Paint — FCP Connect" },
    ],
  }),
  component: () => <NationalPaintCmic />,
});
