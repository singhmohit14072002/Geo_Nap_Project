import { CloudPricing } from "@prisma/client";
import { CostDetailItem, ProviderCostResult } from "../domain/cost.model";
import { buildBreakdown, buildSummary } from "../utils/calculator.util";
import logger from "../utils/logger";
import { CloudPricingService, PricingServiceInput } from "./pricing.types";
import { getLatestCloudPrice } from "./cloud-pricing.repository";
import { matchComputeSku } from "./sku-matcher.service";

const AWS_USD_TO_INR = Number(process.env.AWS_USD_TO_INR ?? "83");

const FALLBACK = {
  storagePerGbPerMonthInr: 5,
  egressPerGbPerMonthInr: 6,
  databaseBasePerMonthInr: 2200
};

const round2 = (value: number): number => Number(value.toFixed(2));

const toInr = (price: number, currency: string): number | null => {
  const code = currency.toUpperCase();
  if (code === "INR") {
    return round2(price);
  }
  if (code === "USD") {
    return round2(price * AWS_USD_TO_INR);
  }
  return null;
};

const toInrFromCloudRow = (row: CloudPricing | null): number | null => {
  if (!row) {
    return null;
  }
  return toInr(row.retailPrice, row.currency);
};

const safeGetLatestCloudPrice = async (
  provider: string,
  region: string,
  serviceName: string,
  skuName: string
): Promise<CloudPricing | null> => {
  try {
    return await getLatestCloudPrice(provider, region, serviceName, skuName);
  } catch (err) {
    logger.warn("AWS pricing DB read failed", {
      provider,
      region,
      serviceName,
      skuName,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
};

export class AwsPricingService implements CloudPricingService {
  async estimate(input: PricingServiceInput): Promise<ProviderCostResult> {
    let compute = 0;
    const details: CostDetailItem[] = [];
    let pricingVersion: string | null = null;

    for (const reqItem of input.requirement.compute) {
      const matched = await matchComputeSku({
        provider: "aws",
        region: input.region,
        requiredCPU: reqItem.vCPU,
        requiredRAM: reqItem.ramGB,
        osType: reqItem.osType
      });

      const hourlyInr = toInr(matched.retailPrice, matched.currency);
      if (hourlyInr === null) {
        throw new Error(
          `Unsupported currency for matched AWS SKU ${matched.skuName}: ${matched.currency}`
        );
      }

      const monthlyCost = round2(hourlyInr * 730 * reqItem.quantity);
      compute += monthlyCost;
      pricingVersion = pricingVersion ?? matched.pricingVersion;

      details.push({
        serviceType: "compute",
        name: `EC2 compute (${reqItem.osType})`,
        sku: `${matched.skuName} (${matched.vcpu} vCPU, ${matched.memoryGiB} GB RAM)`,
        quantity: reqItem.quantity,
        unitPrice: hourlyInr,
        monthlyCost,
        metadata: {
          requiredVcpu: reqItem.vCPU,
          requiredRamGb: reqItem.ramGB,
          provisionedVcpu: matched.vcpu,
          provisionedRamGb: matched.memoryGiB,
          hoursPerMonth: 730,
          osType: reqItem.osType,
          quantity: reqItem.quantity
        }
      });
    }

    const storageRow = await safeGetLatestCloudPrice(
      "aws",
      input.region,
      "AmazonEBS",
      "gp3-storage"
    );
    const egressRow = await safeGetLatestCloudPrice(
      "aws",
      input.region,
      "AWSDataTransfer",
      "DataTransfer-Out-Bytes"
    );

    const storagePerGbInr =
      toInrFromCloudRow(storageRow) ?? FALLBACK.storagePerGbPerMonthInr;
    const egressPerGbInr =
      toInrFromCloudRow(egressRow) ?? FALLBACK.egressPerGbPerMonthInr;

    if (!storageRow) {
      logger.warn("AWS storage fallback used", {
        region: input.region
      });
    } else {
      pricingVersion = pricingVersion ?? storageRow.pricingVersion;
    }
    if (!egressRow) {
      logger.warn("AWS egress fallback used", {
        region: input.region
      });
    } else {
      pricingVersion = pricingVersion ?? egressRow.pricingVersion;
    }

    const storage = round2(
      input.requirement.compute.reduce(
        (sum, item) => sum + item.storageGB * storagePerGbInr * item.quantity,
        0
      )
    );
    const database = round2(
      FALLBACK.databaseBasePerMonthInr +
        input.requirement.database.storageGB * storagePerGbInr
    );
    const networkEgress = round2(
      input.requirement.network.dataEgressGB * egressPerGbInr
    );

    details.push(
      {
        serviceType: "storage",
        name: "EBS gp3 storage",
        sku: `${storagePerGbInr.toFixed(2)} INR/GB-month`,
        quantity: 1,
        unitPrice: storagePerGbInr,
        monthlyCost: storage,
        metadata: {
          storageTier: "premium",
          highIopsRequired: false
        }
      },
      {
        serviceType: "database",
        name: `Managed ${input.requirement.database.engine} database`,
        sku: input.requirement.database.ha ? "HA enabled" : "Single zone",
        quantity: 1,
        unitPrice: FALLBACK.databaseBasePerMonthInr,
        monthlyCost: database
      },
      {
        serviceType: "network-egress",
        name: "Data egress",
        sku: `${input.requirement.network.dataEgressGB} GB`,
        quantity: 1,
        unitPrice: egressPerGbInr,
        monthlyCost: networkEgress,
        metadata: {
          dataEgressGb: input.requirement.network.dataEgressGB
        }
      }
    );

    const breakdown = buildBreakdown(
      round2(compute),
      storage,
      database,
      networkEgress
    );
    const summary = buildSummary(breakdown);

    return {
      provider: input.provider,
      region: input.region,
      summary,
      breakdown,
      details,
      pricingVersion: pricingVersion ?? "aws-db-unknown",
      calculatedAt: new Date()
    };
  }
}
