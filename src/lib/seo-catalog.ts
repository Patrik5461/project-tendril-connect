// Kurátorovaný katalóg SEO kategórií (podmnožina CPV divízií).
export type SeoCategory = {
  slug: string;
  name: string;         // Bratislavský rod, singular: "Stavebné práce"
  namePlural: string;   // Pre H1: "Stavebné zákazky"
  cpvPrefix: string;    // 2-miestny CPV prefix
};

export const SEO_CATEGORIES: SeoCategory[] = [
  { slug: "stavebne-prace", name: "Stavebné práce", namePlural: "Stavebné zákazky", cpvPrefix: "45" },
  { slug: "stavebne-materialy", name: "Stavebné materiály", namePlural: "Zákazky na stavebné materiály", cpvPrefix: "44" },
  { slug: "architektonicke-sluzby", name: "Architektonické a inžinierske služby", namePlural: "Architektonické a inžinierske zákazky", cpvPrefix: "71" },
  { slug: "it-sluzby", name: "IT služby a vývoj softvéru", namePlural: "IT zákazky", cpvPrefix: "72" },
  { slug: "softver", name: "Softvér a informačné systémy", namePlural: "Softvérové zákazky", cpvPrefix: "48" },
  { slug: "kancelarska-technika", name: "Kancelárska a výpočtová technika", namePlural: "Zákazky na kancelársku a výpočtovú techniku", cpvPrefix: "30" },
  { slug: "zdravotnicke-zariadenia", name: "Zdravotnícke zariadenia a lieky", namePlural: "Zdravotnícke zákazky", cpvPrefix: "33" },
  { slug: "zdravotne-sluzby", name: "Zdravotnícke a sociálne služby", namePlural: "Zákazky na zdravotnícke služby", cpvPrefix: "85" },
  { slug: "doprava", name: "Dopravné služby", namePlural: "Dopravné zákazky", cpvPrefix: "60" },
  { slug: "dopravne-prostriedky", name: "Dopravné prostriedky", namePlural: "Zákazky na dopravné prostriedky", cpvPrefix: "34" },
  { slug: "upratovanie", name: "Upratovanie a odpadové služby", namePlural: "Zákazky na upratovanie a odpad", cpvPrefix: "90" },
  { slug: "potraviny", name: "Potraviny a nápoje", namePlural: "Zákazky na potraviny", cpvPrefix: "15" },
  { slug: "energie", name: "Energie a palivá", namePlural: "Zákazky na energie a palivá", cpvPrefix: "09" },
  { slug: "poradenske-sluzby", name: "Poradenské a právne služby", namePlural: "Poradenské zákazky", cpvPrefix: "79" },
  { slug: "vzdelavanie", name: "Vzdelávanie a školenia", namePlural: "Zákazky na vzdelávanie", cpvPrefix: "80" },
];

export type SeoRegion = { slug: string; name: string };

export const SEO_REGIONS: SeoRegion[] = [
  { slug: "cele-slovensko", name: "Celé Slovensko" },
  { slug: "bratislavsky-kraj", name: "Bratislavský kraj" },
  { slug: "trnavsky-kraj", name: "Trnavský kraj" },
  { slug: "trenciansky-kraj", name: "Trenčiansky kraj" },
  { slug: "nitriansky-kraj", name: "Nitriansky kraj" },
  { slug: "zilinsky-kraj", name: "Žilinský kraj" },
  { slug: "banskobystricky-kraj", name: "Banskobystrický kraj" },
  { slug: "presovsky-kraj", name: "Prešovský kraj" },
  { slug: "kosicky-kraj", name: "Košický kraj" },
];

export function getCategory(slug: string): SeoCategory | undefined {
  return SEO_CATEGORIES.find((c) => c.slug === slug);
}
export function getRegion(slug: string): SeoRegion | undefined {
  return SEO_REGIONS.find((r) => r.slug === slug);
}
