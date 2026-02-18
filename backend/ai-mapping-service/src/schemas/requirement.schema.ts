import { z } from "zod";

export const sourceTypeSchema = z.enum(["xml", "excel", "pdf", "word"]);

const parseNullableNumber = (value: unknown): unknown => {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
};

const nullablePositiveIntSchema = z.preprocess(
  parseNullableNumber,
  z.number().int().positive().nullable()
);

const nullableNonNegativeNumberSchema = z.preprocess(
  parseNullableNumber,
  z.number().nonnegative().nullable()
);

export const mapRequestSchema = z
  .object({
    rawInfrastructureData: z.record(z.unknown()),
    sourceType: sourceTypeSchema
  })
  .strict();

export const computeRequirementSchema = z
  .object({
    vCPU: nullablePositiveIntSchema,
    ramGB: nullableNonNegativeNumberSchema,
    storageGB: nullableNonNegativeNumberSchema,
    osType: z.enum(["linux", "windows"]).nullable(),
    quantity: nullablePositiveIntSchema
  })
  .strict();

export const databaseRequirementSchema = z
  .object({
    engine: z.string().min(1).nullable(),
    storageGB: nullableNonNegativeNumberSchema,
    ha: z.boolean().nullable()
  })
  .strict();

export const networkRequirementSchema = z
  .object({
    dataEgressGB: nullableNonNegativeNumberSchema
  })
  .strict();

export const standardizedRequirementSchema = z
  .object({
    compute: z.array(computeRequirementSchema),
    database: databaseRequirementSchema,
    network: networkRequirementSchema,
    region: z.string().min(1).nullable()
  })
  .strict();

export const requirementSchemaTemplate = {
  compute: [
    {
      vCPU: null,
      ramGB: null,
      storageGB: null,
      osType: null,
      quantity: null
    }
  ],
  database: {
    engine: null,
    storageGB: null,
    ha: null
  },
  network: {
    dataEgressGB: null
  },
  region: null
} as const;

export const requirementSchemaContract = {
  type: "object",
  required: ["compute", "database", "network", "region"],
  additionalProperties: false,
  properties: {
    compute: {
      type: "array",
      items: {
        type: "object",
        required: ["vCPU", "ramGB", "storageGB", "osType", "quantity"],
        additionalProperties: false,
        properties: {
          vCPU: { type: ["integer", "null"], minimum: 1 },
          ramGB: { type: ["number", "null"], minimum: 0 },
          storageGB: { type: ["number", "null"], minimum: 0 },
          osType: { enum: ["linux", "windows", null] },
          quantity: { type: ["integer", "null"], minimum: 1 }
        }
      }
    },
    database: {
      type: "object",
      required: ["engine", "storageGB", "ha"],
      additionalProperties: false,
      properties: {
        engine: { type: ["string", "null"] },
        storageGB: { type: ["number", "null"], minimum: 0 },
        ha: { type: ["boolean", "null"] }
      }
    },
    network: {
      type: "object",
      required: ["dataEgressGB"],
      additionalProperties: false,
      properties: {
        dataEgressGB: { type: ["number", "null"], minimum: 0 }
      }
    },
    region: { type: ["string", "null"] }
  }
} as const;

export type MapRequest = z.infer<typeof mapRequestSchema>;
export type StandardizedRequirement = z.infer<typeof standardizedRequirementSchema>;
