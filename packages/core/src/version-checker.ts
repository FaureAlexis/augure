export interface VersionCheckerConfig {
  currentVersion: string;
  packageName: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

export class VersionChecker {
  constructor(private readonly config: VersionCheckerConfig) {}

  /** Check npm registry for latest version */
  async check(): Promise<UpdateCheckResult> {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${this.config.packageName}/latest`,
      );

      if (!response.ok) {
        return {
          updateAvailable: false,
          currentVersion: this.config.currentVersion,
          error: `npm registry returned ${response.status}`,
        };
      }

      const data = (await response.json()) as { version: string };
      const latest = data.version;

      return {
        updateAvailable:
          VersionChecker.compareVersions(this.config.currentVersion, latest) < 0,
        currentVersion: this.config.currentVersion,
        latestVersion: latest,
      };
    } catch (err) {
      return {
        updateAvailable: false,
        currentVersion: this.config.currentVersion,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Compare two semver strings (MAJOR.MINOR.PATCH only, pre-release suffixes stripped). Returns -1 if a < b, 0 if equal, 1 if a > b */
  static compareVersions(a: string, b: string): number {
    const clean = (v: string) => v.replace(/^v/, "").split("-")[0];
    const pa = clean(a).split(".").map(Number);
    const pb = clean(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      const va = pa[i] ?? 0;
      const vb = pb[i] ?? 0;
      if (va < vb) return -1;
      if (va > vb) return 1;
    }
    return 0;
  }
}
