import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintProjects } from "@/components/NationalPaintProjects";

export const Route = createFileRoute("/national-paint/")({
  head: () => ({
    meta: [
      { title: "Projects — National Paint — FCP Connect" },
      { property: "og:title", content: "Projects — National Paint — FCP Connect" },
    ],
  }),
  component: () => <NationalPaintProjects />,
});
