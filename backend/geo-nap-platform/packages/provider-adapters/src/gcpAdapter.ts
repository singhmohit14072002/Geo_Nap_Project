import { ProviderSkuOffer } from "@geo-nap/common";
import { isPaygOnlyOffer, normalizeProvider, ProviderAdapter } from "./providerAdapter";

const GPU_FAMILIES = new Set(["A2", "A3", "G2", "N1"]);

export class GcpAdapter implements ProviderAdapter {
  readonly provider = "gcp" as const;

  normalize(rawOffers: ProviderSkuOffer[]): ProviderSkuOffer[] {
    return rawOffers
      .filter((offer) => normalizeProvider(offer.provider) === this.provider)
      .filter(isPaygOnlyOffer)
      .filter((offer) => offer.gpuCountPerVm > 0)
      .filter((offer) => GPU_FAMILIES.has(String(offer.gpuFamily ?? "").toUpperCase()))
      .map((offer) => ({ ...offer, provider: this.provider }));
  }
}
