import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LegalFooter } from "@/components/LegalFooter";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
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
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{title}</h1>
        {intro && <p className="mt-3 text-muted-foreground">{intro}</p>}
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mt-8 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 [&_p]:text-foreground/90 [&_a]:text-primary [&_a]:underline">
          {children}
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
