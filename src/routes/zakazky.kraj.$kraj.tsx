import { createFileRoute, notFound } from "@tanstack/react-router";
import { getSeoPage } from "@/lib/seo.functions";
import { SeoLandingPage } from "@/components/SeoLandingPage";
import { getRegion } from "@/lib/seo-catalog";

export const Route = createFileRoute("/zakazky/kraj/$kraj")({
  loader: async ({ params }) => {
    if (!getRegion(params.kraj)) throw notFound();
    const res = await getSeoPage({
      data: { page_type: "region", category_slug: null, region_slug: params.kraj },
    });
    if (!res) throw notFound();
    return res;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Zákazky – Tendrik" }, { name: "robots", content: "noindex" }] };
    return {
      meta: [
        { title: loaderData.page.title },
        { name: "description", content: loaderData.page.description },
        { property: "og:title", content: loaderData.page.title },
        { property: "og:description", content: loaderData.page.description },
        { property: "og:type", content: "website" },
      ],
    };
  },
  component: Page,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Táto stránka zatiaľ nie je dostupná</h1>
      <p className="mt-2 text-sm text-muted-foreground">V tomto kraji momentálne nie sú aktívne zákazky.</p>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Chyba načítania</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

function Page() {
  const { page, tenders } = Route.useLoaderData();
  return <SeoLandingPage page={page} tenders={tenders} />;
}
