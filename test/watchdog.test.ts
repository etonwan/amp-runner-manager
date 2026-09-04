import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const temporary: string[] = [];
const watchdog = resolve(
  import.meta.dir,
  "../scripts/runner-manager-watchdog.sh",
);
const scripts = [
  watchdog,
  resolve(import.meta.dir, "../scripts/runner-manager-doctor.sh"),
  resolve(import.meta.dir, "../scripts/install-launch-agents.sh"),
];

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function executable(path: string, source: string): Promise<string> {
  await writeFile(path, `#!/bin/bash\n${source}\n`);
  await chmod(path, 0o755);
  return path;
}

async function fixture(): Promise<{
  root: string;
  state: string;
  calls: string;
  env: Record<string, string>;
}> {
  const root = await mkdtemp(resolve(tmpdir(), "runner-watchdog-"));
  temporary.push(root);
  const pid = resolve(root, "pid");
  const calls = resolve(root, "launchctl-calls");
  const state = resolve(root, "state", "state");
  const ampLog = resolve(root, "amp.log");
  await writeFile(pid, "100\n");
  await writeFile(ampLog, "healthy activity\n");

  const launchctl = await executable(
    resolve(root, "launchctl"),
    `
case "$1" in
  print)
    printf '\\tstate = running\\n\\tpid = %s\\n' "$(cat "$PID_FILE")"
    ;;
  kickstart)
    printf '%s\\n' "$*" >> "$CALLS_FILE"
    printf '200\\n' > "$PID_FILE"
    ;;
esac`,
  );
  const curl = await executable(
    resolve(root, "curl"),
    `[ "\${NETWORK_UP:-1}" = "1" ]`,
  );
  const lsof = await executable(
    resolve(root, "lsof"),
    `
requested_pid=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-p" ]; then requested_pid="$2"; break; fi
  shift
done
if [ "$requested_pid" = "200" ] || [ "\${CONNECTED:-0}" = "1" ]; then
  printf 'COMMAND PID TYPE NAME\\namp %s IPv4 localhost:1->example:443 (ESTABLISHED)\\n' "$requested_pid"
  exit 0
fi
exit 1`,
  );
  const ps = await executable(
    resolve(root, "ps"),
    `printf '%s\\n' "\${PS_ARGS:-amp --no-tui --runner-id runner-manager --remote-control-terminal}"`,
  );
  const stat = await executable(
    resolve(root, "stat"),
    `if [ "$(cat "$PID_FILE")" = "200" ]; then printf '1000\\n'; else printf '%s\\n' "\${LOG_MTIME:-995}"; fi`,
  );
  const date = await executable(
    resolve(root, "date"),
    `if [ "\${1:-}" = "+%s" ]; then printf '1000\\n'; else printf 'test-time\\n'; fi`,
  );
  const id = await executable(resolve(root, "id"), `printf '501\\n'`);
  const sleep = await executable(resolve(root, "sleep"), `exit 0`);

  return {
    root,
    state,
    calls,
    env: {
      HOME: root,
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      AMP_RUNNER_MANAGER_STATE_DIR: resolve(root, "state"),
      AMP_RUNNER_MANAGER_AMP_LOG: ampLog,
      AMP_RUNNER_MANAGER_VERIFY_ATTEMPTS: "1",
      AMP_RUNNER_MANAGER_VERIFY_INTERVAL: "0",
      LAUNCHCTL_BIN: launchctl,
      CURL_BIN: curl,
      LSOF_BIN: lsof,
      PS_BIN: ps,
      STAT_BIN: stat,
      DATE_BIN: date,
      ID_BIN: id,
      SLEEP_BIN: sleep,
      PID_FILE: pid,
      CALLS_FILE: calls,
    },
  };
}

async function run(env: Record<string, string>): Promise<{
  exitCode: number;
  output: string;
}> {
  const process = Bun.spawn(["/bin/bash", watchdog], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, output: stdout + stderr };
}

describe("runner manager watchdog", () => {
  test("ships syntactically valid shell scripts", () => {
    const result = Bun.spawnSync(["/bin/bash", "-n", ...scripts]);
    expect(result.exitCode).toBe(0);
  });

  test("does nothing when the manager has recent activity", async () => {
    const item = await fixture();
    const result = await run(item.env);

    expect(result.exitCode).toBe(0);
    expect(await readFile(item.state, "utf8")).toBe("0 0\n");
    expect(await Bun.file(item.calls).exists()).toBe(false);
  });

  test("does nothing when the manager has an established connection", async () => {
    const item = await fixture();
    const result = await run({
      ...item.env,
      CONNECTED: "1",
      LOG_MTIME: "0",
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(item.state, "utf8")).toBe("0 0\n");
    expect(await Bun.file(item.calls).exists()).toBe(false);
  });

  test("does not restart while the Amp endpoint is unreachable", async () => {
    const item = await fixture();
    const result = await run({
      ...item.env,
      LOG_MTIME: "0",
      NETWORK_UP: "0",
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Amp endpoint is unreachable");
    expect(await Bun.file(item.calls).exists()).toBe(false);
  });

  test("refuses to restart a PID whose manager role is not verified", async () => {
    const item = await fixture();
    const result = await run({
      ...item.env,
      LOG_MTIME: "0",
      PS_ARGS: "amp --no-tui --runner-id another-runner",
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("manager role could not be verified");
    expect(await Bun.file(item.calls).exists()).toBe(false);
  });

  test("clears stale checks when manager activity resumes", async () => {
    const item = await fixture();
    const stale = { ...item.env, LOG_MTIME: "0" };
    await run(stale);
    await run(stale);

    const result = await run(item.env);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Manager activity recovered");
    expect(await readFile(item.state, "utf8")).toBe("0 0\n");
    expect(await Bun.file(item.calls).exists()).toBe(false);
  });

  test("restarts only after consecutive stale activity checks", async () => {
    const item = await fixture();

    const stale = { ...item.env, LOG_MTIME: "0" };
    expect((await run(stale)).exitCode).toBe(0);
    expect((await run(stale)).exitCode).toBe(0);
    expect(await Bun.file(item.calls).exists()).toBe(false);

    const result = await run(stale);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Manager recovered with PID 200");
    expect(await readFile(item.calls, "utf8")).toBe(
      "kickstart -k gui/501/com.amp.runner-manager\n",
    );
    expect(await readFile(item.state, "utf8")).toBe("0 1000\n");
  });

  test("respects the restart cooldown", async () => {
    const item = await fixture();
    await Bun.write(item.state, "3 900\n");

    const result = await run({ ...item.env, LOG_MTIME: "0" });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("restart cooldown is active");
    expect(await Bun.file(item.calls).exists()).toBe(false);
  });
});
