import { createFileRoute, notFound } from "@tanstack/react-router";
import { getSeoPage } from "@/lib/seo.functions";
import { SeoLandingPage } from "@/components/SeoLandingPage";
import { getCategory } from "@/lib/seo-catalog";

export const Route = createFileRoute("/zakazky/kategoria/$kategoria")({
  loader: async ({ params }) => {
    if (!getCategory(params.kategoria)) throw notFound();
    const res = await getSeoPage({ data: { page_type: "category", category_slug: params.kategoria, region_slug: null } });
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
  notFoundComponent: NotFoundView,
  errorComponent: ErrorView,
});

function Page() {
  const { page, tenders } = Route.useLoaderData();
  return <SeoLandingPage page={page} tenders={tenders} />;
}

function NotFoundView() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Táto kategória zatiaľ nemá landing stránku</h1>
      <p className="mt-2 text-sm text-muted-foreground">Skúste iný filter alebo si vytvorte vlastný radar.</p>
    </div>
  );
}
function ErrorView({ error }: { error: Error }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Chyba načítania</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  );
}
