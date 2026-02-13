"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncGcpPricingToDatabase = exports.syncAwsPricingToDatabase = exports.syncAzurePricingToDatabase = void 0;
const azure_retail_pricing_service_1 = require("./azure-retail-pricing.service");
const cloud_pricing_repository_1 = require("./cloud-pricing.repository");
const aws_pricing_api_service_1 = require("./aws-pricing-api.service");
const gcp_pricing_api_service_1 = require("./gcp-pricing-api.service");
const AZURE_SYNC_REGIONS = (process.env.AZURE_SYNC_REGIONS ?? "centralindia,eastus,westus2")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const AWS_SYNC_REGIONS = (process.env.AWS_SYNC_REGIONS ?? "ap-south-1,us-east-1")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const GCP_SYNC_REGIONS = (process.env.GCP_SYNC_REGIONS ?? "asia-south1,asia-south2")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const buildVersionTag = (provider) => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    return `${provider}-${yyyy}-${mm}-${dd}`;
};
const filterVmItems = (items, osType) => {
    return items.filter((item) => {
        const price = (0, azure_retail_pricing_service_1.getEffectivePrice)(item);
        if (price <= 0) {
            return false;
        }
        const product = `${item.productName ?? ""}`.toLowerCase();
        const meter = `${item.meterName ?? ""}`.toLowerCase();
        if (product.includes("spot") || meter.includes("spot")) {
            return false;
        }
        if (product.includes("low priority") || meter.includes("low priority")) {
            return false;
        }
        const isWindows = product.includes("windows");
        return osType === "windows" ? isWindows : !isWindows;
    });
};
const buildVmRecords = async (region, version) => {
    const records = [];
    for (const vm of azure_retail_pricing_service_1.VM_REFERENCE_CATALOG) {
        const vmFilter = `serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and armSkuName eq '${vm.sku}' and priceType eq 'Consumption'`;
        const items = await (0, azure_retail_pricing_service_1.fetchAzureRetailPrices)(vmFilter);
        const linuxUsd = (0, azure_retail_pricing_service_1.pickVmHourlyPriceUsd)(items, "linux");
        if (linuxUsd !== null) {
            const linuxItems = filterVmItems(items, "linux");
            const currency = linuxItems[0]?.currencyCode ?? "USD";
            records.push({
                provider: "azure",
                region,
                serviceName: "Virtual Machines",
                skuName: `${vm.sku}|linux|vcpu=${vm.vcpu}|ramGiB=${vm.ramGB}`,
                unit: "1 Hour",
                retailPrice: linuxUsd,
                currency,
                pricingVersion: version
            });
        }
        const windowsUsd = (0, azure_retail_pricing_service_1.pickVmHourlyPriceUsd)(items, "windows");
        if (windowsUsd !== null) {
            const windowsItems = filterVmItems(items, "windows");
            const currency = windowsItems[0]?.currencyCode ?? "USD";
            records.push({
                provider: "azure",
                region,
                serviceName: "Virtual Machines",
                skuName: `${vm.sku}|windows|vcpu=${vm.vcpu}|ramGiB=${vm.ramGB}`,
                unit: "1 Hour",
                retailPrice: windowsUsd,
                currency,
                pricingVersion: version
            });
        }
    }
    return records;
};
const buildStorageRecord = async (region, version) => {
    const storageItems = await (0, azure_retail_pricing_service_1.fetchAzureRetailPrices)(`serviceName eq 'Storage' and armRegionName eq '${region}' and priceType eq 'Consumption'`);
    const storageUsd = (0, azure_retail_pricing_service_1.pickStoragePerGbMonthUsd)(storageItems);
    if (storageUsd === null) {
        return [];
    }
    const currency = storageItems.find((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)?.currencyCode ??
        "USD";
    return [
        {
            provider: "azure",
            region,
            serviceName: "Storage",
            skuName: "Standard_LRS_Hot",
            unit: "1 GB/Month",
            retailPrice: storageUsd,
            currency,
            pricingVersion: version
        }
    ];
};
const buildBandwidthRecord = async (region, version) => {
    const bandwidthItems = await (0, azure_retail_pricing_service_1.fetchAzureRetailPrices)(`serviceName eq 'Bandwidth' and armRegionName eq '${region}' and priceType eq 'Consumption'`);
    const egressUsd = (0, azure_retail_pricing_service_1.pickEgressPerGbUsd)(bandwidthItems);
    if (egressUsd === null) {
        return [];
    }
    const currency = bandwidthItems.find((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)?.currencyCode ??
        "USD";
    return [
        {
            provider: "azure",
            region,
            serviceName: "Bandwidth",
            skuName: "DataTransferOut",
            unit: "1 GB",
            retailPrice: egressUsd,
            currency,
            pricingVersion: version
        }
    ];
};
const buildPostgresRecord = async (region, version) => {
    const postgresItems = await (0, azure_retail_pricing_service_1.fetchAzureRetailPrices)(`serviceName eq 'Azure Database for PostgreSQL' and armRegionName eq '${region}' and priceType eq 'Consumption'`);
    const postgresHourlyUsd = (0, azure_retail_pricing_service_1.pickPostgresBaseHourlyUsd)(postgresItems);
    if (postgresHourlyUsd === null) {
        return [];
    }
    const currency = postgresItems.find((item) => (0, azure_retail_pricing_service_1.getEffectivePrice)(item) > 0)?.currencyCode ??
        "USD";
    return [
        {
            provider: "azure",
            region,
            serviceName: "Azure Database for PostgreSQL",
            skuName: "FlexibleServerVCore",
            unit: "1 Hour",
            retailPrice: postgresHourlyUsd,
            currency,
            pricingVersion: version
        }
    ];
};
const syncAzureRegion = async (region, version) => {
    const vmRecords = await buildVmRecords(region, version);
    const storage = await buildStorageRecord(region, version);
    const bandwidth = await buildBandwidthRecord(region, version);
    const postgres = await buildPostgresRecord(region, version);
    const rows = [...vmRecords, ...storage, ...bandwidth, ...postgres];
    if (rows.length > 0) {
        await (0, cloud_pricing_repository_1.upsertCloudPricingRecords)(rows);
    }
    return rows.length;
};
const syncAzurePricingToDatabase = async () => {
    const version = buildVersionTag("azure");
    let recordsSynced = 0;
    for (const region of AZURE_SYNC_REGIONS) {
        try {
            const synced = await syncAzureRegion(region, version);
            recordsSynced += synced;
            console.log(`[pricing-sync] azure region=${region} synced=${synced} version=${version}`);
        }
        catch (err) {
            console.warn(`[pricing-sync] azure region=${region} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return {
        version,
        regions: AZURE_SYNC_REGIONS,
        recordsSynced
    };
};
exports.syncAzurePricingToDatabase = syncAzurePricingToDatabase;
const syncAwsRegion = async (region, version) => {
    const rows = await (0, aws_pricing_api_service_1.fetchAndNormalizeAwsPricingRows)(region, version);
    if (rows.length === 0) {
        console.warn(`[pricing-sync] aws region=${region} has zero rows after normalization`);
        return 0;
    }
    await (0, cloud_pricing_repository_1.upsertCloudPricingRecords)(rows);
    return rows.length;
};
const syncAwsPricingToDatabase = async () => {
    const version = buildVersionTag("aws");
    let recordsSynced = 0;
    for (const region of AWS_SYNC_REGIONS) {
        try {
            const synced = await syncAwsRegion(region, version);
            recordsSynced += synced;
            console.log(`[pricing-sync] aws region=${region} synced=${synced} version=${version}`);
        }
        catch (err) {
            console.warn(`[pricing-sync] aws region=${region} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return {
        version,
        regions: AWS_SYNC_REGIONS,
        recordsSynced
    };
};
exports.syncAwsPricingToDatabase = syncAwsPricingToDatabase;
const syncGcpRegion = async (region, version) => {
    const rows = await (0, gcp_pricing_api_service_1.fetchAndNormalizeGcpPricingRows)(region, version);
    if (rows.length === 0) {
        console.warn(`[pricing-sync] gcp region=${region} has zero rows after normalization`);
        return 0;
    }
    await (0, cloud_pricing_repository_1.upsertCloudPricingRecords)(rows);
    return rows.length;
};
const syncGcpPricingToDatabase = async () => {
    const version = buildVersionTag("gcp");
    let recordsSynced = 0;
    for (const region of GCP_SYNC_REGIONS) {
        try {
            const synced = await syncGcpRegion(region, version);
            recordsSynced += synced;
            console.log(`[pricing-sync] gcp region=${region} synced=${synced} version=${version}`);
        }
        catch (err) {
            console.warn(`[pricing-sync] gcp region=${region} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return {
        version,
        regions: GCP_SYNC_REGIONS,
        recordsSynced
    };
};
exports.syncGcpPricingToDatabase = syncGcpPricingToDatabase;
