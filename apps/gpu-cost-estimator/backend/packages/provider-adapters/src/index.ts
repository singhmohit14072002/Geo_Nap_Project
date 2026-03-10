import { CloudProvider, createLogger, ProviderSkuOffer } from "@geo-nap/common";
import { AwsAdapter } from "./awsAdapter";
import { AzureAdapter } from "./azureAdapter";
import { GcpAdapter } from "./gcpAdapter";
import { VastAdapter } from "./vastAdapter";
import { normalizeProvider, ProviderAdapter } from "./providerAdapter";

const adapters: ProviderAdapter[] = [new AwsAdapter(), new AzureAdapter(), new GcpAdapter(), new VastAdapter()];
const EXPECTED_PROVIDERS: CloudProvider[] = ["aws", "azure", "gcp", "vast"];
const logger = createLogger("provider-adapters");

export function normalizeGpuOffers(rawOffers: ProviderSkuOffer[]): ProviderSkuOffer[] {
  const rawProviderCounts = EXPECTED_PROVIDERS.reduce<Record<CloudProvider, number>>((acc, provider) => {
    acc[provider] = rawOffers.filter((offer) => normalizeProvider(offer.provider) === provider).length;
    return acc;
  }, { aws: 0, azure: 0, gcp: 0, vast: 0 });

  const normalizedByProvider = EXPECTED_PROVIDERS.reduce<Record<CloudProvider, number>>((acc, provider) => {
    acc[provider] = 0;
    return acc;
  }, { aws: 0, azure: 0, gcp: 0, vast: 0 });

  const merged = adapters.flatMap((adapter) => {
    const normalized = adapter.normalize(rawOffers);
    normalizedByProvider[adapter.provider] = normalized.length;
    if (normalized.length === 0) {
      logger.warn({ provider: adapter.provider, rawOffers: rawProviderCounts[adapter.provider] }, "adapter produced zero GPU offers");
    }
    return normalized;
  });

  logger.info(
    {
      rawTotal: rawOffers.length,
      normalizedTotal: merged.length,
      rawByProvider: rawProviderCounts,
      normalizedByProvider
    },
    "provider offer normalization completed"
  );

  const unique = new Map<string, ProviderSkuOffer>();

  for (const offer of merged) {
    const key = `${offer.provider}:${offer.region}:${offer.sku}`;
    if (!unique.has(key)) {
      unique.set(key, offer);
    }
  }

  return [...unique.values()];
}

export * from "./providerAdapter";
export * from "./awsAdapter";
export * from "./azureAdapter";
export * from "./gcpAdapter";
export * from "./vastAdapter";
