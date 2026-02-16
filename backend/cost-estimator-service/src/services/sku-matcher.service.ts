import { CloudProvider } from "../domain/cost.model";
import { HttpError } from "../utils/http-error.util";
import logger from "../utils/logger";
import { listLatestCloudPrices } from "./cloud-pricing.repository";
import { VM_REFERENCE_CATALOG } from "./azure-retail-pricing.service";

export interface SkuMatcherInput {
  provider: CloudProvider;
  region: string;
  requiredCPU: number;
  requiredRAM: number;
  osType?: "linux" | "windows";
}

export interface MatchedSku {
  provider: CloudProvider;
  region: string;
  serviceName: string;
  skuName: string;
  osType?: "linux" | "windows";
  vcpu: number;
  memoryGiB: number;
  retailPrice: number;
  currency: string;
  unit: string;
  pricingVersion: string;
  score: number;
}

interface SkuCandidate {
  serviceName: string;
  skuName: string;
  osType?: "linux" | "windows";
  vcpu: number;
  memoryGiB: number;
  retailPrice: number;
  currency: string;
  unit: string;
  pricingVersion: string;
}

const FALLBACK_CATALOG: Record<CloudProvider, SkuCandidate[]> = {
  azure: [
    {
      serviceName: "Virtual Machines",
      skuName: "Standard_NC8as_T4_v3|linux|vcpu=8|ramGiB=56",
      osType: "linux",
      vcpu: 8,
      memoryGiB: 56,
      retailPrice: 0.44,
      currency: "USD",
      unit: "1 Hour",
      pricingVersion: "fallback-v1"
    },
    {
      serviceName: "Virtual Machines",
      skuName: "Standard_ND96asr_v4|linux|vcpu=96|ramGiB=900",
      osType: "linux",
      vcpu: 96,
      memoryGiB: 900,
      retailPrice: 8.3,
      currency: "USD",
      unit: "1 Hour",
      pricingVersion: "fallback-v1"
    }
  ],
  aws: [
    {
      serviceName: "AmazonEC2",
      skuName: "g5.2xlarge|linux|vcpu=8|ramGiB=32",
      osType: "linux",
      vcpu: 8,
      memoryGiB: 32,
      retailPrice: 1.19,
      currency: "USD",
      unit: "Hrs",
      pricingVersion: "fallback-v1"
    },
    {
      serviceName: "AmazonEC2",
      skuName: "p4d.24xlarge|linux|vcpu=96|ramGiB=1152",
      osType: "linux",
      vcpu: 96,
      memoryGiB: 1152,
      retailPrice: 32.77,
      currency: "USD",
      unit: "Hrs",
      pricingVersion: "fallback-v1"
    }
  ],
  gcp: [
    {
      serviceName: "Compute Engine VM",
      skuName: "g2-standard-8|linux|vcpu=8|ramGiB=32",
      osType: "linux",
      vcpu: 8,
      memoryGiB: 32,
      retailPrice: 1.12,
      currency: "USD",
      unit: "hour",
      pricingVersion: "fallback-v1"
    },
    {
      serviceName: "Compute Engine VM",
      skuName: "a2-highgpu-8g|linux|vcpu=96|ramGiB=680",
      osType: "linux",
      vcpu: 96,
      memoryGiB: 680,
      retailPrice: 20.45,
      currency: "USD",
      unit: "hour",
      pricingVersion: "fallback-v1"
    }
  ]
};

const AZURE_SKU_TO_SHAPE = new Map(
  VM_REFERENCE_CATALOG.map((vm) => [vm.sku.toLowerCase(), vm])
);

const parseFloatSafe = (value: string): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseAwsCandidate = (
  serviceName: string,
  skuName: string,
  retailPrice: number,
  currency: string,
  unit: string,
  pricingVersion: string
): SkuCandidate | null => {
  const match = skuName.match(
    /^([^|]+)\|(linux|windows)\|vcpu=([0-9]+(?:\.[0-9]+)?)\|ramGiB=([0-9]+(?:\.[0-9]+)?)$/i
  );
  if (!match) {
    return null;
  }

  const vcpu = parseFloatSafe(match[3]);
  const memoryGiB = parseFloatSafe(match[4]);
  if (vcpu === null || memoryGiB === null) {
    return null;
  }

  return {
    serviceName,
    skuName,
    osType: match[2].toLowerCase() === "windows" ? "windows" : "linux",
    vcpu,
    memoryGiB,
    retailPrice,
    currency,
    unit,
    pricingVersion
  };
};

const parseAzureCandidate = (
  serviceName: string,
  skuName: string,
  retailPrice: number,
  currency: string,
  unit: string,
  pricingVersion: string
): SkuCandidate | null => {
  const encoded = skuName.match(
    /^([^|]+)\|(linux|windows)\|vcpu=([0-9]+(?:\.[0-9]+)?)\|ramGiB=([0-9]+(?:\.[0-9]+)?)$/i
  );
  if (encoded) {
    const vcpu = parseFloatSafe(encoded[3]);
    const memoryGiB = parseFloatSafe(encoded[4]);
    if (vcpu === null || memoryGiB === null) {
      return null;
    }

    return {
      serviceName,
      skuName,
      osType: encoded[2].toLowerCase() === "windows" ? "windows" : "linux",
      vcpu,
      memoryGiB,
      retailPrice,
      currency,
      unit,
      pricingVersion
    };
  }

  const legacy = skuName.match(/^([^|]+)\|(linux|windows)$/i);
  if (!legacy) {
    return null;
  }

  const vmShape = AZURE_SKU_TO_SHAPE.get(legacy[1].toLowerCase());
  if (!vmShape) {
    return null;
  }

  return {
    serviceName,
    skuName,
    osType: legacy[2].toLowerCase() === "windows" ? "windows" : "linux",
    vcpu: vmShape.vcpu,
    memoryGiB: vmShape.ramGB,
    retailPrice,
    currency,
    unit,
    pricingVersion
  };
};

