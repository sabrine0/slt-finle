const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const repoRoot = path.resolve(__dirname, "..", "..");
const frontendPort = process.env.STLS_DESKTOP_FRONTEND_PORT || "3000";
const startUrl = `http://127.0.0.1:${frontendPort}`;
const electronBinary = require("electron");

let frontendProcess = null;
let electronProcess = null;

async function main() {
  const buildDir = path.join(repoRoot, "frontend", ".next");
  if (!fs.existsSync(buildDir)) {
    console.error(
      "Frontend is not built. Run first:\n  npm run build:frontend"
    );
    process.exit(1);
  }

  frontendProcess = spawnFrontend(frontendPort);
  await waitForUrl(startUrl, 60000);

  const electronEnv = { ...process.env, STLS_DESKTOP_MODE: "production" };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  electronProcess = spawn(electronBinary, [repoRoot], {
    cwd: repoRoot,
    stdio: "inherit",
    env: electronEnv,
  });

  electronProcess.on("exit", (code) => {
    teardown(code ?? 0);
  });
}

function spawnFrontend(port) {
  const isWindows = process.platform === "win32";
  const npmCommand = isWindows ? "npm.cmd" : "npm";
  const child = spawn(
    npmCommand,
    ["--prefix", "frontend", "run", "start"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      shell: isWindows,
      env: {
        ...process.env,
        PORT: port,
        // Bind to loopback only — desktop production server is not a public service.
        HOSTNAME: "127.0.0.1",
      },
    }
  );

  child.on("exit", (code) => {
    if (!electronProcess) {
      teardown(code ?? 1);
    }
  });

  return child;
}

function isUrlAvailable(url, timeoutMs) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isUrlAvailable(url, 1000)) {
      return;
    }
    await sleep(750);
  }

  throw new Error(`Timed out waiting for frontend at ${url}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function teardown(exitCode) {
  Promise.allSettled([
    killChildProcess(electronProcess),
    killChildProcess(frontendProcess),
  ]).finally(() => {
    process.exit(exitCode);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => teardown(0));
}

main().catch((error) => {
  console.error("Failed to start STLS desktop shell (production):", error);
  teardown(1);
});

function killChildProcess(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return Promise.resolve();
  }

  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  }

  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 1500);
  });
}
