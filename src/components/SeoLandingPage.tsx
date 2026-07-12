import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { Building2, Calendar, MapPin, Tag, ArrowRight, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEO_CATEGORIES, SEO_REGIONS } from "@/lib/seo-catalog";

export type SeoTender = {
  id: string;
  title: string;
  contracting_authority: string | null;
  cpv_code: string | null;
  region: string | null;
  country: string | null;
  deadline: string | null;
  estimated_value: number | null;
  currency: string | null;
  source: string | null;
};

export type SeoPageRow = {
  id: string;
  page_type: "category" | "region" | "category_region";
  category_slug: string | null;
  region_slug: string | null;
  region_name: string | null;
  h1: string;
  intro_text: string;
  active_tenders_count: number;
};

function fmtValue(v: number | null, cur: string | null) {
  if (!v) return null;
  const c = cur ?? "EUR";
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(v);
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  try { return format(parseISO(iso), "d. M. yyyy"); } catch { return null; }
}

export function SeoLandingPage({ page, tenders }: { page: SeoPageRow; tenders: SeoTender[] }) {
  const currentCat = page.category_slug;
  const currentReg = page.region_slug;

  // Súvisiace odkazy
  const relatedCats = SEO_CATEGORIES.filter((c) => c.slug !== currentCat).slice(0, 6);
  const relatedRegs = SEO_REGIONS.filter((r) => r.slug !== currentReg && r.slug !== "cele-slovensko").slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="text-xs text-muted-foreground mb-4">
        <Link to="/" className="hover:underline">Tendrik</Link>
        <span className="mx-2">/</span>
        <span>Zákazky</span>
      </nav>

      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
        {page.h1}
      </h1>

      <p className="mt-4 text-muted-foreground max-w-3xl leading-relaxed">
        {page.intro_text}
      </p>

      <div className="mt-4 text-sm">
        <span className="inline-flex items-center gap-2 px-3 py-1 border border-primary/30 text-primary bg-primary/5">
          <span className="font-semibold">{page.active_tenders_count}</span> aktívnych zákaziek
        </span>
      </div>

      {/* CTA */}
      <div className="mt-8 border-l-4 border-primary bg-primary/5 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Bell className="h-4 w-4 text-primary" /> Chcete tieto zákazky dostávať e-mailom?
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Zaregistrujte sa zadarmo. Prvé 2 mesiace bez platby, potom 4,99&nbsp;€/mes.
          </p>
        </div>
        <Link to="/auth" search={{ mode: "signup" }}>
          <Button>Vytvoriť radar zadarmo <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </Link>
      </div>

      {/* Zoznam zákaziek */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold mb-4">Aktuálne zákazky</h2>
        {tenders.length === 0 ? (
          <div className="border border-dashed p-6 text-sm text-muted-foreground">
            Momentálne nie sú v tejto kombinácii žiadne aktívne zákazky. Nastavte si radar a dostaneme vám ich e-mailom hneď, ako pribudnú.
          </div>
        ) : (
          <ul className="divide-y border">
            {tenders.map((t) => (
              <li key={t.id} className="p-4 hover:bg-muted/40">
                <Link to="/zakazka/$id" params={{ id: t.id }} className="block">
                  <div className="font-medium text-foreground hover:text-primary line-clamp-2">
                    {t.title}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {t.contracting_authority && (
                      <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{t.contracting_authority}</span>
                    )}
                    {t.region && (
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{t.region}</span>
                    )}
                    {t.cpv_code && (
                      <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" />CPV {t.cpv_code}</span>
                    )}
                    {t.deadline && (
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />do {fmtDate(t.deadline)}</span>
                    )}
                    {fmtValue(t.estimated_value, t.currency) && (
                      <span className="font-medium text-foreground">{fmtValue(t.estimated_value, t.currency)}</span>
                    )}
                    {t.source && <span className="uppercase">{t.source}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Súvisiace stránky */}
      <section className="mt-12 grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Ďalšie kategórie</h2>
          <ul className="space-y-1 text-sm">
            {relatedCats.map((c) => (
              <li key={c.slug}>
                <Link
                  to="/zakazky/kategoria/$kategoria"
                  params={{ kategoria: c.slug }}
                  className="text-primary hover:underline"
                >
                  {c.namePlural}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Podľa krajov</h2>
          <ul className="space-y-1 text-sm">
            {relatedRegs.map((r) => (
              <li key={r.slug}>
                <Link
                  to="/zakazky/kraj/$kraj"
                  params={{ kraj: r.slug }}
                  className="text-primary hover:underline"
                >
                  Zákazky – {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
