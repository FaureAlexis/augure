import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  // Bundle all @augure/* workspace packages into the CLI
  noExternal: [/^@augure\//],
  // Keep CJS-only deps external (they use require("tls") etc.)
  external: ["imapflow", "nodemailer"],
  // Keep shebang for the bin entry
  banner: { js: "#!/usr/bin/env node" },
});
