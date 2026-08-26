export interface RunnerJob {
  label: string;
  ampPath: string;
  runnerId: string;
  cwd: string;
  stdoutPath: string;
  stderrPath: string;
  remoteControlTerminal: boolean;
  pathEnvironment?: string;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function makeLabel(runnerId: string): string {
  return `com.amp.runner-manager.${runnerId}`;
}

export function renderPlist(job: RunnerJob): string {
  const args = [job.ampPath, "--no-tui", "--runner-id", job.runnerId];
  if (job.remoteControlTerminal) args.push("--remote-control-terminal");
  const argumentXml = args
    .map((argument) => `      <string>${xml(argument)}</string>`)
    .join("\n");
  const environment = job.pathEnvironment
    ? `\n    <key>EnvironmentVariables</key>\n    <dict>\n      <key>PATH</key>\n      <string>${xml(job.pathEnvironment)}</string>\n    </dict>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${xml(job.label)}</string>
    <key>ProgramArguments</key>
    <array>
${argumentXml}
    </array>
    <key>WorkingDirectory</key>
    <string>${xml(job.cwd)}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${xml(job.stdoutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(job.stderrPath)}</string>${environment}
  </dict>
</plist>
`;
}
