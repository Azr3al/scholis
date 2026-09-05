import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  getObjectFormSchema,
  isZodFieldRequired,
  withRequiredEmptyStringMessages,
} from "../schema-utils";
import { discountCreateEditSchema } from "@/types/finance";

describe("isZodFieldRequired", () => {
  it("returns true for plain required scalars", () => {
    expect(isZodFieldRequired(z.string())).toBe(true);
    expect(isZodFieldRequired(z.number())).toBe(true);
    expect(isZodFieldRequired(z.nativeEnum({ a: "a", b: "b" }))).toBe(true);
  });

  it("returns false for optional, nullable, and defaulted fields", () => {
    expect(isZodFieldRequired(z.string().optional())).toBe(false);
    expect(isZodFieldRequired(z.string().nullable())).toBe(false);
    expect(isZodFieldRequired(z.string().default("x"))).toBe(false);
    expect(isZodFieldRequired(z.coerce.number().nullable().optional())).toBe(
      false,
    );
  });
});

describe("withRequiredEmptyStringMessages", () => {
  it("rejects empty required strings with field-specific copy", () => {
    const schema = withRequiredEmptyStringMessages(
      z.object({
        name: z.string(),
        description: z.string().optional(),
      }),
    );

    const invalid = schema.safeParse({ name: "", description: "" });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const nameIssue = invalid.error.issues.find((issue) =>
        issue.path.includes("name"),
      );
      expect(nameIssue?.message).toBe("Name is required");
    }

    const valid = schema.safeParse({ name: "Discount A" });
    expect(valid.success).toBe(true);
  });

  it("preserves superRefine effects on wrapped schemas", () => {
    const schema = withRequiredEmptyStringMessages(
      z
        .object({
          name: z.string(),
          code: z.string().min(2, "Code is required"),
        })
        .superRefine((data, ctx) => {
          if (data.code === "bad") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Code is invalid",
              path: ["code"],
            });
          }
        }),
    );

    const invalidCode = schema.safeParse({ name: "Test", code: "bad" });
    expect(invalidCode.success).toBe(false);
    if (!invalidCode.success) {
      expect(
        invalidCode.error.issues.some((issue) => issue.message === "Code is invalid"),
      ).toBe(true);
    }
  });

  it("rejects empty discount name with field-specific copy", () => {
    const schema = withRequiredEmptyStringMessages(discountCreateEditSchema);
    const invalid = schema.safeParse({
      name: "",
      discount_type: "percent",
      scope: "course",
      is_active: true,
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const nameIssue = invalid.error.issues.find((issue) =>
        issue.path.includes("name"),
      );
      expect(nameIssue?.message).toBe("Name is required");
    }
    expect(isZodFieldRequired(getObjectFormSchema(discountCreateEditSchema).shape.name)).toBe(true);
    expect(
      isZodFieldRequired(getObjectFormSchema(discountCreateEditSchema).shape.description),
    ).toBe(false);
  });
});
