import os from "node:os";
import path from "node:path";

export function resolveCoworkHomedir(userAgentDir?: string): string {
  const fallback = os.homedir();
  const trimmed = userAgentDir?.trim();
  if (!trimmed) return fallback;

  const normalized = path.normalize(trimmed);
  return path.basename(normalized) === ".agent" ? path.dirname(normalized) : fallback;
}
