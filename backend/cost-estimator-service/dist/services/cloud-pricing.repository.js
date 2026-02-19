"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLatestCloudPricesAnyRegion = exports.listLatestCloudPrices = exports.getLatestCloudPrice = exports.upsertCloudPricingRecords = void 0;
const prisma_1 = __importDefault(require("../db/prisma"));
const upsertCloudPricingRecords = async (rows) => {
    for (const row of rows) {
        await prisma_1.default.cloudPricing.upsert({
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
exports.upsertCloudPricingRecords = upsertCloudPricingRecords;
const getLatestCloudPrice = async (provider, region, serviceName, skuName) => {
    return prisma_1.default.cloudPricing.findFirst({
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
exports.getLatestCloudPrice = getLatestCloudPrice;
const listLatestCloudPrices = async (provider, region, serviceName) => {
    return prisma_1.default.cloudPricing.findMany({
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
exports.listLatestCloudPrices = listLatestCloudPrices;
const listLatestCloudPricesAnyRegion = async (provider, serviceName) => {
    return prisma_1.default.cloudPricing.findMany({
        where: {
            provider,
            serviceName
        },
        orderBy: {
            lastUpdated: "desc"
        }
    });
};
exports.listLatestCloudPricesAnyRegion = listLatestCloudPricesAnyRegion;
