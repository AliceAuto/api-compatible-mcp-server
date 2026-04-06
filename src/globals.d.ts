declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  exit(code?: number): never;
};