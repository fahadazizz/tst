import { describe, it, expect } from "vitest";
import { maskIdentifier, identifierLabel } from "@/lib/mask";

describe("maskIdentifier", () => {
  it("masks all but the last visible tail character by default", () => {
    expect(maskIdentifier("42101-1234567-1")).toBe("•••••-•••••••-1");
  });

  it("supports a wider visible tail", () => {
    expect(maskIdentifier("42101-1234567-1", 4)).toBe("•••••-•••••67-1");
  });

  it("never reveals grouping punctuation as if it were a digit, but doesn't mask it either", () => {
    // Dashes stay visible throughout — only actual value characters are masked.
    expect(maskIdentifier("AB-123456")).toBe("••-•••••6");
  });

  it("masks down to a single dot when the value is exactly the visible-tail length", () => {
    // length (1) <= visibleTail (1): short-circuits to "•".repeat(length), not a fixed 4.
    expect(maskIdentifier("1")).toBe("•");
  });

  it("falls back to a fixed 4-dot mask for an empty value (length||4)", () => {
    expect(maskIdentifier("")).toBe("••••");
  });

  it("trims surrounding whitespace before masking", () => {
    expect(maskIdentifier("  1234  ")).toBe("•••4");
  });

  it("never returns the raw unmasked value for a real-length identifier", () => {
    const raw = "42101-1234567-1";
    expect(maskIdentifier(raw)).not.toBe(raw);
  });
});

describe("identifierLabel", () => {
  it("maps every known identifier type to a human label", () => {
    expect(identifierLabel("cnic")).toBe("CNIC");
    expect(identifierLabel("passport")).toBe("Passport");
    expect(identifierLabel("mrn_external")).toBe("External MRN");
    expect(identifierLabel("insurance")).toBe("Insurance ID");
  });

  it("falls back to a generic label for the 'other' type", () => {
    expect(identifierLabel("other")).toBe("Identifier");
  });
});
