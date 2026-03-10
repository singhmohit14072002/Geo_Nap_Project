import { CloudProvider, ProviderSkuOffer } from "@geo-nap/common";

export interface ProviderAdapter {
  readonly provider: CloudProvider;
  normalize(rawOffers: ProviderSkuOffer[]): ProviderSkuOffer[];
}

const DISALLOWED_PRICING_TERMS = /(spot|preemptible|low[\s\-_]?priority|interruptible)/i;

export function normalizeProvider(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeBillingModel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isPaygOnlyOffer(offer: ProviderSkuOffer): boolean {
  if (normalizeBillingModel(offer.billingModel) !== "payg") {
    return false;
  }
  return !DISALLOWED_PRICING_TERMS.test(offer.sku);
}
