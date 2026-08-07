import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";
import {
  classifyError,
  isRetryable,
  defaultMessageFor,
  parseValidationErrors,
  parseValidationErrorsByField,
} from "@/lib/errors";

function apiError(httpStatus: number, message = "boom"): ApiError {
  return new ApiError("SOME_CODE", message, httpStatus);
}

describe("classifyError", () => {
  it("classifies by httpStatus, not by message text", () => {
    expect(classifyError(apiError(422))).toBe("validation");
    expect(classifyError(apiError(401))).toBe("auth");
    expect(classifyError(apiError(403))).toBe("permission_denied");
    expect(classifyError(apiError(404))).toBe("not_found");
    expect(classifyError(apiError(409))).toBe("conflict");
    expect(classifyError(apiError(423))).toBe("locked");
    expect(classifyError(apiError(429))).toBe("rate_limited");
    expect(classifyError(apiError(500))).toBe("server_error");
    expect(classifyError(apiError(503))).toBe("server_error");
  });

  it("returns 'unknown' for an unmapped status", () => {
    expect(classifyError(apiError(418))).toBe("unknown");
  });

  it("returns 'unknown' for a non-ApiError value (plain Error, string, etc.)", () => {
    expect(classifyError(new Error("plain"))).toBe("unknown");
    expect(classifyError("just a string")).toBe("unknown");
    expect(classifyError(null)).toBe("unknown");
  });
});

describe("isRetryable", () => {
  it("is true only for 500/503", () => {
    expect(isRetryable(apiError(500))).toBe(true);
    expect(isRetryable(apiError(503))).toBe(true);
  });

  it("is false for validation/conflict — retrying unchanged just fails the same way", () => {
    expect(isRetryable(apiError(422))).toBe(false);
    expect(isRetryable(apiError(409))).toBe(false);
  });
});

describe("defaultMessageFor", () => {
  it("prefers the raw backend message for kinds where the backend's wording matters", () => {
    expect(defaultMessageFor(apiError(404, "Patient not found"))).toBe("Patient not found");
    expect(defaultMessageFor(apiError(409, "Duplicate CNIC"))).toBe("Duplicate CNIC");
  });

  it("falls back to a safe generic message when the backend gave none", () => {
    expect(defaultMessageFor(apiError(404, ""))).toBe("That couldn't be found.");
  });

  it("uses a fixed generic message for validation/auth/permission regardless of raw text", () => {
    expect(defaultMessageFor(apiError(422, "some field-level detail"))).toBe(
      "Please check the highlighted fields and try again.",
    );
    expect(defaultMessageFor(apiError(401))).toBe(
      "Your session has expired. Please sign in again.",
    );
    expect(defaultMessageFor(apiError(403))).toBe("You don't have permission to do that.");
  });

  it("never leaks a raw 500 message to the user", () => {
    expect(defaultMessageFor(apiError(500, "Traceback: ..."))).toBe(
      "Something went wrong on our end. Please try again in a moment.",
    );
  });
});

describe("parseValidationErrors", () => {
  it("extracts field (last loc segment) and a cleaned message per entry", () => {
    const details = [
      { loc: ["body", "cnic"], msg: "Field required" },
      { loc: ["body", "items", 0, "dose"], msg: "Value error, must be positive" },
    ];
    expect(parseValidationErrors(details)).toEqual([
      { field: "cnic", message: "Field required" },
      { field: "dose", message: "must be positive" },
    ]);
  });

  it("returns an empty list for non-array input", () => {
    expect(parseValidationErrors(undefined)).toEqual([]);
    expect(parseValidationErrors("not an array")).toEqual([]);
    expect(parseValidationErrors({ not: "an array" })).toEqual([]);
  });

  it("skips malformed entries instead of throwing", () => {
    expect(parseValidationErrors([null, { loc: ["body", "x"] }, "garbage"])).toEqual([]);
  });

  it("defaults to field 'value' when loc is empty", () => {
    expect(parseValidationErrors([{ loc: [], msg: "Invalid" }])).toEqual([
      { field: "value", message: "Invalid" },
    ]);
  });
});

describe("parseValidationErrorsByField", () => {
  it("keys errors by field name, last one winning on duplicates", () => {
    const details = [
      { loc: ["body", "cnic"], msg: "first" },
      { loc: ["body", "cnic"], msg: "second" },
    ];
    expect(parseValidationErrorsByField(details)).toEqual({ cnic: "second" });
  });
});
