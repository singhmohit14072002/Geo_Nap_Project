"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAzureRetailQueryUrl = exports.ensureAzureRetailPrimaryMeterFilter = exports.AZURE_RETAIL_METER_REGION = exports.AZURE_RETAIL_API_VERSION = exports.AZURE_RETAIL_API = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const OFFICIAL_AZURE_RETAIL_PREVIEW_VERSION = "2023-01-01-preview";
const PRIMARY_METER_REGION = "'primary'";
const DEFAULT_AZURE_RETAIL_API = `https://prices.azure.com/api/retail/prices?api-version=${OFFICIAL_AZURE_RETAIL_PREVIEW_VERSION}&meterRegion=${PRIMARY_METER_REGION}`;
const normalizeMeterRegionParam = (url) => {
    return url.replace(/meterRegion=[^&]+/, `meterRegion=${PRIMARY_METER_REGION}`);
};
const withPrimaryMeterRegion = (inputUrl) => {
    const parsed = new URL(inputUrl);
    parsed.searchParams.set("meterRegion", PRIMARY_METER_REGION);
    return normalizeMeterRegionParam(parsed.toString());
};
const toBaseAzureRetailApi = () => {
    const configured = process.env.AZURE_RETAIL_API ?? DEFAULT_AZURE_RETAIL_API;
    let parsed;
    try {
        parsed = new URL(configured);
    }
    catch {
        parsed = new URL(DEFAULT_AZURE_RETAIL_API);
    }
    parsed.searchParams.set("api-version", OFFICIAL_AZURE_RETAIL_PREVIEW_VERSION);
    parsed.searchParams.set("meterRegion", PRIMARY_METER_REGION);
    parsed.searchParams.delete("$filter");
    return normalizeMeterRegionParam(parsed.toString());
};
exports.AZURE_RETAIL_API = toBaseAzureRetailApi();
exports.AZURE_RETAIL_API_VERSION = OFFICIAL_AZURE_RETAIL_PREVIEW_VERSION;
exports.AZURE_RETAIL_METER_REGION = PRIMARY_METER_REGION;
const ensureAzureRetailPrimaryMeterFilter = (url) => {
    return withPrimaryMeterRegion(url);
};
exports.ensureAzureRetailPrimaryMeterFilter = ensureAzureRetailPrimaryMeterFilter;
const buildAzureRetailQueryUrl = (filter) => {
    const separator = exports.AZURE_RETAIL_API.includes("?") ? "&" : "?";
    const queryUrl = `${exports.AZURE_RETAIL_API}${separator}$filter=${encodeURIComponent(filter)}`;
    return withPrimaryMeterRegion(queryUrl);
};
exports.buildAzureRetailQueryUrl = buildAzureRetailQueryUrl;
logger_1.default.info("AZURE_API_VERSION_UPDATED_2023_PREVIEW", {
    apiVersion: exports.AZURE_RETAIL_API_VERSION,
    azureRetailApi: exports.AZURE_RETAIL_API
});
logger_1.default.info("PRIMARY_METER_FILTER_ENABLED", {
    meterRegion: exports.AZURE_RETAIL_METER_REGION,
    azureRetailApi: exports.AZURE_RETAIL_API
});
