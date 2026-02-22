import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt =
  "Augure — Your Personal AI Agent That Sees, Learns & Acts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Amber glow */}
        <div
          style={{
            position: "absolute",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            background:
              "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(245, 158, 11, 0.15), transparent 70%)",
          }}
        />

        {/* Mascot */}
        <img src={mascotSrc} height="180" style={{ marginBottom: "20px" }} />

        {/* Brand wordmark */}
        <h1
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#f59e0b",
            margin: 0,
            fontFamily: "DM Sans",
            letterSpacing: "-0.04em",
          }}
        >
          augure
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontSize: 26,
            color: "#a8a29e",
            margin: 0,
            marginTop: "12px",
            fontFamily: "DM Sans",
          }}
        >
          Your personal AI agent, running 24/7.
        </p>

        {/* CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "32px",
            padding: "12px 28px",
            background: "rgba(245, 158, 11, 0.12)",
            borderRadius: "9999px",
            border: "1px solid rgba(245, 158, 11, 0.25)",
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#f59e0b",
              fontFamily: "DM Sans",
            }}
          >
            Get started at augure.dev
          </span>
        </div>
      </div>
    ),
    {
      ...size,
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
