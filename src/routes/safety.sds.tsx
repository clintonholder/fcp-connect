import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { SafetyDocumentList } from "@/components/SafetyDocumentList";

export const Route = createFileRoute("/safety/sds")({
  head: () => ({
    meta: [
      { title: "SDS / MSDS — FCP Connect" },
      { property: "og:title", content: "SDS / MSDS — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <SafetyDocumentList heading="SDS / MSDS" categories={["sds"]} />
    </RequireAuth>
  ),
});
