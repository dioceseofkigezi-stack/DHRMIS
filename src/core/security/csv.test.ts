import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it.each(["=1+1", "+cmd", "-1+1", "@SUM(A1:A2)", "\t=1+1", "  =1+1"])(
    "neutralizes spreadsheet formula text %j",
    (payload) => {
      expect(csvCell(payload)).toBe(`"'${payload.replaceAll('"', '""')}"`);
    },
  );

  it("escapes quotes in ordinary text", () => {
    expect(csvCell('O"Brien')).toBe('"O""Brien"');
  });

  it("preserves typed numeric values", () => {
    expect(csvCell(-12.5)).toBe('"-12.5"');
  });
});
