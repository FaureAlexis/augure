import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { BASE_URL } from "@/lib/constants";
import Image from "next/image";
import Link from "next/link";

const features = [
  {
    title: "Filesystem-first",
    desc: "Memory, config, logs: everything is human-readable files. No vector DB, no opaque stores.",
  },
  {
    title: "Proactive",
    desc: "Not just reactive chat. Schedules, monitors, and acts on your behalf 24/7.",
  },
  {
    title: "Secure by default",
    desc: "All execution in Docker containers. Credentials never touch disk.",
  },
  {
    title: "Self-improving",
    desc: "Extracts observations from conversations and builds persistent memory over time.",
  },
  {
    title: "Cost-aware",
    desc: "Per-usage model routing. Cheap models for monitoring, full models for reasoning.",
  },
  {
    title: "Readable codebase",
    desc: "Under 10K lines. A single developer can audit the entire codebase in an afternoon.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Augure",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Linux, macOS",
  description:
    "An open-source personal AI agent that runs 24/7. It sees, learns, and acts on your behalf via Telegram, with Docker sandboxing, persistent memory, and self-improving skills.",
  url: BASE_URL,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: {
    "@type": "Person",
    name: "Alexis Faure",
    url: "https://github.com/FaureAlexis",
  },
  codeRepository: "https://github.com/FaureAlexis/augure",
  license: "https://opensource.org/licenses/MIT",
};

export default function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero */}
      <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(245, 158, 11, 0.08), transparent 70%)",
          }}
        />

        {/* Mascot */}
        <Image
          src="/favicon.svg"
          alt="Augure — Baby Raven"
          width={120}
          height={130}
          className="relative mb-8 drop-shadow-[0_0_40px_rgba(245,158,11,0.2)]"
          priority
        />

        {/* Wordmark */}
        <h1 className="relative mb-4 font-sans text-5xl font-extrabold tracking-[-0.04em] sm:text-6xl">
          augure
        </h1>

        {/* Tagline */}
        <p className="relative mb-2 max-w-lg font-serif text-xl italic text-fd-muted-foreground sm:text-2xl">
          Augure sees. Augure learns. Augure acts.
        </p>
        <p className="relative mb-10 font-serif text-sm text-fd-muted-foreground">
          Your personal AI agent, running 24/7.
        </p>

        {/* CTA */}
        <div className="relative flex gap-4">
          <Link
            href="/docs"
            className="inline-flex items-center rounded-xl bg-amber-accent px-7 py-3 text-sm font-bold text-[#0c0a09] transition-colors hover:bg-amber-dark"
          >
            Get Started
          </Link>
          <Link
            href="https://github.com/FaureAlexis/augure"
            className="inline-flex items-center rounded-xl border border-fd-border px-7 py-3 font-mono text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
          >
            GitHub
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto grid max-w-5xl gap-5 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-amber-accent/20"
          >
            <h3 className="mb-2 font-sans text-base font-semibold tracking-[-0.02em]">
              {f.title}
            </h3>
            <p className="font-serif text-base text-fd-muted-foreground">
              {f.desc}
            </p>
          </div>
        ))}
      </section>
    </HomeLayout>
  );
}
