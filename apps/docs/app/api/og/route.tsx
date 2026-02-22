import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = searchParams.get("title") ?? "Documentation";
  const description = searchParams.get("description") ?? "";

  const [dmSansBold, dmSansRegular, svgRaw] = await Promise.all([
    readFile(join(process.cwd(), "assets/DM_Sans-Bold.ttf")),
    readFile(join(process.cwd(), "assets/DM_Sans-Regular.ttf")),
    readFile(join(process.cwd(), "public/favicon.svg"), "base64"),
  ]);

  const mascotSrc = `data:image/svg+xml;base64,${svgRaw}`;

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0c0a09",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 80px",
          position: "relative",
        }}
      >
        {/* Amber glow top-left */}
        <div
          style={{
            position: "absolute",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            background:
              "radial-gradient(ellipse 40% 40% at 15% 20%, rgba(245, 158, 11, 0.08), transparent 70%)",
          }}
        />

        {/* Top: mascot + brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <img src={mascotSrc} height="36" />
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#f59e0b",
              fontFamily: "DM Sans",
              letterSpacing: "-0.03em",
            }}
          >
            augure
          </span>
          <span
            style={{
              fontSize: 20,
              color: "#44403c",
              fontFamily: "DM Sans",
            }}
          >
            /
          </span>
          <span
            style={{
              fontSize: 20,
              color: "#a8a29e",
              fontFamily: "DM Sans",
            }}
          >
            docs
          </span>
        </div>

        {/* Center: title + description */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h1
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#fafaf9",
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              fontFamily: "DM Sans",
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              style={{
                fontSize: 26,
                color: "#a8a29e",
                margin: 0,
                lineHeight: 1.4,
                fontFamily: "DM Sans",
                maxWidth: "900px",
              }}
            >
              {description}
            </p>
          )}
        </div>

        {/* Bottom: CTA */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#f59e0b",
              fontFamily: "DM Sans",
            }}
          >
            Read more at augure.dev
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "DM Sans",
          data: dmSansBold,
          style: "normal",
          weight: 700,
        },
        {
          name: "DM Sans",
          data: dmSansRegular,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
