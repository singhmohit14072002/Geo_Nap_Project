import { ProviderSkuOffer } from "@geo-nap/common";
import { isPaygOnlyOffer, normalizeProvider, ProviderAdapter } from "./providerAdapter";

const GPU_FAMILIES = new Set(["NC", "ND", "NV"]);

export class AzureAdapter implements ProviderAdapter {
  readonly provider = "azure" as const;

  normalize(rawOffers: ProviderSkuOffer[]): ProviderSkuOffer[] {
    return rawOffers
      .filter((offer) => normalizeProvider(offer.provider) === this.provider)
      .filter(isPaygOnlyOffer)
      .filter((offer) => offer.gpuCountPerVm > 0)
      .filter((offer) => GPU_FAMILIES.has(String(offer.gpuFamily ?? "").toUpperCase()))
      .map((offer) => ({ ...offer, provider: this.provider }));
  }
}
