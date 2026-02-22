import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VersionChecker } from "../version-checker.js";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("VersionChecker", () => {
  describe("npm mode", () => {
    it("should detect update available from npm registry", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ version: "1.0.0" }),
      });

      const checker = new VersionChecker({
        currentVersion: "0.3.0",
        packageName: "augure",
              });

      const result = await checker.check();

      expect(result.updateAvailable).toBe(true);
      expect(result.currentVersion).toBe("0.3.0");
      expect(result.latestVersion).toBe("1.0.0");
    });

    it("should return no update when already latest", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ version: "0.3.0" }),
      });

      const checker = new VersionChecker({
        currentVersion: "0.3.0",
        packageName: "augure",
              });

      const result = await checker.check();
      expect(result.updateAvailable).toBe(false);
    });
  });

  describe("compareVersions", () => {
    it("should detect newer major version", () => {
      expect(VersionChecker.compareVersions("1.0.0", "2.0.0")).toBe(-1);
    });

    it("should detect newer minor version", () => {
      expect(VersionChecker.compareVersions("1.0.0", "1.1.0")).toBe(-1);
    });

    it("should detect newer patch version", () => {
      expect(VersionChecker.compareVersions("1.0.0", "1.0.1")).toBe(-1);
    });

    it("should detect equal versions", () => {
      expect(VersionChecker.compareVersions("1.0.0", "1.0.0")).toBe(0);
    });

    it("should detect older version", () => {
      expect(VersionChecker.compareVersions("2.0.0", "1.0.0")).toBe(1);
    });

    it("should handle pre-release suffixes by stripping them", () => {
      expect(VersionChecker.compareVersions("1.0.0-beta.1", "1.0.0")).toBe(0);
      expect(VersionChecker.compareVersions("1.0.0", "1.0.1-rc.2")).toBe(-1);
    });

    it("should handle v-prefix", () => {
      expect(VersionChecker.compareVersions("v1.0.0", "1.0.1")).toBe(-1);
    });
  });

  describe("error handling", () => {
    it("should handle non-200 npm response gracefully", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const checker = new VersionChecker({
        currentVersion: "0.3.0",
        packageName: "augure",
      });

      const result = await checker.check();
      expect(result.updateAvailable).toBe(false);
      expect(result.error).toBe("npm registry returned 404");
    });

    it("should handle fetch failure gracefully", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      const checker = new VersionChecker({
        currentVersion: "0.3.0",
        packageName: "augure",
              });

      const result = await checker.check();
      expect(result.updateAvailable).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });
});
