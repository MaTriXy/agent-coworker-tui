import fs from "node:fs";
import path from "node:path";

export const SIDECAR_BASE_NAME = "cowork-server";
export const SIDECAR_MANIFEST_NAME = "cowork-server-manifest.json";

export type SidecarManifest = {
  filename: string;
  targetTriple: string;
  platform: NodeJS.Platform;
  arch: string;
};

export function resolveDesktopTargetTriple(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  if (platform === "win32") {
    if (arch === "x64") return "x86_64-pc-windows-msvc";
    if (arch === "arm64") return "aarch64-pc-windows-msvc";
  }

  if (platform === "darwin") {
    if (arch === "x64") return "x86_64-apple-darwin";
    if (arch === "arm64") return "aarch64-apple-darwin";
  }

  if (platform === "linux") {
    if (arch === "x64") return "x86_64-unknown-linux-gnu";
    if (arch === "arm64") return "aarch64-unknown-linux-gnu";
  }

  throw new Error(`Unsupported platform/arch for desktop sidecar: ${platform}/${arch}`);
}

export function resolvePackagedSidecarFilename(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  const ext = platform === "win32" ? ".exe" : "";
  return `${SIDECAR_BASE_NAME}-${resolveDesktopTargetTriple(platform, arch)}${ext}`;
}

export function buildSidecarManifest(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): SidecarManifest {
  return {
    filename: resolvePackagedSidecarFilename(platform, arch),
    targetTriple: resolveDesktopTargetTriple(platform, arch),
    platform,
    arch,
  };
}

function isSidecarManifest(value: unknown): value is SidecarManifest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.filename === "string" &&
    candidate.filename.length > 0 &&
    typeof candidate.targetTriple === "string" &&
    candidate.targetTriple.length > 0 &&
    typeof candidate.platform === "string" &&
    candidate.platform.length > 0 &&
    typeof candidate.arch === "string" &&
    candidate.arch.length > 0
  );
}

type FindPackagedSidecarBinaryOptions = {
  explicitPath?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  existsSync?: typeof fs.existsSync;
  readFileSync?: typeof fs.readFileSync;
  readdirSync?: typeof fs.readdirSync;
};

export function findPackagedSidecarBinary(
  searchDirs: string[],
  options: FindPackagedSidecarBinaryOptions = {}
): string {
  const explicitPath = options.explicitPath?.trim();
  const existsSync = options.existsSync ?? fs.existsSync;
  const readFileSync = options.readFileSync ?? fs.readFileSync;
  const readdirSync = options.readdirSync ?? fs.readdirSync;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;

  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const expectedFilename = resolvePackagedSidecarFilename(platform, arch);
  const foundCandidates = new Set<string>();

  for (const dir of searchDirs) {
    if (!existsSync(dir)) {
      continue;
    }

    const manifestPath = path.join(dir, SIDECAR_MANIFEST_NAME);
    if (existsSync(manifestPath)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
      } catch (error) {
        throw new Error(`Bundled sidecar manifest is unreadable: ${manifestPath} (${String(error)})`);
      }

      if (!isSidecarManifest(parsed)) {
        throw new Error(`Bundled sidecar manifest is invalid: ${manifestPath}`);
      }

      const manifestBinary = path.join(dir, parsed.filename);
      if (!existsSync(manifestBinary)) {
        throw new Error(
          `Bundled sidecar manifest points to a missing binary: ${manifestPath} -> ${parsed.filename}`
        );
      }

      return manifestBinary;
    }

    const exactPath = path.join(dir, expectedFilename);
    if (existsSync(exactPath)) {
      return exactPath;
    }

    for (const entry of readdirSync(dir)) {
      if (entry === SIDECAR_BASE_NAME || entry.startsWith(`${SIDECAR_BASE_NAME}-`)) {
        foundCandidates.add(path.join(dir, entry));
      }
    }
  }

  const foundSummary =
    foundCandidates.size > 0 ? ` Found candidates: ${[...foundCandidates].sort().join(", ")}` : "";

  throw new Error(
    `Server sidecar binary not found. Expected ${expectedFilename} in ${searchDirs.join(", ")}.${foundSummary}`
  );
}
