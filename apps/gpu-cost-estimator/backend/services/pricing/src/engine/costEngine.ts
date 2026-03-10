import {
  CloudProvider,
  PlanRequest,
  ProviderSimulationResult,
  ProviderSkuOffer,
  TransferRate,
  ValidationError
} from "@geo-nap/common";
import { distanceKm, findCoordinate, parseDataLocation } from "./geo";
import { getRegionCoordinates, getTransferRates } from "./catalog";

function resolveTransferRate(
  sourceProvider: string,
  sourceRegion: string,
  destinationProvider: string,
  destinationRegion: string,
  rates: TransferRate[]
): TransferRate | null {
  if (sourceProvider === destinationProvider && sourceRegion === destinationRegion) {
    return {
      sourceProvider: sourceProvider as CloudProvider,
      sourceRegion,
      destinationProvider: destinationProvider as CloudProvider,
      destinationRegion,
      egressUsdPerGb: 0,
      bandwidthUsdPerGb: 0
    };
  }

  const exact = rates.find(
    (rate) =>
      rate.sourceProvider === sourceProvider &&
      rate.sourceRegion === sourceRegion &&
      rate.destinationProvider === destinationProvider &&
      rate.destinationRegion === destinationRegion
  );
  if (exact) {
    return exact;
  }

  const wildcard = rates.find(
    (rate) =>
      rate.sourceProvider === sourceProvider &&
      rate.sourceRegion === sourceRegion &&
      rate.destinationProvider === destinationProvider &&
      rate.destinationRegion === "*"
  );

  if (wildcard) {
    return wildcard;
  }

  const sourceWildcardExactDestination = rates.find(
    (rate) =>
      rate.sourceProvider === sourceProvider &&
      rate.sourceRegion === "*" &&
      rate.destinationProvider === destinationProvider &&
      rate.destinationRegion === destinationRegion
  );
  if (sourceWildcardExactDestination) {
    return sourceWildcardExactDestination;
  }

  const sourceAndDestinationWildcard = rates.find(
    (rate) =>
      rate.sourceProvider === sourceProvider &&
      rate.sourceRegion === "*" &&
      rate.destinationProvider === destinationProvider &&
      rate.destinationRegion === "*"
  );
  if (sourceAndDestinationWildcard) {
    return sourceAndDestinationWildcard;
  }

  // Deterministic pricing only: if no table match exists, scenario is invalid.
  return null;
}

export type OfferIneligibilityReason =
  | "parity_mode_required"
  | "ram_requirement_not_met"
  | "gpu_count_per_vm_invalid"
  | "insufficient_capacity"
  | "machine_price_missing"
  | "transfer_rate_missing";

interface OfferEligibilityContext {
  dataProvider: string;
  dataRegion: string;
  instancesRequired: number;
  machinePricePerHourUsd: number;
  transfer: TransferRate;
}

export function evaluateOfferEligibility(
  request: PlanRequest,
  offer: ProviderSkuOffer
): { eligible: true; context: OfferEligibilityContext } | { eligible: false; reason: OfferIneligibilityReason } {
  if (!request.parity_mode) {
    return { eligible: false, reason: "parity_mode_required" };
  }

  if (offer.ramGbPerVm < request.ram_requirement) {
    return { eligible: false, reason: "ram_requirement_not_met" };
  }

  if (!Number.isFinite(offer.gpuCountPerVm) || offer.gpuCountPerVm <= 0) {
    return { eligible: false, reason: "gpu_count_per_vm_invalid" };
  }

  const instancesRequired = Math.ceil(request.gpu_count / offer.gpuCountPerVm);
  const maxGpuCapacity = offer.maxInstances * offer.gpuCountPerVm;
  if (request.gpu_count > maxGpuCapacity) {
    return { eligible: false, reason: "insufficient_capacity" };
  }

  const machinePricePerHourUsd =
    offer.machinePricePerHourUsd ??
    ((offer.gpuUnitPricePerHourUsd ?? 0) + (offer.vmBasePricePerHourUsd ?? 0));
  if (machinePricePerHourUsd <= 0) {
    return { eligible: false, reason: "machine_price_missing" };
  }

  const data = parseDataLocation(request.data_location);
  const rates = getTransferRates();
  const transfer = resolveTransferRate(data.provider, data.region, offer.provider, offer.region, rates);
  if (!transfer) {
    return { eligible: false, reason: "transfer_rate_missing" };
  }

  return {
    eligible: true,
    context: {
      dataProvider: data.provider,
      dataRegion: data.region,
      instancesRequired,
      machinePricePerHourUsd,
      transfer
    }
  };
}

