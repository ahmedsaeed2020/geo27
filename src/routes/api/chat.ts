import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/chat/run-id";
import { DIGIT_ASSISTANT_INSTRUCTIONS } from "@/lib/chat/knowledge.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

const MAX_MESSAGES = 60;
const MAX_BODY_CHARS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Messages per thread in a rolling 10-minute window before the assistant pauses. */
const THREAD_BURST = 30;

async function ownedThread(threadId: unknown, visitorId: unknown): Promise<string | undefined | "limited"> {
  if (typeof threadId !== "string" || typeof visitorId !== "string" || !UUID.test(threadId) || !UUID.test(visitorId)) return undefined;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: thread } = await supabaseAdmin.from("chat_threads").select("id").eq("id", threadId).eq("visitor_id", visitorId).maybeSingle();
  if (!thread) return undefined;
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin.from("chat_messages").select("id", { count: "exact", head: true }).eq("thread_id", thread.id).gte("created_at", since);
  return (count ?? 0) >= THREAD_BURST ? "limited" : thread.id;
}

async function handleChat(request: Request) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return Response.json({ error: "AI is not configured" }, { status: 500 });
  }

  let body: { messages?: UIMessage[]; threadId?: string; visitorId?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages are required" }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES || JSON.stringify(messages).length > MAX_BODY_CHARS) {
    return Response.json({ error: "Conversation is too long; start a new chat" }, { status: 413 });
  }
  // A conversation is saved only when the visitor id owns the thread; others still get an answer, never a write.
  const threadId = await ownedThread(body.threadId, body.visitorId);
  if (threadId === "limited") {
    return Response.json({ error: "Too many messages, please wait a few minutes" }, { status: 429 });
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const modelMessages = await convertToModelMessages(messages);
  const result = streamText({
    model: provider.responses(MODEL),
    system: DIGIT_ASSISTANT_INSTRUCTIONS,
    messages: modelMessages,
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const response = result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: false,
    onFinish: async ({ responseMessage }) => {
      if (!threadId) return;
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const textOf = (m: UIMessage) =>
          m.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("");
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const rows = [
          ...(lastUser ? [{ thread_id: threadId, role: "user", content: textOf(lastUser) }] : []),
          { thread_id: threadId, role: "assistant", content: textOf(responseMessage) },
        ].filter((r) => r.content.trim().length > 0);
        if (rows.length > 0) {
          const { error } = await supabaseAdmin.from("chat_messages").insert(rows);
          if (error) console.error("chat message persist failed", error);
          await supabaseAdmin
            .from("chat_threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", threadId);
        }
      } catch (error) {
        console.error("chat persistence error", error);
      }
    },
  });

  return withLovableAiGatewayRunIdHeader(response, runIdFetch);
}

export const Route = createFileRoute("/api/chat")({
  server: { handlers: { POST: ({ request }) => handleChat(request) } },
});
