import { DocumentType } from "../rules/document-type.rules";

export const SERVICE_CLASSIFICATIONS = [
  "COMPUTE_VM",
  "STORAGE_DISK",
  "NETWORK_GATEWAY",
  "NETWORK_EGRESS",
  "BACKUP",
  "AUTOMATION",
  "MONITORING",
  "LOGIC_APPS",
  "OTHER"
] as const;

export type ServiceClassification = (typeof SERVICE_CLASSIFICATIONS)[number];

export interface ClassifiedServiceRow {
  classification: ServiceClassification;
  serviceCategory: string | null;
  serviceType: string | null;
  reason: string;
  row: Record<string, unknown>;
}

export interface ServiceClassificationSummary {
  COMPUTE_VM: number;
  STORAGE_DISK: number;
  NETWORK_GATEWAY: number;
  NETWORK_EGRESS: number;
  BACKUP: number;
  AUTOMATION: number;
  MONITORING: number;
  LOGIC_APPS: number;
  OTHER: number;
}

export interface ServiceClassificationResult {
  classifiedServices: ClassifiedServiceRow[];
  summary: ServiceClassificationSummary;
}

interface ClassificationDecision {
  classification: ServiceClassification;
  reason: string;
}

const buildEmptySummary = (): ServiceClassificationSummary => ({
  COMPUTE_VM: 0,
  STORAGE_DISK: 0,
  NETWORK_GATEWAY: 0,
  NETWORK_EGRESS: 0,
  BACKUP: 0,
  AUTOMATION: 0,
  MONITORING: 0,
  LOGIC_APPS: 0,
  OTHER: 0
});

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const readFirstString = (
  row: Record<string, unknown>,
  keys: string[]
): string | null => {
  for (const key of keys) {
    if (!(key in row)) {
      continue;
    }
    const value = toStringValue(row[key]);
    if (value) {
      return value;
    }
  }
  return null;
};

const normalize = (value: string | null): string =>
  (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const classifyServiceRow = (
  serviceCategoryRaw: string | null,
  serviceTypeRaw: string | null,
  descriptionRaw: string | null
): ClassificationDecision => {
  const serviceCategory = normalize(serviceCategoryRaw);
  const serviceType = normalize(serviceTypeRaw);
  const description = normalize(descriptionRaw);
  const context = `${serviceCategory} ${serviceType} ${description}`;

  if (
    serviceType.includes("virtual machine") ||
    (serviceCategory.includes("compute") &&
      (description.includes("vcpu") || description.includes("vcore")))
  ) {
    return {
      classification: "COMPUTE_VM",
      reason: "Matched VM/compute pattern"
    };
  }

  if (serviceType.includes("managed disk") || context.includes("disk type")) {
    return {
      classification: "STORAGE_DISK",
      reason: "Matched managed disk/storage pattern"
    };
  }

  if (
    serviceType.includes("application gateway") ||
    serviceType.includes("nat gateway")
  ) {
    return {
      classification: "NETWORK_GATEWAY",
      reason: "Matched network gateway pattern"
    };
  }

  if (
    serviceType.includes("bandwidth") ||
    serviceType.includes("egress") ||
    serviceType.includes("data transfer out")
  ) {
    return {
      classification: "NETWORK_EGRESS",
      reason: "Matched egress/bandwidth pattern"
    };
  }

  if (serviceType.includes("backup")) {
    return {
      classification: "BACKUP",
      reason: "Matched backup service pattern"
    };
  }

  if (serviceType.includes("automation")) {
    return {
      classification: "AUTOMATION",
      reason: "Matched automation service pattern"
    };
  }

  if (
    serviceType.includes("monitor") ||
    context.includes("application insights") ||
    context.includes("log analytics")
  ) {
    return {
      classification: "MONITORING",
      reason: "Matched monitoring service pattern"
    };
  }

  if (serviceType.includes("logic apps")) {
    return {
      classification: "LOGIC_APPS",
      reason: "Matched logic apps service pattern"
    };
  }

  return {
    classification: "OTHER",
    reason: "No deterministic service rule matched"
  };
};

const isHeaderLikeRow = (
  serviceCategoryRaw: string | null,
  serviceTypeRaw: string | null
): boolean => {
  const category = normalize(serviceCategoryRaw);
  const serviceType = normalize(serviceTypeRaw);
  return category.includes("service category") || serviceType === "service type";
};

export const classifyServices = (
  rows: Record<string, unknown>[],
  documentType: DocumentType
): ServiceClassificationResult => {
  const summary = buildEmptySummary();
  if (documentType !== "CLOUD_ESTIMATE") {
    return {
      classifiedServices: [],
      summary
    };
  }

  const classifiedServices: ClassifiedServiceRow[] = [];
  for (const row of rows) {
    const serviceCategory = readFirstString(row, [
      "servicecategory",
      "service_category",
      "service_category_name",
      "microsoft_azure_estimate"
    ]);
    const serviceType = readFirstString(row, [
      "servicetype",
      "service_type",
      "service_type_name",
      "__empty"
    ]);
    const description = readFirstString(row, [
      "description",
      "service_description",
      "__empty_3"
    ]);

    if (isHeaderLikeRow(serviceCategory, serviceType)) {
      continue;
    }
    if (!serviceType) {
      continue;
    }

    const decision = classifyServiceRow(serviceCategory, serviceType, description);
    summary[decision.classification] += 1;
    classifiedServices.push({
      classification: decision.classification,
      serviceCategory,
      serviceType,
      reason: decision.reason,
      row
    });
  }

  return {
    classifiedServices,
    summary
  };
};
