import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Augure — Your Personal AI Agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const dmSansBold = await readFile(
    join(process.cwd(), "assets/DM_Sans-Bold.ttf"),
  );

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
              "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(245, 158, 11, 0.12), transparent 70%)",
          }}
        />

        {/* Brand wordmark */}
        <h1
          style={{
            fontSize: 96,
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
            fontSize: 28,
            color: "#a8a29e",
            margin: 0,
            marginTop: "16px",
            fontFamily: "DM Sans",
          }}
        >
          Your personal AI agent, running 24/7.
        </p>

        {/* URL */}
        <p
          style={{
            fontSize: 20,
            color: "#44403c",
            margin: 0,
            marginTop: "24px",
            fontFamily: "DM Sans",
          }}
        >
          augure.dev
        </p>
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
      ],
    },
  );
}
