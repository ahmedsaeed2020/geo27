import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { MessageCircle, X, Plus, ArrowRight, ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { createVisitorThread, getVisitorMessages, listVisitorThreads } from "@/lib/chat.functions";
import { useLocale } from "@/lib/i18n";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";

type Thread = { id: string; title: string | null; updated_at: string };

const VISITOR_KEY = "digit-chat-visitor";
const THREADS_KEY = "digit-chat-threads";

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function getStoredThreadIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(THREADS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function rememberThread(id: string) {
  const ids = getStoredThreadIds();
  if (!ids.includes(id)) localStorage.setItem(THREADS_KEY, JSON.stringify([id, ...ids].slice(0, 20)));
}

const COPY = {
  ar: {
    title: "مساعد Digit",
    subtitle: "اسأل عن الباقات، الموديولات، أو الفوترة الإلكترونية",
    placeholder: "اكتب سؤالك…",
    empty: "أهلًا! كيف أقدر أساعدك اليوم؟",
    thinking: "يفكر…",
    newChat: "محادثة جديدة",
    threads: "المحادثات",
    back: "رجوع",
    error: "تعذّر الإرسال. حاول مرة أخرى.",
  },
  en: {
    title: "Digit Assistant",
    subtitle: "Ask about packages, modules, or e-invoicing",
    placeholder: "Type your question…",
    empty: "Hi! How can I help you today?",
    thinking: "Thinking…",
    newChat: "New chat",
    threads: "Chats",
    back: "Back",
    error: "Could not send. Please try again.",
  },
} as const;

function ChatPanel({ threadId, locale, onError }: { threadId: string; locale: "ar" | "en"; onError: () => void }) {
  const t = COPY[locale];
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { threadId, visitorId: getVisitorId(), locale },
      }),
    [threadId, locale],
  );
  const { messages, sendMessage, status, setMessages } = useChat({
    id: threadId,
    transport,
    onError: () => onError(),
  });
  const busy = status === "submitted" || status === "streaming";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadMessages = useServerFn(getVisitorMessages);
  useEffect(() => {
    let cancelled = false;
    loadMessages({ data: { visitorId: getVisitorId(), threadId } })
      .then((data) => {
        if (cancelled || data.length === 0) return;
        const restored: UIMessage[] = data.map((row, i) => ({
          id: `db-${i}`,
          role: row.role === "user" ? "user" : "assistant",
          parts: [{ type: "text", text: row.content }],
        }));
        setMessages(restored);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [threadId, setMessages, loadMessages]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  const handleSubmit = useCallback(
    (message: { text?: string }) => {
      const text = message.text?.trim();
      if (!text || busy) return;
      sendMessage({ text });
    },
    [busy, sendMessage],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-3 p-3">
          {messages.length === 0 && !busy ? (
            <ConversationEmptyState title={t.empty} description={t.subtitle} />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent
                  className={
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl px-3 py-2 text-sm"
                      : "text-sm text-foreground"
                  }
                >
                  {message.parts
                    .filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p, i) =>
                      message.role === "assistant" ? (
                        <MessageResponse key={i}>{p.text}</MessageResponse>
                      ) : (
                        <span key={i}>{p.text}</span>
                      ),
                    )}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && <Shimmer className="text-sm">{t.thinking}</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t border-border p-2">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea ref={textareaRef} placeholder={t.placeholder} className="min-h-10 text-sm" />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={busy} size="icon-sm" />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

export default function ChatWidget() {
  const locale = useLocale();
  const t = COPY[locale];
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "threads">("chat");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const fetchThreads = useServerFn(listVisitorThreads);
  const startThread = useServerFn(createVisitorThread);
  const loadThreads = useCallback(async () => {
    const ids = getStoredThreadIds().filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20);
    if (ids.length === 0) return;
    try {
      setThreads((await fetchThreads({ data: { visitorId: getVisitorId(), ids } })) as Thread[]);
    } catch {
      /* the thread list is a convenience; the chat itself still works */
    }
  }, [fetchThreads]);

  useEffect(() => {
    if (open) {
      loadThreads();
      if (!activeThread && getStoredThreadIds().length > 0) setView("threads");
    }
  }, [open, loadThreads, activeThread]);

  const createThread = useCallback(async () => {
    let data: { id: string };
    try {
      data = await startThread({ data: { visitorId: getVisitorId(), locale } });
    } catch {
      setError(true);
      return;
    }
    rememberThread(data.id);
    setActiveThread(data.id);
    setView("chat");
    setError(false);
    loadThreads();
  }, [locale, loadThreads, startThread]);

  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div data-chat-widget className="fixed bottom-4 end-4 z-50 flex flex-col items-end gap-3" dir={locale === "ar" ? "rtl" : "ltr"}>
      {open && (
        <div className="flex h-[32rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{t.title}</p>
              <p className="truncate text-xs opacity-80">{t.subtitle}</p>
            </div>
            <div className="flex items-center gap-1">
              {view === "chat" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={() => setView("threads")}
                  aria-label={t.threads}
                >
                  <BackIcon className="size-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={() => setView("chat")}
                  aria-label={t.back}
                >
                  <BackIcon className="size-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {view === "threads" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
              <Button onClick={createThread} className="w-full justify-start gap-2">
                <Plus className="size-4" /> {t.newChat}
              </Button>
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => {
                    setActiveThread(thread.id);
                    setView("chat");
                    setError(false);
                  }}
                  className="rounded-lg border border-border px-3 py-2 text-start text-sm transition-colors hover:bg-accent"
                >
                  <span className="block truncate font-medium">
                    {thread.title || `${t.threads} · ${new Date(thread.updated_at).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US")}`}
                  </span>
                </button>
              ))}
            </div>
          ) : activeThread ? (
            <>
              {error && <p className="bg-destructive/10 px-3 py-1 text-xs text-destructive">{t.error}</p>}
              <ChatPanel key={activeThread} threadId={activeThread} locale={locale} onError={() => setError(true)} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-muted-foreground">{t.empty}</p>
              <Button onClick={createThread} className="gap-2">
                <Plus className="size-4" /> {t.newChat}
              </Button>
            </div>
          )}
        </div>
      )}

      <Button
        size="icon"
        className="size-14 rounded-full shadow-xl"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.title}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </Button>
    </div>
  );
}
