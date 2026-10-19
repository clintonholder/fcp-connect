import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintDashboard } from "@/components/NationalPaintDashboard";

export const Route = createFileRoute("/national-paint/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — National Paint — FCP Connect" },
      { property: "og:title", content: "Dashboard — National Paint — FCP Connect" },
    ],
  }),
  component: NationalPaintDashboard,
});
