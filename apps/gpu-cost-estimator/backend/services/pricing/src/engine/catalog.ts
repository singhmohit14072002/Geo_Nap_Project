import awsOffers from "../data/aws-offers.json";
import azureOffers from "../data/azure-offers.json";
import gcpOffers from "../data/gcp-offers.json";
import vastOffers from "../data/vast-offers.json";
import transferRates from "../data/transfer-rates.json";
import regionCoordinates from "../data/region-coordinates.json";
import { ProviderSkuOffer, TransferRate, RegionCoordinate } from "@geo-nap/common";
import { normalizeGpuOffers } from "@geo-nap/provider-adapters";

const rawOffers: ProviderSkuOffer[] = [
  ...(awsOffers as ProviderSkuOffer[]),
  ...(azureOffers as ProviderSkuOffer[]),
  ...(gcpOffers as ProviderSkuOffer[]),
  ...(vastOffers as ProviderSkuOffer[])
];

const gpuOffers = normalizeGpuOffers(rawOffers);

export function getGpuOffers(provider?: string): ProviderSkuOffer[] {
  if (!provider) {
    return gpuOffers;
  }
  return gpuOffers.filter((offer) => offer.provider === provider);
}

export function getTransferRates(): TransferRate[] {
  return transferRates as TransferRate[];
}

export function getRegionCoordinates(): RegionCoordinate[] {
  return regionCoordinates as RegionCoordinate[];
}
