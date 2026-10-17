import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { SafetyDocumentList } from "@/components/SafetyDocumentList";

export const Route = createFileRoute("/safety/first-aid")({
  head: () => ({
    meta: [
      { title: "First aid — FCP Connect" },
      { property: "og:title", content: "First aid — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <SafetyDocumentList heading="First aid" categories={["first_aid", "emergency"]} />
    </RequireAuth>
  ),
});
