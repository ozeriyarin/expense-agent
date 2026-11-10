#!/usr/bin/env node
// Claude Code PreToolUse hook (Bash): before any `git commit`, run the data/secret guard and the tests.
// Exit 2 blocks the tool call and feeds stderr back to Claude.
import { execSync } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let cmd = "";
  try { cmd = JSON.parse(input)?.tool_input?.command ?? ""; } catch { /* not JSON: let it through */ }
  if (!/\bgit\s+(-\S+\s+)*commit\b/.test(cmd)) process.exit(0);
  const steps = [
    ["guard", "node scripts/guard-staged.mjs"],
    ["tests", "npx vitest run --reporter=dot"],
  ];
  for (const [name, c] of steps) {
    try {
      execSync(c, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    } catch (e) {
      process.stderr.write(`pre-commit ${name} failed:\n${e.stderr || ""}${e.stdout || ""}`);
      process.exit(2);
    }
  }
  process.exit(0);
});
