/**
 * DIGIT Assistant panel (lazy-loaded on first open). One conversation per simulated user, saved in this browser.
 * Model calls go through /api/assistant; the model's tool calls run here against the permission-scoped store.
 */
import { useChat } from "@ai-sdk/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { DefaultChatTransport, getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithToolCalls, type DynamicToolUIPart, type ToolUIPart, type UIMessage } from "ai";
import { AppWindow, ExternalLink, FileText, ListFilter, RotateCcw, Search, Sigma, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { useLang } from "@/i18n";
import { ASSISTANT_ENDPOINT, MAX_TOOL_STEPS, isAssistantTool, type AssistantContext } from "@/lib/assistant/protocol";
import { historyKey, MAX_SAVED_MESSAGES, setAssistantOpen } from "@/lib/assistant/store";
import { runAssistantTool, type Navigate } from "@/lib/assistant/tools";
import { userRoles, useSessionUser } from "@/lib/session";
import { defaultCompany } from "@/lib/sessionDefaults";
import { useEnterprise } from "@/plugins/enterprise";

const LOGO = "/icons/digit/logo/digit-icon-app.svg";

const S = {
  title: { ar: "مساعد ديجيت", en: "DIGIT Assistant" },
  sub: { ar: "يقرأ بيانات الشاشات والتقارير حسب صلاحياتك", en: "Reads your screens and reports within your permissions" },
  newChat: { ar: "محادثة جديدة", en: "New conversation" },
  close: { ar: "إغلاق", en: "Close" },
  hello: { ar: "كيف أساعدك اليوم؟", en: "How can I help today?" },
  helloSub: { ar: "اسأل عن المبيعات أو المشتريات أو المخزون أو الموظفين أو العملاء — أو اطلب فتح أي شاشة.", en: "Ask about sales, purchasing, stock, employees or customers — or ask me to open any screen." },
  placeholder: { ar: "اكتب سؤالك…", en: "Ask a question…" },
  thinking: { ar: "جارٍ التفكير…", en: "Thinking…" },
  working: { ar: "جارٍ قراءة البيانات…", en: "Reading the data…" },
  retry: { ar: "إعادة المحاولة", en: "Try again" },
  note: { ar: "للقراءة فقط — لا يُنشئ المساعد أو يعدّل أي سجل. تحقّق من الأرقام المهمة.", en: "Read-only — the assistant never creates or changes records. Double-check important figures." },
  stopped: { ar: "توقّف المساعد بعد عدة خطوات. جرّب سؤالاً أكثر تحديداً.", en: "The assistant stopped after several steps. Try a more specific question." },
  params: { ar: "المدخلات", en: "Parameters" },
  result: { ar: "النتيجة", en: "Result" },
  error: { ar: "خطأ", en: "Error" },
} as const;

const SUGGEST: { ar: string; en: string }[] = [
  { ar: "كم إجمالي المبيعات المرحّلة لكل شهر هذا العام؟", en: "What are total submitted sales per month this year?" },
  { ar: "من أعلى ٥ عملاء من حيث قيمة الفواتير؟", en: "Who are the top 5 customers by invoice value?" },
  { ar: "كم عدد الموظفين في كل قسم؟", en: "How many employees are in each department?" },
  { ar: "افتح فواتير المبيعات غير المدفوعة", en: "Open the unpaid sales invoices" },
  { ar: "ما الصفقات المفتوحة في CRM وقيمتها؟", en: "Which CRM deals are open and what are they worth?" },
];

const TOOL_UI: Record<string, { icon: ComponentType<{ className?: string }>; ar: string; en: string }> = {
  find_doctypes: { icon: Search, ar: "تحديد نوع السجل", en: "Finding the record type" },
  query_records: { icon: ListFilter, ar: "قراءة السجلات", en: "Reading records" },
  aggregate_records: { icon: Sigma, ar: "حساب الإجماليات", en: "Calculating totals" },
  get_document: { icon: FileText, ar: "قراءة المستند", en: "Reading the document" },
  open_list: { icon: ExternalLink, ar: "فتح القائمة", en: "Opening the list" },
  open_record: { icon: ExternalLink, ar: "فتح السجل", en: "Opening the record" },
  open_app: { icon: AppWindow, ar: "فتح التطبيق", en: "Opening the app" },
};
const STATUS: Record<string, { ar: string; en: string }> = {
  "input-streaming": { ar: "قيد التحضير", en: "Preparing" },
  "input-available": { ar: "قيد التنفيذ", en: "Running" },
  "output-available": { ar: "تم", en: "Done" },
  "output-error": { ar: "تعذّر", en: "Failed" },
  "output-denied": { ar: "مرفوض", en: "Denied" },
  "approval-requested": { ar: "بانتظار الموافقة", en: "Awaiting approval" },
  "approval-responded": { ar: "تم الرد", en: "Responded" },
};

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function loadHistory(user: string): UIMessage[] {
  try { const raw = localStorage.getItem(historyKey(user)); const arr: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? (arr as UIMessage[]) : []; } catch { return []; }
}
function saveHistory(user: string, msgs: UIMessage[]) {
  try {
    if (!msgs.length) localStorage.removeItem(historyKey(user));
    else localStorage.setItem(historyKey(user), JSON.stringify(msgs.slice(-MAX_SAVED_MESSAGES)));
  } catch { /* storage full: the conversation simply isn't kept after reload */ }
}
/** Tool calls in the latest assistant message (one user question); bounds automatic round-trips. */
function toolSteps(messages: UIMessage[]): number {
  const last = messages[messages.length - 1];
  return last?.role === "assistant" ? last.parts.filter((p) => isToolUIPart(p)).length : 0;
}

export default function AssistantPanel({ open }: { open: boolean }) {
  const user = useSessionUser();
  return <AssistantChat key={user} user={user} open={open} />;
}

function AssistantChat({ user, open }: { user: string; open: boolean }) {
  const lang = useLang();
  const ar = lang === "ar";
  const L = (k: keyof typeof S) => S[k][ar ? "ar" : "en"];
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { apps } = useEnterprise();
  const root = useRef<HTMLElement>(null);

  const ctx: AssistantContext = {
    lang, path, title: typeof document !== "undefined" ? document.title : "", user,
    roles: userRoles(user).slice(0, 12), company: defaultCompany(user), today: todayISO(),
    apps: apps.map((a) => ({ name: a.name, title: ar ? a.title_ar : a.title, home: a.dock.home })),
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const navigate: Navigate = (t) => {
    if (t.kind === "list") void nav({ to: "/app/$app/$doctype", params: { app: t.app, doctype: t.slug }, search: (t.filters?.length ? { filters: JSON.stringify(t.filters) } : {}) as never });
    else if (t.kind === "record") void nav({ to: "/app/$app/$doctype/$name", params: { app: t.app, doctype: t.slug, name: t.name } });
    else void nav({ to: t.path as "/" });
    if (window.matchMedia("(max-width: 767px)").matches) setAssistantOpen(false);
  };
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const [initial] = useState(() => loadHistory(user));
  const transport = useMemo(() => new DefaultChatTransport({
    api: ASSISTANT_ENDPOINT,
    prepareSendMessagesRequest: ({ messages, id }) => ({ body: { id, messages, context: ctxRef.current } }),
  }), []);

  const { messages, sendMessage, status, stop, error, regenerate, setMessages, addToolOutput, clearError } = useChat({
    id: `digit-assistant-${user}`,
    messages: initial,
    transport,
    sendAutomaticallyWhen: ({ messages: m }) => lastAssistantMessageIsCompleteWithToolCalls({ messages: m }) && toolSteps(m) < MAX_TOOL_STEPS,
    onToolCall: async ({ toolCall }) => {
      if (toolCall.dynamic) return;
      const output = isAssistantTool(toolCall.toolName)
        ? await runAssistantTool(toolCall.toolName, toolCall.input, { navigate: (t) => navRef.current(t), apps: ctxRef.current.apps })
        : { error: "unknown_tool" };
      void addToolOutput({ tool: toolCall.toolName as never, toolCallId: toolCall.toolCallId, output: output as never });
    },
  });

  const busy = status === "submitted" || status === "streaming";
  useEffect(() => { if (status === "ready" || status === "error") saveHistory(user, messages); }, [status, messages, user]);

  const focusInput = useCallback(() => { root.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus(); }, []);
  useEffect(() => { if (open && !busy) focusInput(); }, [open, busy, focusInput]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setAssistantOpen(false); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  const ask = (text: string) => { const t = text.trim(); if (!t || busy) return; clearError(); void sendMessage({ text: t }); };
  const submit = (m: PromptInputMessage) => ask(m.text);
  const reset = () => { void stop(); setMessages([]); clearError(); saveHistory(user, []); focusInput(); };

  const last = messages[messages.length - 1];
  const lastHasText = last?.role === "assistant" && last.parts.some((p) => p.type === "text" && p.text.trim());
  const lastIsTool = last?.role === "assistant" && last.parts.length > 0 && isToolUIPart(last.parts[last.parts.length - 1]!);
  const waiting = busy && !lastHasText;
  const stalled = status === "ready" && lastIsTool && toolSteps(messages) >= MAX_TOOL_STEPS;

  return createPortal(
    <aside ref={root} hidden={!open} className="dx-ai-panel" role="complementary" aria-label={L("title")} data-ai-panel dir={ar ? "rtl" : "ltr"} lang={lang}>
      <header className="dx-ai-head">
        <img src={LOGO} alt="" className="dx-ai-logo" />
        <div className="dx-ai-head-text">
          <h2 className="dx-ai-title">{L("title")}</h2>
          <p className="dx-ai-sub">{L("sub")}</p>
        </div>
        <button type="button" className="dx-ai-icon-btn" onClick={reset} title={L("newChat")} aria-label={L("newChat")} disabled={!messages.length && !error}><RotateCcw className="size-4" /></button>
        <button type="button" className="dx-ai-icon-btn" onClick={() => setAssistantOpen(false)} title={L("close")} aria-label={L("close")}><X className="size-4" /></button>
      </header>

      <Conversation className="dx-ai-conv">
        <ConversationContent className="dx-ai-content">
          {messages.length === 0 ? (
            <div className="dx-ai-empty">
              <img src={LOGO} alt="" className="dx-ai-empty-logo" />
              <h3>{L("hello")}</h3>
              <p>{L("helloSub")}</p>
              <div className="dx-ai-suggest">
                {SUGGEST.map((s) => <button key={s.en} type="button" onClick={() => ask(s[ar ? "ar" : "en"])} className="dx-ai-chip">{s[ar ? "ar" : "en"]}</button>)}
              </div>
            </div>
          ) : messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent className={m.role === "user" ? "dx-ai-user" : "dx-ai-bot"} data-no-i18n>
                {m.parts.map((p, i) => {
                  if (p.type === "text") {
                    if (!p.text.trim()) return null;
                    return m.role === "assistant"
                      ? <div key={i} dir="auto" className="dx-ai-md"><MessageResponse controls={false}>{p.text}</MessageResponse></div>
                      : <p key={i} dir="auto" className="whitespace-pre-wrap">{p.text}</p>;
                  }
                  if (isToolUIPart(p)) return <ToolCard key={i} part={p} ar={ar} />;
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
          {waiting && <div className="dx-ai-wait"><Shimmer>{lastIsTool ? L("working") : L("thinking")}</Shimmer></div>}
          {stalled && <p className="dx-ai-alert" role="status">{L("stopped")}</p>}
          {error && !busy && (
            <div className="dx-ai-alert dx-ai-alert-err" role="alert">
              <span>{error.message || L("error")}</span>
              <button type="button" className="dx-ai-chip" onClick={() => { clearError(); void regenerate(); }}>{L("retry")}</button>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="dx-ai-compose">
        <PromptInput onSubmit={submit} className="dx-ai-prompt">
          <PromptInputTextarea placeholder={L("placeholder")} autoFocus dir="auto" aria-label={L("placeholder")} />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={() => void stop()} className="dx-ai-send" aria-label={busy ? (ar ? "إيقاف" : "Stop") : (ar ? "إرسال" : "Send")} />
          </PromptInputFooter>
        </PromptInput>
        <p className="dx-ai-note">{L("note")}</p>
      </div>
    </aside>,
    document.body,
  );
}

function ToolCard({ part, ar }: { part: ToolUIPart | DynamicToolUIPart; ar: boolean }) {
  const name = part.type === "dynamic-tool" ? part.toolName : getToolName(part);
  const ui = TOOL_UI[name] ?? { icon: Search, ar: name, en: name };
  const Icon = ui.icon;
  const st = STATUS[part.state] ?? { ar: part.state, en: part.state };
  return (
    <Tool defaultOpen={false} className="dx-ai-tool">
      <ToolHeader {...(part.type === "dynamic-tool" ? { type: part.type, state: part.state, toolName: part.toolName } : { type: part.type, state: part.state })} title={ar ? ui.ar : ui.en} statusLabel={ar ? st.ar : st.en} icon={<Icon className="size-4 dx-ai-tool-ico" />} />
      <ToolContent>
        <ToolInput input={part.input} label={ar ? S.params.ar : S.params.en} />
        <ToolOutput output={part.output} errorText={part.errorText} label={ar ? S.result.ar : S.result.en} errorLabel={ar ? S.error.ar : S.error.en} />
      </ToolContent>
    </Tool>
  );
}
