import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import Link from "next/link";

export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <section className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <p className="mb-2 font-mono text-6xl font-bold text-amber-accent">
          404
        </p>
        <h1 className="mb-4 font-sans text-2xl font-semibold">
          Page not found
        </h1>
        <p className="mb-8 max-w-md text-fd-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex gap-4">
          <Link
            href="/docs"
            className="inline-flex items-center rounded-xl bg-amber-accent px-6 py-3 text-sm font-bold text-[#0c0a09] transition-colors hover:bg-amber-dark"
          >
            Documentation
          </Link>
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-fd-border px-6 py-3 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
          >
            Home
          </Link>
        </div>
      </section>
    </HomeLayout>
  );
}
