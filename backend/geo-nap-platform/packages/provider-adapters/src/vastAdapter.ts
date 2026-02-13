import { ProviderSkuOffer } from "@geo-nap/common";
import { isPaygOnlyOffer, normalizeProvider, ProviderAdapter } from "./providerAdapter";

export class VastAdapter implements ProviderAdapter {
  readonly provider = "vast" as const;

  normalize(rawOffers: ProviderSkuOffer[]): ProviderSkuOffer[] {
    return rawOffers
      .filter((offer) => normalizeProvider(offer.provider) === this.provider)
      .filter(isPaygOnlyOffer)
      .filter((offer) => offer.gpuCountPerVm > 0)
      .map((offer) => ({ ...offer, provider: this.provider }));
  }
}
