import { ProviderSkuOffer } from "@geo-nap/common";
import { isPaygOnlyOffer, normalizeProvider, ProviderAdapter } from "./providerAdapter";

const GPU_FAMILIES = new Set(["P", "G"]);

export class AwsAdapter implements ProviderAdapter {
  readonly provider = "aws" as const;

  normalize(rawOffers: ProviderSkuOffer[]): ProviderSkuOffer[] {
    return rawOffers
      .filter((offer) => normalizeProvider(offer.provider) === this.provider)
      .filter(isPaygOnlyOffer)
      .filter((offer) => offer.gpuCountPerVm > 0)
      .filter((offer) => GPU_FAMILIES.has(String(offer.gpuFamily ?? "").toUpperCase()))
      .map((offer) => ({ ...offer, provider: this.provider }));
  }
}
