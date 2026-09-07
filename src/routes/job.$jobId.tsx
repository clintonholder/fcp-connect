import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy link support: /job/:id now lives at /project/:id. */
export const Route = createFileRoute("/job/$jobId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/project/$projectId", params: { projectId: params.jobId }, replace: true });
  },
  component: () => null,
});
