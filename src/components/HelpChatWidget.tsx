import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "assistant" | "user"; content: string };

const WELCOME: Msg = {
  role: "assistant",
  content:
    "Dobrý deň! Pomôžem vám zorientovať sa v Tendriku. Spýtajte sa napríklad na verejné zákazky, grantové výzvy, radar alebo nastavenia notifikácií.",
};

export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, messages, busy]);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      // Pošleme len posledných 6 správ (bez uvítacej)
      const history = next.filter((m) => m !== WELCOME).slice(-6);
      const { data, error: fnErr } = await supabase.functions.invoke("help-chat", {
        body: { messages: history },
      });
      if (fnErr) {
        // pokús sa vytiahnuť message z odpovede
        let msg = "Nepodarilo sa spojiť s pomocníkom.";
        try {
          const ctx: any = (fnErr as any).context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.message) msg = parsed.message;
          }
        } catch {}
        setError(msg);
      } else if (data?.reply) {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      } else if (data?.message) {
        setError(data.message);
      }
    } catch (e: any) {
      setError(e?.message ?? "Nastala chyba.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Otvoriť pomocníka"
          className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-md bg-primary text-primary-foreground border-2 border-foreground shadow-[4px_4px_0_0_hsl(var(--foreground))] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_hsl(var(--foreground))] transition-all flex items-center justify-center"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Pomocník Tendrik"
          className="fixed bottom-5 right-5 z-40 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-2.5rem))] flex flex-col rounded-md bg-background border-2 border-foreground shadow-[6px_6px_0_0_hsl(var(--foreground))] overflow-hidden"
        >
          <div className="flex items-center justify-between border-b-2 border-foreground bg-foreground text-background px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 bg-primary" aria-hidden="true" />
              <span className="font-display font-bold text-sm uppercase tracking-wider">
                Pomocník
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Zavrieť pomocníka"
              className="h-7 w-7 flex items-center justify-center hover:bg-background/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-3 bg-background"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 text-sm whitespace-pre-line leading-relaxed rounded-md border ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-foreground border-border"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="px-3 py-2 text-sm bg-secondary rounded-md border border-border text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Píšem…
                </div>
              </div>
            )}
            {error && (
              <div className="text-xs text-destructive border border-destructive px-2 py-1.5">
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t-2 border-foreground p-2 flex items-end gap-2 bg-background"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="Napíš otázku…"
              disabled={busy}
              className="flex-1 resize-none text-sm px-2 py-1.5 rounded-md bg-background border border-border focus:outline-none focus:border-foreground disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Odoslať"
              className="h-9 w-9 shrink-0 rounded-md bg-foreground text-background border-2 border-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary hover:border-primary transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
