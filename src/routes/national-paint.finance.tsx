import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintFinance } from "@/components/NationalPaintFinance";

export const Route = createFileRoute("/national-paint/finance")({
  head: () => ({
    meta: [
      { title: "Finance — National Paint — FCP Connect" },
      { property: "og:title", content: "Finance — National Paint — FCP Connect" },
    ],
  }),
  component: () => <NationalPaintFinance />,
});
