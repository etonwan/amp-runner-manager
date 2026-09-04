import { describe, expect, test } from "bun:test";
import { makeLabel, renderPlist } from "../src/plist";

describe("launchd plist generation", () => {
  test("uses tokenized arguments, cwd, logs, and remote terminal", () => {
    const output = renderPlist({
      label: makeLabel("shop-amp-1234567890"),
      ampPath: "/Applications/Amp & Co/bin/amp",
      runnerId: "shop-amp-1234567890",
      cwd: "/Users/me/code/shop <new>",
      ampLogPath: "/Users/me/logs/amp.log",
      stdoutPath: "/Users/me/logs/out.log",
      stderrPath: "/Users/me/logs/err.log",
      pathEnvironment: "/opt/homebrew/bin:/usr/bin",
    });

    expect(output).toContain(
      "<string>/Applications/Amp &amp; Co/bin/amp</string>",
    );
    expect(output).toContain("<string>--no-tui</string>");
    expect(output).toContain("<string>--log-file</string>");
    expect(output).toContain("<string>/Users/me/logs/amp.log</string>");
    expect(output).toContain("<string>--runner-id</string>");
    expect(output).toContain("<string>--remote-control-terminal</string>");
    expect(output).toContain("<key>WorkingDirectory</key>");
    expect(output).toContain(
      "<string>/Users/me/code/shop &lt;new&gt;</string>",
    );
    expect(output).toContain("<key>KeepAlive</key>");
    expect(output).not.toContain("/bin/sh");
  });
});
