import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { X, Plus, History, Sparkles, CalendarCheck, FileText, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { createVisitorThread, getVisitorMessages, listVisitorThreads } from "@/lib/chat.functions";
import { localeHref, useLocale } from "@/lib/i18n";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import "@/chat-widget.css";

type Thread = { id: string; title: string | null; updated_at: string };
type Locale = "ar" | "en";

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
    status: "مساعد ذكي · يرد خلال ثوانٍ",
    launcher: "اسأل مساعد Digit",
    placeholder: "اكتب سؤالك عن Digit…",
    hello: "أهلًا بك في Digit",
    intro: "أجيبك عن المنتجات والموديولات والفوترة الإلكترونية، وأساعدك تختار البداية المناسبة لمنشأتك.",
    try: "جرّب أن تسأل",
    thinking: "يكتب الرد…",
    newChat: "محادثة جديدة",
    threads: "محادثاتك السابقة",
    noThreads: "لا توجد محادثات سابقة على هذا الجهاز.",
    back: "العودة إلى المحادثة",
    close: "إغلاق المساعد",
    error: "تعذّر الإرسال. حاول مرة أخرى.",
    demo: "احجز ديمو",
    quote: "اطلب عرض سعر",
    whatsapp: "واتساب",
    note: "إجابات المساعد إرشادية؛ التفاصيل النهائية يؤكدها فريق Digit.",
    untitled: "محادثة",
    suggestions: ["أي منتج من Digit يناسب منشأتي؟", "كيف تدعم Digit الفوترة الإلكترونية؟", "ما الذي تغطيه الموارد البشرية والرواتب؟", "كيف أبدأ وما خطوات التطبيق؟"],
  },
  en: {
    title: "Digit Assistant",
    status: "AI assistant · replies in seconds",
    launcher: "Ask Digit Assistant",
    placeholder: "Ask anything about Digit…",
    hello: "Welcome to Digit",
    intro: "I can answer questions about the products, modules and e-invoicing, and help you pick the right starting point for your company.",
    try: "Try asking",
    thinking: "Writing a reply…",
    newChat: "New chat",
    threads: "Your previous chats",
    noThreads: "No previous chats on this device.",
    back: "Back to the chat",
    close: "Close the assistant",
    error: "Could not send. Please try again.",
    demo: "Book a demo",
    quote: "Request a quote",
    whatsapp: "WhatsApp",
    note: "Answers are guidance; the Digit team confirms the final details.",
    untitled: "Chat",
    suggestions: ["Which Digit product fits my company?", "How does Digit support e-invoicing?", "What do HR and payroll cover?", "How do I get started and what are the steps?"],
  },
} as const;

/** The assistant's mark: the same in the launcher, the header and beside each reply. */
function Mark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span className="cw-mark" data-size={size} aria-hidden="true">
      <Sparkles />
    </span>
  );
}

