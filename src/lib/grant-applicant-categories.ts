// Categorization of Slovak legal-form / applicant-type names into 3 buckets
// used across the /granty listing and card badges.

export type ApplicantCategory = "podnikatelia" | "verejny" | "neziskovky";

const PODNIKATELIA = new Set<string>([
  "Akciová spoločnosť",
  "Spoločnosť s ručením obmedzeným",
  "Komanditná spoločnosť",
  "Verejná obchodná spoločnosť",
  "Jednoduchá spoločnosť na akcie",
  "Družstvo",
  "Iné družstvo",
  "Európska spoločnosť",
  "Európske družstvo",
  "Európske zoskupenie hospodárskych záujmov",
  "Spoločný podnik",
  "Odštepný závod alebo iná organizačná zložka podniku zapisujúca sa do obchodného registra",
  "Podnik alebo hospodárske zariadenie združenia",
  "Zahraničná osoba, právnická osoba so sídlom mimo územia SR",
  "Zahraničná osoba, fyzická osoba s bydliskom mimo územia SR",
]);

const VEREJNY = new Set<string>([
  "Rozpočtová organizácia",
  "Príspevková organizácia",
  "Obec (obecný úrad), mesto (mestský úrad)",
  "Samosprávny kraj (úrad samosprávneho kraja)",
  "Štátny podnik",
  "Verejnoprávna inštitúcia",
  "Iná organizácia verejnej správy",
  "Verejná výskumná inštitúcia",
  "Banka-štátny peňažný ústav",
  "Národná banka Slovenska",
  "Sociálna a zdravotné poisťovne",
  "Európske zoskupenie územnej spolupráce",
  "Zastupiteľské orgány iných štátov",
  "Zastúpenie zahraničnej právnickej osoby",
  "Miestna jednotka bez právnej spôsobilosti",
  "Komora (s výnimkou profesných komôr)",
  "Komoditná burza",
  "Doplnková dôchodková poisťovňa",
  "Fondy",
]);

const NEZISKOVKY = new Set<string>([
  "Nezisková organizácia",
  "Nezisková organizácia poskytujúca všeobecne prospešné služby",
  "Nadácia",
  "Neinvestičný fond",
  "Cirkevná organizácia",
  "Združenie (zväz, spolok, spoločnosť, klub ai.)",
  "Záujmové združenie právnických osôb",
  "Záujmové združenie fyzických osôb bez právnej spôsobilosti",
  "Záujmové združenie",
  "Organizačná jednotka združenia",
  "Stavovská organizácia - profesná komora",
  "Politická strana, politické hnutie",
  "Spoločenstvá vlastníkov pozemkov, bytov a pod.",
  "Pozemkové spoločenstvo",
  "Poľovnícka organizácia",
  "Medzinárodné organizácie a združenia",
  "Zahraničné kultúrne, informačné stredisko, rozhlasová, tlačová a televízna agentúra",
]);

export function classifyApplicantName(name: string | null | undefined): ApplicantCategory | null {
  if (!name) return null;
  const n = name.trim();
  if (PODNIKATELIA.has(n)) return "podnikatelia";
  if (VEREJNY.has(n)) return "verejny";
  if (NEZISKOVKY.has(n)) return "neziskovky";
  // Heuristics for names not in the fixed list (e.g. long "Podnikateľ-fyzická osoba…" variants)
  if (/^Podnikateľ-/i.test(n)) return "podnikatelia";
  if (/hospodáriaci roľník/i.test(n)) return "podnikatelia";
  if (/^Slobodné povolanie/i.test(n)) return "podnikatelia";
  if (/^Fyzická osoba-príležitostne činná/i.test(n)) return "podnikatelia";
  return null;
}

/** Given a grant_calls.opravneny_ziadatel JSON array, return the set of buckets it targets. */
export function categoriesForGrant(opravneny_ziadatel: unknown): Set<ApplicantCategory> {
  const set = new Set<ApplicantCategory>();
  if (!Array.isArray(opravneny_ziadatel)) return set;
  for (const item of opravneny_ziadatel) {
    const nazov = (item as { nazov?: string } | null)?.nazov;
    const c = classifyApplicantName(nazov);
    if (c) set.add(c);
  }
  return set;
}

/** Map company_profile.pravna_forma → default applicant category for that user. */
export function defaultCategoryFromLegalForm(pravna_forma: string | null | undefined): ApplicantCategory | null {
  if (!pravna_forma) return null;
  const s = pravna_forma.toLowerCase();
  if (/(s\.?\s*r\.?\s*o\.?|spoločnosť s ručením)/i.test(pravna_forma)) return "podnikatelia";
  // „Akc. spol." je zápis z číselníka právnych foriem registeruz.
  if (/\ba\.?\s*s\.?\b|akciov|akc\./i.test(pravna_forma)) return "podnikatelia";
  if (/živnost|szčo|fyzick[áa] osoba|podnikateľ/i.test(pravna_forma)) return "podnikatelia";
  if (/družstv|komandit|verejná obchodn|j\.?\s*s\.?\s*a\.?/i.test(pravna_forma)) return "podnikatelia";
  if (/obec|mesto|samospráv|rozpočtov|príspevkov|štátn|ministerstv|verejnoprávn/i.test(s))
    return "verejny";
  if (/neziskov|nadáci|občianske združenie|združenie|cirkev|spolok/i.test(s)) return "neziskovky";
  return null;
}

export const CATEGORY_LABEL: Record<ApplicantCategory, string> = {
  podnikatelia: "Podnikatelia",
  verejny: "Samospráva a verejný sektor",
  neziskovky: "Neziskovky a školy",
};

export const CATEGORY_SHORT: Record<ApplicantCategory, string> = {
  podnikatelia: "Podnikatelia",
  verejny: "Verejný sektor",
  neziskovky: "Neziskovky",
};
