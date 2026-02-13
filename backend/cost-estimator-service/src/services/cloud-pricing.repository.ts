import prisma from "../db/prisma";
import { CloudPricing } from "@prisma/client";

export interface CloudPricingUpsertInput {
  provider: string;
  region: string;
  serviceName: string;
  skuName: string;
  unit: string;
  retailPrice: number;
  currency: string;
  pricingVersion: string;
}

export const upsertCloudPricingRecords = async (
  rows: CloudPricingUpsertInput[]
): Promise<void> => {
  for (const row of rows) {
    await prisma.cloudPricing.upsert({
      where: {
        provider_region_service_sku_unit_unique: {
          provider: row.provider,
          region: row.region,
          serviceName: row.serviceName,
          skuName: row.skuName,
          unit: row.unit
        }
      },
      create: {
        provider: row.provider,
        region: row.region,
        serviceName: row.serviceName,
        skuName: row.skuName,
        unit: row.unit,
        retailPrice: row.retailPrice,
        currency: row.currency,
        pricingVersion: row.pricingVersion
      },
      update: {
        retailPrice: row.retailPrice,
        currency: row.currency,
        pricingVersion: row.pricingVersion
      }
    });
  }
};

export const getLatestCloudPrice = async (
  provider: string,
  region: string,
  serviceName: string,
  skuName: string
) => {
  return prisma.cloudPricing.findFirst({
    where: {
      provider,
      region,
      serviceName,
      skuName
    },
    orderBy: {
      lastUpdated: "desc"
    }
  });
};

export const listLatestCloudPrices = async (
  provider: string,
  region: string,
  serviceName: string
): Promise<CloudPricing[]> => {
  return prisma.cloudPricing.findMany({
    where: {
      provider,
      region,
      serviceName
    },
    orderBy: {
      lastUpdated: "desc"
    }
  });
};
