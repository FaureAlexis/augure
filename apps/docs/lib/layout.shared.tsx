import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-3">
          <Image
            src="/favicon.svg"
            alt="Augure"
            width={30}
            height={32}
            className="h-8 w-auto"
          />
          <span className="font-sans text-lg font-bold tracking-[-0.03em]">
            augure
          </span>
        </div>
      ),
      transparentMode: "top",
    },
    githubUrl: "https://github.com/FaureAlexis/augure",
  };
}
