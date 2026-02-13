import { CloudPricing } from "@prisma/client";
import { CostDetailItem, ProviderCostResult } from "../domain/cost.model";
import { buildBreakdown, buildSummary } from "../utils/calculator.util";
import { CloudPricingService, PricingServiceInput } from "./pricing.types";
import { getLatestCloudPrice } from "./cloud-pricing.repository";
import { normalizeGcpRegion } from "../utils/gcp-region-mapper";
import { matchComputeSku } from "./sku-matcher.service";

const GCP_USD_TO_INR = Number(process.env.GCP_USD_TO_INR ?? "83");

const FALLBACK = {
  storagePerGbPerMonthInr: 4.5,
  egressPerGbInr: 5.5,
  databaseBasePerMonthInr: 2100
};

const round2 = (value: number): number => Number(value.toFixed(2));

const toInr = (price: number, currency: string): number | null => {
  const code = currency.toUpperCase();
  if (code === "INR") {
    return round2(price);
  }
  if (code === "USD") {
    return round2(price * GCP_USD_TO_INR);
  }
  return null;
};

const toInrFromRow = (row: CloudPricing | null): number | null => {
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
    console.warn(
      `[gcp-pricing] DB read failed provider=${provider} region=${region} service=${serviceName} sku=${skuName}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
};

export class GcpPricingService implements CloudPricingService {
  async estimate(input: PricingServiceInput): Promise<ProviderCostResult> {
    const region = normalizeGcpRegion(input.region);
    let compute = 0;
    const details: CostDetailItem[] = [];
    let pricingVersion: string | null = null;

    for (const item of input.requirement.compute) {
      const matched = await matchComputeSku({
        provider: "gcp",
        region,
        requiredCPU: item.vCPU,
        requiredRAM: item.ramGB,
        osType: item.osType
      });

      const hourlyInr = toInr(matched.retailPrice, matched.currency);
      if (hourlyInr === null) {
        throw new Error(
          `Unsupported currency for matched GCP SKU ${matched.skuName}: ${matched.currency}`
        );
      }

      const monthlyCost = round2(hourlyInr * 730 * item.quantity);
      compute += monthlyCost;
      pricingVersion = pricingVersion ?? matched.pricingVersion;

      details.push({
        serviceType: "compute",
        name: `Compute Engine VM (${item.osType})`,
        sku: `${matched.skuName} (${matched.vcpu} vCPU, ${matched.memoryGiB} GB RAM)`,
        quantity: item.quantity,
        unitPrice: hourlyInr,
        monthlyCost
      });
    }

    const diskRow = await safeGetLatestCloudPrice(
      "gcp",
      region,
      "Persistent Disk",
      "pd-capacity"
    );
    const egressRow = await safeGetLatestCloudPrice(
      "gcp",
      region,
      "Network Egress",
      "internet-egress"
    );

    const diskPerGbMonthInr =
      toInrFromRow(diskRow) ?? FALLBACK.storagePerGbPerMonthInr;
    const egressPerGbInr = toInrFromRow(egressRow) ?? FALLBACK.egressPerGbInr;

    if (!diskRow) {
      console.warn(
        `[gcp-pricing] missing disk price for region=${region}. Using fallback storage rate.`
      );
    } else {
      pricingVersion = pricingVersion ?? diskRow.pricingVersion;
    }
    if (!egressRow) {
      console.warn(
        `[gcp-pricing] missing network egress price for region=${region}. Using fallback egress rate.`
      );
    } else {
      pricingVersion = pricingVersion ?? egressRow.pricingVersion;
    }

    const storage = round2(
      input.requirement.compute.reduce(
        (sum, item) => sum + item.storageGB * diskPerGbMonthInr * item.quantity,
        0
      )
    );
    const database = round2(
      FALLBACK.databaseBasePerMonthInr +
        input.requirement.database.storageGB * diskPerGbMonthInr
    );
    const networkEgress = round2(
      input.requirement.network.dataEgressGB * egressPerGbInr
    );

    details.push(
      {
        serviceType: "storage",
        name: "Persistent Disk capacity",
        sku: `${diskPerGbMonthInr.toFixed(2)} INR/GB-month`,
        quantity: 1,
        unitPrice: diskPerGbMonthInr,
        monthlyCost: storage
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
        name: "Network internet egress",
        sku: `${input.requirement.network.dataEgressGB} GB`,
        quantity: 1,
        unitPrice: egressPerGbInr,
        monthlyCost: networkEgress
      }
    );

    const breakdown = buildBreakdown(round2(compute), storage, database, networkEgress);
    const summary = buildSummary(breakdown);

    return {
      provider: input.provider,
      region,
      summary,
      breakdown,
      details,
      pricingVersion: pricingVersion ?? "gcp-db-unknown",
      calculatedAt: new Date()
    };
  }
}

