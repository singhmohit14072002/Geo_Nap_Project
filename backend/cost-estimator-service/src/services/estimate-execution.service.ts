import { ProviderCostResult } from "../domain/cost.model";
import { EstimateSchemaInput } from "../schemas/estimate.schema";
import { HttpError } from "../utils/http-error.util";
import logger from "../utils/logger";
import { attachOptimizationRecommendations } from "./optimization-engine.service";
import { getPricingService } from "./pricing-factory.service";
import { estimateAzureNormalizedServices, NormalizedAzureService } from "./universal-azure-pricing-engine.service";
import { classifiedServiceSchema, azureEstimateRowSchema } from "../schemas/estimate.schema";
import { z } from "zod";
import { extractAzureService, AzureServiceInput } from "./azure-universal-extractor.service";
import { resolveAzurePrice } from "./universal-azure-pricing.service";

type ClassifiedService = z.infer<typeof classifiedServiceSchema>;
type AzureEstimateRow = z.infer<typeof azureEstimateRowSchema>;

export interface AzurePricingResponse {
  provider: "AZURE";
  services: Array<{
    serviceName: string;
    skuName?: string;
    armSkuName?: string;
    meterName?: string;
    region: string;
    unitType: string;
    usageQuantity: number;
    unitPrice: number;
    monthlyCost: number;
    pricingSource?: "AZURE_EXPORT" | "AZURE_RETAIL_API";
  }>;
  totalMonthlyCost: number;
  totalYearlyCost: number;
}

const normalizeRegionKey = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "") || "centralindia";

const classifyAzureService = (row: AzureEstimateRow): ClassifiedService["classification"] => {
  const cat = row.serviceCategory.toLowerCase();
  const type = row.serviceType.toLowerCase();
  if (type.includes("virtual machines") || type.includes("virtual machine")) return "COMPUTE_VM";
  if (cat.includes("compute") && type.includes("virtual")) return "COMPUTE_VM";
  if (type.includes("managed disks") || type.includes("managed disk")) return "STORAGE_DISK";
  if (type.includes("application gateway") || type.includes("nat gateway") || type.includes("virtual network"))
    return "NETWORK_GATEWAY";
  if (type.includes("bandwidth") || type.includes("data transfer")) return "NETWORK_EGRESS";
  if (type.includes("backup")) return "BACKUP";
  if (type.includes("automation")) return "AUTOMATION";
  if (type.includes("monitor")) return "MONITORING";
  if (type.includes("logic apps") || type.includes("logic app")) return "LOGIC_APPS";
  return "OTHER";
};

const parseNumber = (text: string, fallback = 0): number => {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : fallback;
};

const extractPricingParameters = (
  row: AzureEstimateRow,
  classification: ClassifiedService["classification"]
): NonNullable<ClassifiedService["pricingParameters"]> => {
  const desc = row.description || "";
  let quantity = parseNumber(desc, 1);
  if (quantity <= 0) quantity = 1;
  let hours = parseNumber(desc, 730);
  if (hours < 1) hours = 730;
  const osType = desc.toLowerCase().includes("windows") ? "windows" : "linux";

  if (classification === "COMPUTE_VM") {
    const skuMatch = desc.match(/([a-z]\d+[a-z0-9._-]*(?:v\d+)?)/i);
    const rawSku = skuMatch ? skuMatch[1].replace(/\s+/g, "") : "F2s";
    return {
      serviceName: "Virtual Machines",
      skuName: rawSku,
      hours,
      quantity,
      osType
    };
  }

  if (classification === "STORAGE_DISK") {
    const skuMatch = desc.match(/(p\d{1,2})/i);
    const skuName = skuMatch ? skuMatch[1].toUpperCase() : "P10";
    return {
      serviceName: "Managed Disks",
      skuName,
      quantity
    };
  }

  if (classification === "NETWORK_EGRESS") {
    const usageGB = parseNumber(desc, 0);
    return {
      serviceName: "Bandwidth",
      usageGB,
      quantity: 1
    };
  }

  if (classification === "NETWORK_GATEWAY") {
    return {
      serviceName: "Application Gateway",
      quantity,
      hours
    };
  }

  if (classification === "BACKUP") {
    const usageGB = parseNumber(desc, 0);
    return {
      serviceName: "Backup",
      usageGB,
      quantity: 1
    };
  }

  if (classification === "AUTOMATION") {
    return {
      serviceName: "Automation",
      quantity,
      hours
    };
  }

  if (classification === "LOGIC_APPS") {
    return {
      serviceName: "Logic Apps",
      quantity,
      hours
    };
  }

  return {
    serviceName: row.serviceType || row.serviceCategory || "Other",
    quantity
  };
};

