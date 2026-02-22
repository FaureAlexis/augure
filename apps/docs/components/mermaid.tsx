"use client";

import { useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#292524",
    primaryTextColor: "#fafaf9",
    primaryBorderColor: "#44403c",
    lineColor: "#f59e0b",
    secondaryColor: "#1c1917",
    tertiaryColor: "#0c0a09",
    fontFamily: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
    fontSize: "14px",
  },
});

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;

    mermaid.render(id, chart).then(({ svg }) => {
      el.innerHTML = svg;
    });
  }, [chart]);

  return <div ref={ref} className="my-6 flex justify-center [&_svg]:max-w-full" />;
}
