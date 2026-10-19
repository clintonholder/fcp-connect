import { createFileRoute } from "@tanstack/react-router";
import { NationalPaintPeople } from "@/components/NationalPaintPeople";

export const Route = createFileRoute("/national-paint/people")({
  head: () => ({
    meta: [
      { title: "People and crews — National Paint — FCP Connect" },
      { property: "og:title", content: "People and crews — National Paint — FCP Connect" },
    ],
  }),
  component: NationalPaintPeople,
});