export function estimateCostForOffer(
  planId: string,
  request: PlanRequest,
  offer: ProviderSkuOffer,
  batchId = "00000000-0000-0000-0000-000000000000",
  scenarioId = "00000000-0000-0000-0000-000000000000"
): ProviderSimulationResult | null {
  const eligibility = evaluateOfferEligibility(request, offer);
  if (!eligibility.eligible) {
    if (eligibility.reason === "parity_mode_required") {
      throw new ValidationError("Pricing service supports parity_mode=true only");
    }
    return null;
  }

  const { dataProvider, dataRegion, instancesRequired, machinePricePerHourUsd, transfer } = eligibility.context;
  const data = { provider: dataProvider, region: dataRegion };

  const gpuCountTotal = instancesRequired * offer.gpuCountPerVm;
  const computeCost = machinePricePerHourUsd * instancesRequired * request.duration_hours;

  const egressCost = transfer.egressUsdPerGb * request.dataset_size_gb;
  const bandwidthCost = transfer.bandwidthUsdPerGb * request.dataset_size_gb;

  const coords = getRegionCoordinates();
  const dataCoord = findCoordinate(coords, data.provider, data.region);
  const offerCoord = findCoordinate(coords, offer.provider, offer.region);
  const geoDistance = dataCoord && offerCoord ? distanceKm(dataCoord, offerCoord) : Number.MAX_SAFE_INTEGER;
  const totalCost = computeCost + egressCost + bandwidthCost;

  const computeFormula = `${machinePricePerHourUsd.toFixed(3)} $/hour x ${instancesRequired} instance(s) x ${request.duration_hours} hour(s)`;
  const egressFormula = `${transfer.egressUsdPerGb.toFixed(3)} $/GB x ${request.dataset_size_gb.toFixed(2)} GB`;
  const bandwidthFormula = `${transfer.bandwidthUsdPerGb.toFixed(3)} $/GB x ${request.dataset_size_gb.toFixed(2)} GB`;

  return {
    planId,
    batchId,
    scenarioId,
    provider: offer.provider,
    region: offer.region,
    sku: offer.sku,
    instancesRequired,
    gpuCountTotal,
    vcpuCountPerVm: offer.vcpuCountPerVm,
    ramGbPerVm: offer.ramGbPerVm,
    machinePricePerHourUsd,
    computeCost,
    egressCost,
    bandwidthCost,
    totalCost,
    distanceKm: geoDistance,
    outputSummary: {
      machineDetails: {
        provider: offer.provider,
        region: offer.region,
        machineType: offer.sku,
        numberOfGpus: offer.gpuCountPerVm,
        includedRamGb: offer.ramGbPerVm,
        includedVcpu: offer.vcpuCountPerVm,
        machineHourlyPriceUsd: machinePricePerHourUsd,
        instanceCount: instancesRequired
      },
      computeCostExplanation: `Compute Cost: $${computeCost.toFixed(
        2
      )}. This cost includes GPU, CPU, and RAM provided by the selected machine type. Formula: ${computeFormula}.`,
      dataTransferExplanation: `Data Egress Cost: $${egressCost.toFixed(
        2
      )}. This cost is charged for transferring training data from ${data.provider.toUpperCase()} ${data.region} to ${offer.provider.toUpperCase()} ${offer.region}. Formula: ${egressFormula}.`,
      bandwidthExplanation: `Bandwidth Cost: $${bandwidthCost.toFixed(
        2
      )}. Estimated network transfer cost for dataset movement. Formula: ${bandwidthFormula}.`,
      totalCostSummary: `Total Estimated Cost: $${totalCost.toFixed(2)}.`
    },
    assumptions: [
      "PAYG public pricing",
      "Spot, preemptible, and low-priority SKUs are excluded",
      "Parity mode (no RTT/network penalty)",
      "GPU VM hourly price already includes GPU, CPU, and RAM",
      "RAM requirement is a machine eligibility filter only",
      "One-time dataset transfer",
      "GPU-only SKU families",
      "Deterministic transfer-rate lookup from static pricing table"
    ]
  };
}
