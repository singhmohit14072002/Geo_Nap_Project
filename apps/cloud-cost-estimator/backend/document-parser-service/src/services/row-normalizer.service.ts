export interface NormalizedServiceRow {
  serviceCategory: string;
  serviceType: string;
  region: string;
  description: string;
}

const SERVICE_CATEGORY_KEYS = [
  "serviceCategory",
  "servicecategory",
  "service_category",
  "service category",
  "category",
  "servicecategoryname"
] as const;

const SERVICE_TYPE_KEYS = [
  "serviceType",
  "servicetype",
  "service_type",
  "service type",
  "type"
] as const;

const REGION_KEYS = [
  "region",
  "location",
  "deploymentregion",
  "deployment_region"
] as const;

const DESCRIPTION_KEYS = [
  "description",
  "details",
  "detail",
  "service_description"
] as const;

const normalizeKey = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9_ ]/g, "");

const normalizeRegion = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");

const toText = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return "";
};

const getByAliases = (row: Record<string, unknown>, aliases: readonly string[]): string => {
  const normalizedEntries = Object.entries(row).map(([key, value]) => ({
    key: normalizeKey(key),
    value
  }));

  for (const alias of aliases) {
    const aliasKey = normalizeKey(alias);
    const direct = row[alias as keyof typeof row];
    const directText = toText(direct);
    if (directText) {
      return directText;
    }

    const match = normalizedEntries.find((entry) => entry.key === aliasKey);
    if (match) {
      const text = toText(match.value);
      if (text) {
        return text;
      }
    }
  }

  return "";
};

export const normalizeRows = (rawRows: unknown[]): NormalizedServiceRow[] => {
  const normalized: NormalizedServiceRow[] = [];

  for (const rawRow of rawRows) {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
      continue;
    }

    const row = rawRow as Record<string, unknown>;
    const serviceCategory = getByAliases(row, SERVICE_CATEGORY_KEYS)
      .trim()
      .toLowerCase();
    const serviceType = getByAliases(row, SERVICE_TYPE_KEYS)
      .trim()
      .toLowerCase();
    const description = getByAliases(row, DESCRIPTION_KEYS).trim();
    const regionRaw = getByAliases(row, REGION_KEYS).trim();
    const region = regionRaw ? normalizeRegion(regionRaw) : "";

    if (!serviceType && !description) {
      continue;
    }

    normalized.push({
      serviceCategory,
      serviceType,
      region,
      description
    });
  }

  return normalized;
};
