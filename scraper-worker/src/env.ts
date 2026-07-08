import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "dotenv";

const envFileUrls = [
  new URL("../.env", import.meta.url),
  new URL("../.env.local", import.meta.url),
];

const loadedEnv = new Map<string, string>();

for (const envFileUrl of envFileUrls) {
  const envFilePath = fileURLToPath(envFileUrl);

  if (!existsSync(envFilePath)) {
    continue;
  }

  const parsedEnv = parse(readFileSync(envFilePath));

  for (const [name, value] of Object.entries(parsedEnv)) {
    if (value) {
      loadedEnv.set(name, value);
    }
  }
}

for (const [name, value] of loadedEnv) {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}
