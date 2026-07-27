import { openSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const log = openSync(resolve(projectRoot, ".devserver.log"), "a");
const child = spawn(
  process.execPath,
  [
    resolve(projectRoot, "node_modules/vinext/dist/cli.js"),
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
  ],
  {
    cwd: projectRoot,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      LOCAL_PREVIEW: "1",
      WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
    },
  },
);

child.unref();
console.log(child.pid);
