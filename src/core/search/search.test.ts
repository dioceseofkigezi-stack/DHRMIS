import { describe, expect, it } from "vitest";
import { patternFor } from "@/core/search/search";

describe("search pattern escaping", () => {
  it("treats SQL LIKE wildcards as literal user input", () => {
    expect(patternFor("50%_off\\" )).toBe("%50\\%\\_off\\\\%");
  });

  it("wraps a phrase for a contains search", () => {
    expect(patternFor("Kigezi HR")).toBe("%Kigezi HR%");
  });
});
