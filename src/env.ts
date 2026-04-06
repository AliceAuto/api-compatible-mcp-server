import { existsSync, readFileSync } from "node:fs";

const parseEnvLine = (line: string) => {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (!key) {
    return null;
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
};

export const loadEnvFile = (filePath: string) => {
  if (!existsSync(filePath)) {
    return {};
  }

  const entries: Record<string, string> = {};
  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (!parsed) {
      continue;
    }

    entries[parsed.key] = parsed.value;
  }

  return entries;
};

export const applyEnvEntries = (entries: Record<string, string>) => {
  for (const [key, value] of Object.entries(entries)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
};

export const loadEnvFromFileIfNeeded = (filePath?: string) => {
  if (!filePath) {
    return;
  }

  applyEnvEntries(loadEnvFile(filePath));
};