import { createFileRoute } from "@tanstack/react-router";

// DIGIT Assistant streaming endpoint. The handler body (and the server-only module it loads) never ships to the browser.
export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAssistant } = await import("@/lib/ai/assistant.server");
        return handleAssistant(request);
      },
    },
  },
});
