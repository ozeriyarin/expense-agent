import { describe, expect, it } from "vitest";

// Built at runtime so no account-shaped literal sits in the source (the guard would block it).
const ACCT = ["12", "345", "678901"].join("-");
// @ts-expect-error plain ESM script without types
import { scanContent, scanPath } from "../../scripts/guard-staged.mjs";

const scan = (file: string, text = "") => [...scanPath(file), ...scanContent(file, text)];

describe("guard-staged (criterion 2)", () => {
  it("blocks env files but allows .env.example", () => {
    expect(scan(".env")).toHaveLength(1);
    expect(scan(".env.local")).toHaveLength(1);
    expect(scan(".env.example")).toHaveLength(0);
  });

  it("blocks spreadsheets and databases outside tests/fixtures", () => {
    expect(scan("exports/2026-10/statement.xlsx").length).toBeGreaterThan(0);
    expect(scan("notes.csv").length).toBeGreaterThan(0);
    expect(scan("expense.db").length).toBeGreaterThan(0);
    expect(scan("tests/fixtures/cal-synthetic.csv")).toHaveLength(0);
  });

  it("blocks API keys and tokens", () => {
    expect(scan("src/x.ts", `const k = "sk-ant-${"a".repeat(40)}";`).length).toBeGreaterThan(0);
    expect(scan("src/x.ts", `key: "AIza${"B".repeat(35)}"`).length).toBeGreaterThan(0);
    expect(scan("src/x.ts", `bot 123456789:${"A".repeat(35)}`).length).toBeGreaterThan(0);
    expect(scan("src/x.ts", `apiKey: process.env["ANTHROPIC_API_KEY"]`)).toHaveLength(0);
  });

  it("blocks bank account numbers and bulk transaction rows outside fixtures", () => {
    expect(scan("docs/a.md", `account ${ACCT} opened`).length).toBeGreaterThan(0);
    const rows = Array.from({ length: 12 }, (_, i) => `0${(i % 9) + 1}/10/2026,Some Shop,${(i + 1) * 10}.50`).join("\n");
    expect(scan("src/data.ts", rows).length).toBeGreaterThan(0);
    expect(scan("tests/fixtures/cal-synthetic.csv", rows)).toHaveLength(0);
  });

  it("passes clean source", () => {
    expect(scan("src/core/walker.ts", "export function walk() { return 1; }")).toHaveLength(0);
  });
});
