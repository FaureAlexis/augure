import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { BASE_URL } from "@/lib/constants";
import { statSync } from "node:fs";
import { join } from "node:path";

const CONTENT_DIR = join(process.cwd(), "content/docs");

function getFileModTime(path: string): Date {
  try {
    return statSync(path).mtime;
  } catch {
    return new Date();
  }
}

function getContentModTime(slug: string): Date {
  if (!slug) {
    return getFileModTime(join(CONTENT_DIR, "index.mdx"));
  }

  const paths = [
    join(CONTENT_DIR, `${slug}.mdx`),
    join(CONTENT_DIR, slug, "index.mdx"),
  ];

  for (const p of paths) {
    try {
      return statSync(p).mtime;
    } catch {
      // file not found, try next
    }
  }

  return new Date();
}

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = source.getPages().map((page) => {
    const slug = page.url.replace(/^\/docs\/?/, "");
    return {
      url: `${BASE_URL}${page.url}`,
      lastModified: getContentModTime(slug),
    };
  });

  return [
    {
      url: BASE_URL,
      lastModified: getFileModTime(join(process.cwd(), "app/page.tsx")),
    },
    ...docs,
  ];
}