function Welcome({ locale, onAsk, disabled }: { locale: Locale; onAsk: (text: string) => void; disabled?: boolean }) {
  const t = COPY[locale];
  return (
    <div className="cw-welcome">
      <Mark size="lg" />
      <h3>{t.hello}</h3>
      <p>{t.intro}</p>
      <p className="cw-try">{t.try}</p>
      <ul role="list" className="cw-chips">
        {t.suggestions.map(s => (
          <li key={s}>
            <button type="button" onClick={() => onAsk(s)} disabled={disabled}>
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatPanel({ threadId, locale, onError, initial }: { threadId: string; locale: Locale; onError: () => void; initial?: string | undefined }) {
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
  const sentInitial = useRef(false);

  const loadMessages = useServerFn(getVisitorMessages);
  useEffect(() => {
    // A chat opened from a suggestion starts empty: send the question instead of restoring history.
    if (initial && !sentInitial.current) {
      // Deferred so a development double-mount sends once, on the chat instance that stays mounted.
      const timer = setTimeout(() => {
        sentInitial.current = true;
        sendMessage({ text: initial });
      }, 0);
      return () => clearTimeout(timer);
    }
    let cancelled = false;
    loadMessages({ data: { visitorId: getVisitorId(), threadId } })
      .then(data => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, setMessages, loadMessages]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  const ask = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || busy) return;
      sendMessage({ text: clean });
    },
    [busy, sendMessage],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 px-4 py-4">
          {messages.length === 0 && !busy ? (
            <Welcome locale={locale} onAsk={ask} />
          ) : (
            messages.map(message => (
              <Message key={message.id} from={message.role} className="cw-msg">
                {message.role === "assistant" && <Mark size="sm" />}
                <MessageContent className={message.role === "user" ? "cw-bubble-user" : "cw-bubble-bot"}>
                  {message.parts
                    .filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p, i) => (message.role === "assistant" ? <MessageResponse key={i}>{p.text}</MessageResponse> : <span key={i}>{p.text}</span>))}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && (
            <div className="cw-typing">
              <Mark size="sm" />
              <Shimmer className="text-sm">{t.thinking}</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="cw-compose">
        <PromptInput onSubmit={message => ask(message.text ?? "")} className="cw-input">
          <PromptInputTextarea ref={textareaRef} placeholder={t.placeholder} className="min-h-11 text-sm" />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={busy} size="icon-sm" />
          </PromptInputFooter>
        </PromptInput>
        <p className="cw-note">{t.note}</p>
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
  const [initial, setInitial] = useState<string | undefined>(undefined);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);

  const fetchThreads = useServerFn(listVisitorThreads);
  const startThread = useServerFn(createVisitorThread);
  const loadThreads = useCallback(async () => {
    const ids = getStoredThreadIds().filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20);
    if (ids.length === 0) return;
    try {
      setThreads((await fetchThreads({ data: { visitorId: getVisitorId(), ids } })) as Thread[]);
    } catch {
      /* the thread list is a convenience; the chat itself still works */
    }
  }, [fetchThreads]);

  useEffect(() => {
    if (open) loadThreads();
  }, [open, loadThreads]);

  // Esc closes the panel and returns focus to the launcher.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      launcher.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const createThread = useCallback(
    async (question?: string) => {
      let data: { id: string };
      setStarting(true);
      try {
        data = await startThread({ data: { visitorId: getVisitorId(), locale } });
      } catch {
        setError(true);
        setStarting(false);
        return;
      }
      rememberThread(data.id);
      setInitial(question);
      setActiveThread(data.id);
      setView("chat");
      setError(false);
      setStarting(false);
      loadThreads();
    },
    [locale, loadThreads, startThread],
  );

  const Chevron = locale === "ar" ? ChevronLeft : ChevronRight;
  const dateOf = (iso: string) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB", { day: "numeric", month: "short" });

  return (
    <div data-chat-widget className="cw-root" dir={locale === "ar" ? "rtl" : "ltr"}>
      {open && (
        <section className="cw-panel" role="dialog" aria-label={t.title}>
          <header className="cw-head">
            <Mark />
            <div className="min-w-0 flex-1">
              <p className="cw-title">{t.title}</p>
              <p className="cw-status">
                <span className="cw-dot" aria-hidden="true" />
                {t.status}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="cw-icon" onClick={() => setView(view === "threads" ? "chat" : "threads")} aria-label={view === "threads" ? t.back : t.threads} aria-pressed={view === "threads"}>
              <History className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="cw-icon" onClick={() => void createThread()} aria-label={t.newChat} disabled={starting}>
              <Plus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="cw-icon"
              onClick={() => {
                setOpen(false);
                launcher.current?.focus();
              }}
              aria-label={t.close}
            >
              <X className="size-4" />
            </Button>
          </header>

          <nav className="cw-actions" aria-label={t.title}>
            <a href={localeHref("/demo", locale)} onClick={() => setOpen(false)}>
              <CalendarCheck aria-hidden="true" />
              {t.demo}
            </a>
            <a href={localeHref("/quote", locale)} onClick={() => setOpen(false)}>
              <FileText aria-hidden="true" />
              {t.quote}
            </a>
            <a href="https://wa.me/966595051150" target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" />
              {t.whatsapp}
            </a>
          </nav>

          {view === "threads" ? (
            <div className="cw-threads">
              <p className="cw-threads-title">{t.threads}</p>
              {threads.length === 0 && <p className="cw-empty">{t.noThreads}</p>}
              <ul role="list">
                {threads.map(thread => (
                  <li key={thread.id}>
                    <button
                      type="button"
                      aria-current={thread.id === activeThread ? "true" : undefined}
                      onClick={() => {
                        setInitial(undefined);
                        setActiveThread(thread.id);
                        setView("chat");
                        setError(false);
                      }}
                    >
                      <span className="cw-thread-name">{thread.title || t.untitled}</span>
                      <span className="cw-thread-date">{dateOf(thread.updated_at)}</span>
                      <Chevron aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <Button onClick={() => void createThread()} className="mt-auto w-full gap-2" disabled={starting}>
                <Plus className="size-4" /> {t.newChat}
              </Button>
            </div>
          ) : activeThread ? (
            <>
              {error && <p className="cw-error" role="alert">{t.error}</p>}
              <ChatPanel key={activeThread} threadId={activeThread} locale={locale} initial={initial} onError={() => setError(true)} />
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
              {error && <p className="cw-error mb-3" role="alert">{t.error}</p>}
              <Welcome locale={locale} onAsk={q => void createThread(q)} disabled={starting} />
              <Button onClick={() => void createThread()} variant="outline" className="mt-4 gap-2" disabled={starting}>
                <Plus className="size-4" /> {t.newChat}
              </Button>
            </div>
          )}
        </section>
      )}

      <button ref={launcher} type="button" className="cw-launcher" data-open={open ? "" : undefined} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={open ? t.close : t.launcher}>
        {open ? (
          <span className="cw-launcher-icon">
            <X />
          </span>
        ) : (
          <>
            <Mark />
            <span className="cw-launcher-text">{t.launcher}</span>
          </>
        )}
      </button>
    </div>
  );
}
