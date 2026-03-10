import logger from "../utils/logger";

const OFFICIAL_AZURE_RETAIL_PREVIEW_VERSION = "2023-01-01-preview";
const PRIMARY_METER_REGION = "'primary'";

const DEFAULT_AZURE_RETAIL_API =
  `https://prices.azure.com/api/retail/prices?api-version=${OFFICIAL_AZURE_RETAIL_PREVIEW_VERSION}&meterRegion=${PRIMARY_METER_REGION}`;

const normalizeMeterRegionParam = (url: string): string => {
  return url.replace(/meterRegion=[^&]+/, `meterRegion=${PRIMARY_METER_REGION}`);
};

const withPrimaryMeterRegion = (inputUrl: string): string => {
  const parsed = new URL(inputUrl);
  parsed.searchParams.set("meterRegion", PRIMARY_METER_REGION);
  return normalizeMeterRegionParam(parsed.toString());
};

const toBaseAzureRetailApi = (): string => {
  const configured = process.env.AZURE_RETAIL_API ?? DEFAULT_AZURE_RETAIL_API;
  let parsed: URL;

  try {
    parsed = new URL(configured);
  } catch {
    parsed = new URL(DEFAULT_AZURE_RETAIL_API);
  }

  parsed.searchParams.set(
    "api-version",
    OFFICIAL_AZURE_RETAIL_PREVIEW_VERSION
  );
  parsed.searchParams.set("meterRegion", PRIMARY_METER_REGION);
  parsed.searchParams.delete("$filter");

  return normalizeMeterRegionParam(parsed.toString());
};

export const AZURE_RETAIL_API = toBaseAzureRetailApi();
export const AZURE_RETAIL_API_VERSION = OFFICIAL_AZURE_RETAIL_PREVIEW_VERSION;
export const AZURE_RETAIL_METER_REGION = PRIMARY_METER_REGION;

export const ensureAzureRetailPrimaryMeterFilter = (url: string): string => {
  return withPrimaryMeterRegion(url);
};

export const buildAzureRetailQueryUrl = (filter: string): string => {
  const separator = AZURE_RETAIL_API.includes("?") ? "&" : "?";
  const queryUrl = `${AZURE_RETAIL_API}${separator}$filter=${encodeURIComponent(
    filter
  )}`;
  return withPrimaryMeterRegion(queryUrl);
};

logger.info("AZURE_API_VERSION_UPDATED_2023_PREVIEW", {
  apiVersion: AZURE_RETAIL_API_VERSION,
  azureRetailApi: AZURE_RETAIL_API
});

logger.info("PRIMARY_METER_FILTER_ENABLED", {
  meterRegion: AZURE_RETAIL_METER_REGION,
  azureRetailApi: AZURE_RETAIL_API
});
