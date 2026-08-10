import { describe, expect, it } from "vitest";
import { nullableDataOrThrow } from "@/lib/supabase-result";

describe("Supabase read boundaries", () => {
  it("distinguishes a missing row from a failed read", () => {
    expect(nullableDataOrThrow({ data: null, error: null })).toBeNull();
    expect(() => nullableDataOrThrow({ data: null, error: { message: "read failed" } }))
      .toThrow("read failed");
  });
});
