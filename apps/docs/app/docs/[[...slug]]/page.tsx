import { source } from "@/lib/source";
import { BASE_URL } from "@/lib/constants";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/mdx-components";
import { createRelativeLink } from "fumadocs-ui/mdx";

function buildCanonical(slug?: string[]): string {
  const path = slug?.join("/") ?? "";
  return `${BASE_URL}/docs${path ? `/${path}` : ""}`;
}

function buildJsonLd(title: string, description: string | undefined, url: string, slugParts: string[]) {
  const breadcrumbItems: Array<Record<string, unknown>> = [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
    { "@type": "ListItem", position: 2, name: "Docs", item: `${BASE_URL}/docs` },
  ];

  for (let i = 0; i < slugParts.length; i++) {
    const name = slugParts[i].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const isLast = i === slugParts.length - 1;
    const entry: Record<string, unknown> = {
      "@type": "ListItem",
      position: i + 3,
      name,
    };
    // Google recommends omitting `item` on the last breadcrumb (current page)
    if (!isLast) {
      entry.item = `${BASE_URL}/docs/${slugParts.slice(0, i + 1).join("/")}`;
    }
    breadcrumbItems.push(entry);
  }

  const article = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description: description ?? `${title} — Augure documentation`,
    url,
    author: { "@type": "Person", name: "Alexis Faure", url: "https://github.com/FaureAlexis" },
    publisher: { "@type": "Organization", name: "Augure", url: BASE_URL },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  };

  return { article, breadcrumb };
}

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const slugParts = params.slug ?? [];
  const canonical = buildCanonical(params.slug);
  const jsonLd = buildJsonLd(page.data.title, page.data.description, canonical, slugParts);

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.article) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.breadcrumb) }}
      />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const ogParams = new URLSearchParams({ title: page.data.title });
  if (page.data.description) {
    ogParams.set("description", page.data.description);
  }

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: buildCanonical(params.slug),
    },
    openGraph: {
      images: [`/api/og?${ogParams.toString()}`],
    },
  };
}