export interface AzureEstimateResponse {
  mode: "AZURE_ESTIMATE_MODE";
  services: Array<{
    serviceName: string;
    skuName?: string;
    region: string;
    unitPrice: number;
    quantity?: number;
    hours?: number;
    usageGB?: number;
    monthlyCost: number;
  }>;
  totalMonthlyCost: number;
  totalYearlyCost: number;
}

export interface AzurePricingResponse {
  provider: "AZURE";
  services: Array<{
    serviceName: string;
    skuName?: string;
    armSkuName?: string;
    meterName?: string;
    region: string;
    unitType: string;
    usageQuantity: number;
    unitPrice: number;
    monthlyCost: number;
    pricingSource?: "AZURE_EXPORT" | "AZURE_RETAIL_API";
  }>;
  totalMonthlyCost: number;
  totalYearlyCost: number;
}

const hasAzureEstimatePayload = (
  payload: EstimateSchemaInput
): payload is EstimateSchemaInput & {
  azureEstimate: {
    documentType: "CLOUD_ESTIMATE";
    mode?: "AZURE_ESTIMATE_MODE" | "GENERIC_INFRA_MODE";
    classifiedServices: Array<{
      classification:
        | "COMPUTE_VM"
        | "STORAGE_DISK"
        | "NETWORK_GATEWAY"
        | "NETWORK_EGRESS"
        | "BACKUP"
        | "AUTOMATION"
        | "MONITORING"
        | "LOGIC_APPS"
        | "OTHER";
      serviceCategory?: string | null;
      serviceType?: string | null;
      reason?: string;
      pricingParameters?: {
        serviceName: string;
        skuName?: string;
        quantity?: number;
        hours?: number;
        usageGB?: number;
        osType?: "windows" | "linux";
      };
      row: Record<string, unknown>;
    }>;
  };
} => {
  if (!("azureEstimate" in payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const azureEstimate = record.azureEstimate;
  if (!azureEstimate || typeof azureEstimate !== "object") {
    return false;
  }
  const value = azureEstimate as Record<string, unknown>;
  if (value.documentType !== "CLOUD_ESTIMATE") {
    return false;
  }
  if (!Array.isArray(value.classifiedServices)) {
    return false;
  }
  return value.classifiedServices.length > 0;
};

const DEFAULT_MONTHLY_HOURS = Number(process.env.DEFAULT_MONTHLY_HOURS ?? "730");

const normalizeRegion = (value: string, fallback: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "")
    .trim();
  return normalized || fallback;
};

const classifyByServiceType = (
  serviceTypeRaw: string | null
): NormalizedAzureService["classification"] => {
  const type = (serviceTypeRaw ?? "").toLowerCase();
  if (type === "virtual machines" || type === "virtual machine") {
    return "COMPUTE_VM";
  }
  if (type === "managed disks" || type === "managed disk") {
    return "STORAGE_DISK";
  }
  if (type === "bandwidth" || type === "internet egress") {
    return "NETWORK_EGRESS";
  }
  if (type === "application gateway" || type === "azure nat gateway") {
    return "NETWORK_GATEWAY";
  }
  if (type === "automation") {
    return "AUTOMATION";
  }
  if (type === "azure backup" || type === "backup") {
    return "BACKUP";
  }
  return "OTHER";
};

const mapServiceName = (serviceType: string | null): string => {
  const type = (serviceType ?? "").trim();
  if (type.toLowerCase() === "azure nat gateway") {
    return "Virtual Network";
  }
  if (type) {
    return type;
  }
  return "Unknown Service";
};

const buildNormalizedAzureRow = (
  region: string,
  service: ClassifiedService
): NormalizedAzureService => {
  const params = (service.pricingParameters ?? {}) as {
    serviceName?: string;
    skuName?: string;
    quantity?: number;
    hours?: number;
    usageGB?: number;
    osType?: "windows" | "linux";
  };
  const targetRegion =
    params.serviceName?.toLowerCase() === "bandwidth" && service.row?.region
      ? normalizeRegion(String(service.row.region), region)
      : normalizeRegion(String(service.row?.region ?? region), region);

  return {
    classification: classifyByServiceType(service.serviceType ?? null),
    serviceName: params.serviceName ?? mapServiceName(service.serviceType ?? null),
    skuName: params.skuName ?? null,
    region: targetRegion,
    quantity:
      typeof params.quantity === "number" && params.quantity > 0
        ? params.quantity
        : 1,
    usageHours:
      typeof params.hours === "number" && params.hours > 0
        ? params.hours
        : DEFAULT_MONTHLY_HOURS,
    usageGB:
      typeof params.usageGB === "number" && params.usageGB >= 0 ? params.usageGB : 0,
    osType: params.osType,
    capacityUnits: 0,
    sourceServiceType: service.serviceType ?? null,
    sourceRow: service.row
  };
};

const priceAzureNormalizedRow = async (
  region: string,
  row: NormalizedAzureService
): Promise<ProviderCostResult> => {
  return estimateAzureNormalizedServices({
    region,
    services: [row]
  });
};

const priceVirtualMachine = async (region: string, row: NormalizedAzureService) =>
  priceAzureNormalizedRow(region, { ...row, classification: "COMPUTE_VM", serviceName: "Virtual Machines" });

const priceManagedDisk = async (region: string, row: NormalizedAzureService) =>
  priceAzureNormalizedRow(region, { ...row, classification: "STORAGE_DISK", serviceName: "Storage" });

const priceApplicationGateway = async (region: string, row: NormalizedAzureService) =>
  priceAzureNormalizedRow(region, { ...row, classification: "NETWORK_GATEWAY", serviceName: "Application Gateway" });

const priceNatGateway = async (region: string, row: NormalizedAzureService) =>
  priceAzureNormalizedRow(region, { ...row, classification: "NETWORK_GATEWAY", serviceName: "Virtual Network" });

const priceInternetEgress = async (region: string, row: NormalizedAzureService) =>
  priceAzureNormalizedRow(region, { ...row, classification: "NETWORK_EGRESS", serviceName: "Bandwidth" });

const priceVnetTransfer = async (region: string, row: NormalizedAzureService) =>
  priceAzureNormalizedRow(region, { ...row, classification: "NETWORK_EGRESS", serviceName: "Virtual Network" });

const priceBackup = async (region: string, row: NormalizedAzureService) =>
  priceAzureNormalizedRow(region, { ...row, classification: "BACKUP", serviceName: "Recovery Services" });

const priceAutomation = async (region: string, row: NormalizedAzureService) =>
  priceAzureNormalizedRow(region, { ...row, classification: "AUTOMATION", serviceName: "Automation" });

const processAzureRow = async (region: string, row: NormalizedAzureService): Promise<ProviderCostResult | null> => {
  const key = (row.sourceServiceType ?? row.serviceName).toLowerCase();
  switch (key) {
    case "virtual machines":
    case "virtual machine":
      {
        const priced = await priceVirtualMachine(region, row);
        const detail = priced.details[0];
        logger.info("VM_PRICED_DEBUG", {
          armSkuName: row.skuName,
          unitPrice: detail?.unitPrice,
          monthlyCost: detail?.monthlyCost
        });
        return priced;
      }
    case "managed disks":
    case "managed disk":
      return priceManagedDisk(region, row);
    case "application gateway":
      return priceApplicationGateway(region, row);
    case "azure nat gateway":
      return priceNatGateway(region, row);
    case "bandwidth":
      return priceInternetEgress(region, row);
    case "virtual network":
      return priceVnetTransfer(region, row);
    case "azure backup":
    case "backup":
      return priceBackup(region, row);
    case "automation":
      return priceAutomation(region, row);
    default:
      logger.warn("Unsupported Azure estimate row serviceType; skipping", {
        serviceType: row.sourceServiceType,
        serviceName: row.serviceName
      });
      return null;
  }
};

const aggregateAzureResults = (
  region: string,
  rows: Array<ProviderCostResult | null>,
  normalizedRows: NormalizedAzureService[]
): AzureEstimateResponse => {
  const services: AzureEstimateResponse["services"] = [];

  rows.forEach((res, idx) => {
    if (!res) return;
    const detail = res.details[0];
    const row = normalizedRows[idx];
    const monthlyCost = detail?.monthlyCost ?? res.summary.monthlyTotal ?? 0;
    services.push({
      serviceName: row.serviceName,
      skuName: row.skuName ?? detail?.sku,
      region: normalizeRegion(row.region, region),
      unitPrice: detail?.unitPrice ?? 0,
      quantity: row.quantity,
      hours: row.usageHours,
      usageGB: row.usageGB,
      monthlyCost
    });
  });

  const totalMonthlyCost = Number(
    services.reduce((sum, svc) => sum + (svc?.monthlyCost ?? 0), 0).toFixed(2)
  );
  const totalYearlyCost = Number((totalMonthlyCost * 12).toFixed(2));

  logger.info("AZURE_ESTIMATE_RESPONSE_SENT", {
    serviceCount: services.length,
    totalMonthlyCost
  });

  return {
    mode: "AZURE_ESTIMATE_MODE",
    services,
    totalMonthlyCost,
    totalYearlyCost
  };
};

const runAzureUniversalPipeline = async (
  payload: EstimateSchemaInput & { azureEstimate: { classifiedServices: unknown[]; mode?: string } }
): Promise<AzurePricingResponse> => {
  logger.info("UNIVERSAL_SERVICE_MODEL_ENABLED");
  const services = payload.azureEstimate.classifiedServices
    .map((item) => {
      const rawRow = azureEstimateRowSchema.safeParse(item);
      if (rawRow.success) {
        return extractAzureService(rawRow.data);
      }
      const classified = classifiedServiceSchema.safeParse(item);
      if (classified.success) {
        const rowCandidate = azureEstimateRowSchema.safeParse(classified.data.row);
        if (rowCandidate.success) {
          return extractAzureService(rowCandidate.data);
        }
      }
      return null;
    })
    .filter(Boolean) as AzureServiceInput[];

  const resolveRegion = (svcRegion: string | null | undefined, uiRegion: string) => {
    const norm = (val: string) =>
      val
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9-]/g, "");
    if (svcRegion && String(svcRegion).trim()) return norm(String(svcRegion));
    if (uiRegion && String(uiRegion).trim()) return norm(String(uiRegion));
    return "centralindia";
  };

  const resolvedServices = services.map((svc) => ({
    ...svc,
    extractedRegion: svc.region,
    region: resolveRegion(svc.region, payload.region)
  }));

  resolvedServices.forEach((svc) => 
    logger.info("REGION RESOLUTION", {
      service: svc.serviceName,
      extractedRegion: svc.extractedRegion,
      uiRegion: payload.region,
      effectiveRegion: svc.region
    })
  );

  if (resolvedServices.length === 0) {
    throw new HttpError(422, "No Azure services could be extracted from estimate file");
  }

  const pricedFromExport: AzurePricingResponse["services"] = [];
  const toResolve: AzureServiceInput[] = [];
  for (const svc of resolvedServices) {
    if (typeof svc.sourceMonthlyCost === "number" && Number.isFinite(svc.sourceMonthlyCost)) {
      const monthlyCost = svc.sourceMonthlyCost;
      const usageQuantity = svc.usageQuantity > 0 ? svc.usageQuantity : 1;
      const unitPrice = usageQuantity > 0 ? monthlyCost / usageQuantity : monthlyCost;
      pricedFromExport.push({
        serviceName: svc.displayName ?? svc.serviceName,
        skuName: svc.armSkuName,
        armSkuName: svc.armSkuName,
        meterName: svc.meterName ?? "AZURE_EXPORT",
        region: svc.region,
        unitType: svc.unitType,
        usageQuantity,
        unitPrice,
        monthlyCost,
        pricingSource: "AZURE_EXPORT"
      });
      continue;
    }
    toResolve.push(svc);
  }

  // Resolve remaining services sequentially to avoid Azure Retail API throttling (429).
  const pricedFromApi: AzurePricingResponse["services"] = [];
  let failedCount = 0;
  for (const svc of toResolve) {
    try {
      const result = await resolveAzurePrice(svc);
      pricedFromApi.push({
        ...result,
        serviceName: svc.displayName ?? result.serviceName,
        pricingSource: "AZURE_RETAIL_API"
      });
    } catch (error) {
      failedCount += 1;
      logger.warn("AZURE_SERVICE_PRICE_FAILED", {
        service: svc.serviceName,
        sku: svc.armSkuName,
        region: svc.region,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const priced = [...pricedFromExport, ...pricedFromApi];

  if (priced.length === 0) {
    throw new HttpError(422, "No Azure retail pricing record matched the requested parameters");
  }

  if (pricedFromApi.length < toResolve.length) {
    logger.warn("AZURE_PRICING_PARTIAL_SUCCESS", {
      requested: resolvedServices.length,
      priced: priced.length,
      failed: failedCount
    });
  }

  const totalMonthly = Number(priced.reduce((sum, s) => sum + (s.monthlyCost ?? 0), 0).toFixed(2));
  return {
    provider: "AZURE",
    services: priced,
    totalMonthlyCost: totalMonthly,
    totalYearlyCost: Number((totalMonthly * 12).toFixed(2))
  };
};

const runAzureEstimatePipeline = async (
  payload: EstimateSchemaInput & { azureEstimate: { classifiedServices: unknown[]; mode?: string } }
): Promise<AzureEstimateResponse> => {
  const ignoredProviders = payload.cloudProviders.filter((provider) => provider !== "azure");
  if (ignoredProviders.length > 0) {
    logger.warn("Ignoring non-Azure providers in AZURE_ESTIMATE_MODE", { ignoredProviders });
  }

  const validated: ReturnType<typeof classifiedServiceSchema.parse>[] = [];
  const rawRows: AzureEstimateRow[] = [];

  payload.azureEstimate.classifiedServices.forEach((item) => {
    const parsed = classifiedServiceSchema.safeParse(item);
    if (parsed.success) {
      validated.push(parsed.data);
      return;
    }
    const rawParsed = azureEstimateRowSchema.safeParse(item);
    if (rawParsed.success) {
      rawRows.push(rawParsed.data);
    }
  });

  rawRows.forEach((row) => {
    const classification = classifyAzureService(row);
    validated.push({
      classification,
      serviceCategory: row.serviceCategory,
      serviceType: row.serviceType,
      pricingParameters: extractPricingParameters(row, classification),
      row
    });
  });

  if (validated.length === 0) {
    throw new HttpError(422, "No valid classified services provided for azureEstimate mode");
  }

  const normalizedRows: NormalizedAzureService[] = validated.map((service) =>
    buildNormalizedAzureRow(payload.region, service)
  );

  const pricingJobs = normalizedRows.map((row) => processAzureRow(payload.region, row));
  const pricedRows = await Promise.all(pricingJobs);

  if (pricedRows.filter(Boolean).length === 0) {
    throw new HttpError(422, "No Azure estimate rows could be priced");
  }

  return aggregateAzureResults(payload.region, pricedRows, normalizedRows);
};

const runGenericInfraPipeline = async (payload: EstimateSchemaInput): Promise<ProviderCostResult[]> => {
  if (!("requirement" in payload)) {
    throw new HttpError(422, "Missing requirement payload for standard estimation mode");
  }
  const requirement = (payload as EstimateSchemaInput & { requirement: NonNullable<EstimateSchemaInput["requirement"]> })
    .requirement;

  const uniqueProviders = [...new Set(payload.cloudProviders)];
  const settled = await Promise.allSettled(
    uniqueProviders.map(async (provider) => {
      const pricingService = getPricingService(provider);
      return pricingService.estimate({
        provider,
        region: payload.region,
        requirement
      });
    })
  );

  const successful = settled
    .filter(
      (result): result is PromiseFulfilledResult<ProviderCostResult> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value);

  const failed = settled.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  if (failed.length > 0) {
    failed.forEach((result) => {
      logger.warn("Provider estimation failed", {
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
      });
    });
  }

  if (successful.length === 0) {
    throw new HttpError(
      422,
      "No provider could produce a valid estimate for the requested resources"
    );
  }

  return attachOptimizationRecommendations(successful);
};

export const runEstimateComputation = async (
  payload: EstimateSchemaInput
): Promise<ProviderCostResult[] | AzurePricingResponse | AzureEstimateResponse> => {
  if (hasAzureEstimatePayload(payload)) {
    const mode = payload.azureEstimate.mode ?? "AZURE_ESTIMATE_MODE";

    if (mode === "AZURE_ESTIMATE_MODE") {
      // Use the universal Azure pricing pipeline (service-based, strict pricing resolver)
      return runAzureUniversalPipeline(payload);
    }

    logger.info("Falling back to GENERIC_INFRA_MODE despite azureEstimate presence", {
      mode
    });
    return runGenericInfraPipeline(payload);
  }

  return runGenericInfraPipeline(payload);
};
