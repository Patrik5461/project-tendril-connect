import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { LegalFooter } from "@/components/LegalFooter";
import { Mail, Phone, MapPin } from "lucide-react";

export const Route = createFileRoute("/kontakt")({
  head: () => ({
    meta: [
      { title: "Kontakt – Tendrik" },
      { name: "description", content: "Kontaktujte Tobify s. r. o., prevádzkovateľa služby Tendrik.sk. E-mail info@tendrik.sk, tel. +421 907 702 422." },
    ],
    links: [{ rel: "canonical", href: "https://www.tendrik.sk/kontakt" }],
  }),
  component: KontaktPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Zadajte meno").max(100),
  email: z.string().trim().email("Neplatný e-mail").max(255),
  message: z.string().trim().min(5, "Napíšte správu").max(2000),
});

function KontaktPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Formulár obsahuje chyby");
      return;
    }
    setSending(true);
    try {
      const subject = encodeURIComponent(`Kontakt z tendrik.sk – ${parsed.data.name}`);
      const body = encodeURIComponent(
        `Od: ${parsed.data.name} <${parsed.data.email}>\n\n${parsed.data.message}`
      );
      window.location.href = `mailto:info@tendrik.sk?subject=${subject}&body=${body}`;
      toast.success("Otváram e-mailového klienta…");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display font-bold text-xl">
            <span className="inline-flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground font-display font-bold">T</span>
            Tendrik
          </Link>
          <Link to="/" className="eyebrow text-muted-foreground hover:text-foreground">← Späť na úvod</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Kontakt</h1>
        <p className="mt-3 text-muted-foreground">
          Radi vám pomôžeme. Píšte, volajte, alebo vyplňte formulár nižšie.
        </p>

        <div className="mt-10 grid gap-10 md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-6">
            <div>
              <div className="eyebrow text-foreground">Prevádzkovateľ</div>
              <p className="mt-2 font-semibold">Tobify s. r. o.</p>
              <p className="text-sm text-muted-foreground">
                IČO: 56607016<br />
                DIČ: 2122358579<br />
                IČ DPH: SK2122358579
              </p>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary mt-0.5" />
              <div className="text-sm">
                Športová 707/43<br />
                919 26 Zavar<br />
                Slovenská republika
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5" />
              <a href="mailto:info@tendrik.sk" className="text-sm hover:text-primary">info@tendrik.sk</a>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-primary mt-0.5" />
              <a href="tel:+421907702422" className="text-sm hover:text-primary">+421 907 702 422</a>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-6">
            <h2 className="font-display text-xl font-bold">Napíšte nám</h2>
            <div>
              <Label htmlFor="name">Meno</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} />
            </div>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={255} />
            </div>
            <div>
              <Label htmlFor="message">Správa</Label>
              <Textarea id="message" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required maxLength={2000} />
            </div>
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? "Odosielam…" : "Odoslať správu"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Odoslaním súhlasíte so spracovaním údajov podľa <Link to="/pravne/gdpr" className="underline">GDPR</Link>.
            </p>
          </form>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