const parseGcpCandidate = (
  serviceName: string,
  skuName: string,
  retailPrice: number,
  currency: string,
  unit: string,
  pricingVersion: string
): SkuCandidate | null => {
  const match = skuName.match(
    /^([^|]+)\|(linux|windows)\|vcpu=([0-9]+(?:\.[0-9]+)?)\|ramGiB=([0-9]+(?:\.[0-9]+)?)$/i
  );
  if (!match) {
    return null;
  }

  const vcpu = parseFloatSafe(match[3]);
  const memoryGiB = parseFloatSafe(match[4]);
  if (vcpu === null || memoryGiB === null) {
    return null;
  }

  return {
    serviceName,
    skuName,
    osType: match[2].toLowerCase() === "windows" ? "windows" : "linux",
    vcpu,
    memoryGiB,
    retailPrice,
    currency,
    unit,
    pricingVersion
  };
};

const getComputeServiceNames = (provider: CloudProvider): string[] => {
  switch (provider) {
    case "azure":
      return ["Virtual Machines"];
    case "aws":
      return ["AmazonEC2"];
    case "gcp":
      return ["Compute Engine VM"];
    default:
      return [];
  }
};

const parseCandidate = (
  provider: CloudProvider,
  serviceName: string,
  skuName: string,
  retailPrice: number,
  currency: string,
  unit: string,
  pricingVersion: string
): SkuCandidate | null => {
  if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
    return null;
  }

  switch (provider) {
    case "azure":
      return parseAzureCandidate(
        serviceName,
        skuName,
        retailPrice,
        currency,
        unit,
        pricingVersion
      );
    case "aws":
      return parseAwsCandidate(
        serviceName,
        skuName,
        retailPrice,
        currency,
        unit,
        pricingVersion
      );
    case "gcp":
      return parseGcpCandidate(
        serviceName,
        skuName,
        retailPrice,
        currency,
        unit,
        pricingVersion
      );
    default:
      return null;
  }
};

export const matchComputeSku = async (input: SkuMatcherInput): Promise<MatchedSku> => {
  const serviceNames = getComputeServiceNames(input.provider);
  let candidates: SkuCandidate[] = [];

  for (const serviceName of serviceNames) {
    let rows: Awaited<ReturnType<typeof listLatestCloudPrices>> = [];
    try {
      rows = await listLatestCloudPrices(input.provider, input.region, serviceName);
    } catch (err) {
      logger.warn("SKU matcher DB lookup failed", {
        provider: input.provider,
        region: input.region,
        serviceName,
        error: err instanceof Error ? err.message : String(err)
      });
      rows = [];
    }
    const parsed = rows
      .map((row) =>
        parseCandidate(
          input.provider,
          row.serviceName,
          row.skuName,
          row.retailPrice,
          row.currency,
          row.unit,
          row.pricingVersion
        )
      )
      .filter((row): row is SkuCandidate => row !== null);
    candidates = candidates.concat(parsed);
  }

  logger.info("SKU matcher candidate stats", {
    provider: input.provider,
    region: input.region,
    dbComputeSkuCount: candidates.length
  });

  if (candidates.length === 0) {
    const fallback = FALLBACK_CATALOG[input.provider] ?? [];
    if (fallback.length > 0) {
      logger.warn("SKU matcher using fallback compute catalog", {
        provider: input.provider,
        region: input.region
      });
      candidates = fallback;
    }
  }

  if (input.osType) {
    candidates = candidates.filter((row) => row.osType === input.osType);
  }

  if (candidates.length === 0) {
    throw new HttpError(
      422,
      `No compute SKU catalog found for provider=${input.provider} region=${input.region}`
    );
  }

  const feasible = candidates
    .filter((row) => row.vcpu >= input.requiredCPU && row.memoryGiB >= input.requiredRAM)
    .map((row) => ({
      ...row,
      score: row.vcpu - input.requiredCPU + (row.memoryGiB - input.requiredRAM)
    }))
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      if (a.retailPrice !== b.retailPrice) {
        return a.retailPrice - b.retailPrice;
      }
      if (a.vcpu !== b.vcpu) {
        return a.vcpu - b.vcpu;
      }
      return a.memoryGiB - b.memoryGiB;
    });

  if (feasible.length === 0) {
    const maxCpu = Math.max(...candidates.map((row) => row.vcpu));
    const maxRam = Math.max(...candidates.map((row) => row.memoryGiB));
    throw new HttpError(
      422,
      `No compute SKU can satisfy requested resources in provider=${input.provider} region=${input.region}. Requested CPU=${input.requiredCPU}, RAM=${input.requiredRAM} GiB, max available CPU=${maxCpu}, RAM=${maxRam} GiB`
    );
  }

  const best = feasible[0];
  return {
    provider: input.provider,
    region: input.region,
    serviceName: best.serviceName,
    skuName: best.skuName,
    osType: best.osType,
    vcpu: best.vcpu,
    memoryGiB: best.memoryGiB,
    retailPrice: best.retailPrice,
    currency: best.currency,
    unit: best.unit,
    pricingVersion: best.pricingVersion,
    score: best.score
  };
};
