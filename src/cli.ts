import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { loadEnvFromFileIfNeeded } from "./env.js";
import type { UnifiedChatRequest } from "./providers.js";

type CliCommand = "serve" | "providers" | "prepare" | "chat";

const parseArgs = (argv: string[]) => {
  const options: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token.startsWith("--")) {
      const [flag, inlineValue] = token.split("=", 2);
      const key = flag.slice(2);

      if (inlineValue !== undefined) {
        options[key] = inlineValue;
        continue;
      }

      const nextValue = argv[index + 1];
      if (nextValue && !nextValue.startsWith("--")) {
        options[key] = nextValue;
        index += 1;
      } else {
        options[key] = true;
      }

      continue;
    }

    positionals.push(token);
  }

  return { options, positionals };
};

const readRequest = (options: Record<string, string | boolean>): UnifiedChatRequest => {
  const requestFile = typeof options["request-file"] === "string" ? options["request-file"] : undefined;
  const requestJson = typeof options["request-json"] === "string" ? options["request-json"] : undefined;

  if (!requestFile && !requestJson) {
    throw new Error("Provide --request-file or --request-json.");
  }

  if (requestFile) {
    const fileText = readFileSync(resolve(requestFile), "utf8");
    return JSON.parse(fileText) as UnifiedChatRequest;
  }

  return JSON.parse(requestJson as string) as UnifiedChatRequest;
};

const printUsage = () => {
  console.log([
    "Usage:",
    "  npm run cli -- serve [--env-file .env]",
    "  npm run cli -- providers [--env-file .env]",
    "  npm run cli -- prepare --request-file request.json [--env-file .env]",
    "  npm run cli -- chat --request-file request.json [--env-file .env]",
  ].join("\n"));
};

const main = async () => {
  const { options, positionals } = parseArgs(process.argv.slice(2));
  const command = (positionals[0] || "serve") as CliCommand;
  const envFile = typeof options["env-file"] === "string" ? options["env-file"] : undefined;

  if (envFile) {
    loadEnvFromFileIfNeeded(resolve(envFile));
  }

  if (command === "serve") {
    await import("./index.js");
    return;
  }

  const providersModule = await import("./providers.js");

  if (command === "providers") {
    console.log(JSON.stringify(providersModule.getProviderSummary(), null, 2));
    return;
  }

  if (command === "prepare") {
    const request = await readRequest(options);
    const prepared = providersModule.prepareRequest(request);
    console.log(JSON.stringify(prepared, null, 2));
    return;
  }

  if (command === "chat") {
    const request = await readRequest(options);
    const response = await providersModule.callProvider(request);
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  printUsage();
  process.exitCode = 1;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});