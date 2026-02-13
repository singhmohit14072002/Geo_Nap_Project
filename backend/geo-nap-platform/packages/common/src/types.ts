import { z } from "zod";

export type CloudProvider = "aws" | "azure" | "gcp" | "vast";
export type BillingModel = "payg" | "spot" | "preemptible" | "reserved" | "savings" | "other";

export const planRequestSchema = z.object({
  data_location: z.string().regex(/^(aws|azure|gcp|vast)-[a-z0-9-]+$/),
  gpu_count: z.number().int().positive(),
  ram_requirement: z.number().positive(),
  dataset_size_gb: z.number().min(0),
  duration_hours: z.number().positive(),
  parity_mode: z.boolean().default(true),
  result_limit: z.number().int().min(1).max(20).default(5)
});

export type PlanRequest = z.infer<typeof planRequestSchema>;

export type PlanStatus = "queued" | "coordinating" | "simulating" | "recommended" | "failed";

export interface PlanRecord {
  id: string;
  request: PlanRequest;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ProviderSkuOffer {
  provider: CloudProvider;
  region: string;
  sku: string;
  billingModel: BillingModel;
  gpuFamily: string;
  gpuCountPerVm: number;
  vcpuCountPerVm: number;
  ramGbPerVm: number;
  machinePricePerHourUsd: number;
  maxInstances: number;
  // Backward compatibility for legacy catalogs; not used in parity math.
  gpuUnitPricePerHourUsd?: number;
  vmBasePricePerHourUsd?: number;
}

export interface TransferRate {
  sourceProvider: CloudProvider;
  sourceRegion: string;
  destinationProvider: CloudProvider;
  destinationRegion: string | "*";
  egressUsdPerGb: number;
  bandwidthUsdPerGb: number;
}

export interface ProviderSimulationResult {
  planId: string;
  batchId: string;
  scenarioId: string;
  provider: CloudProvider;
  region: string;
  sku: string;
  instancesRequired: number;
  gpuCountTotal: number;
  vcpuCountPerVm: number;
  ramGbPerVm: number;
  machinePricePerHourUsd: number;
  computeCost: number;
  egressCost: number;
  bandwidthCost: number;
  totalCost: number;
  distanceKm: number;
  outputSummary: {
    machineDetails: {
      provider: CloudProvider;
      region: string;
      machineType: string;
      numberOfGpus: number;
      includedRamGb: number;
      includedVcpu: number;
      machineHourlyPriceUsd: number;
      instanceCount: number;
    };
    computeCostExplanation: string;
    dataTransferExplanation: string;
    bandwidthExplanation: string;
    totalCostSummary: string;
  };
  assumptions: string[];
}

export interface RankedRecommendation extends ProviderSimulationResult {
  rank: number;
  availabilityScore: number;
  availabilityPenalty: number;
  blendedScore: number;
}

export interface RecommendationBundle {
  rankedAlternatives: RankedRecommendation[];
  cheapestOption: RankedRecommendation | null;
  nearestOption: RankedRecommendation | null;
  balancedOption: RankedRecommendation | null;
}

export interface AvailabilityScore {
  provider: CloudProvider;
  region: string;
  score: number;
  samples: number;
  lastObservedAt: string;
}

export interface SimulationScenario {
  scenarioId: string;
  provider: CloudProvider;
  region: string;
  sku: string;
}

export interface FutureModelFeatures {
  provider: CloudProvider;
  region: string;
  sku: string;
  totalCost: number;
  distanceKm: number;
  bandwidthCost: number;
  egressCost: number;
  availabilityScore: number;
}

export interface FutureModelInput {
  planId: string;
  request: PlanRequest;
  candidates: FutureModelFeatures[];
}

export interface FutureModelOutput {
  enabled: false;
  reason: string;
}

export interface FuturePredictionModulePort {
  predict(input: FutureModelInput): Promise<FutureModelOutput>;
}

export interface PlanCreatedEvent {
  eventType: "plan.created";
  payload: {
    planId: string;
    request: PlanRequest;
  };
}

export interface SimulationRequestedEvent {
  eventType: "simulation.requested";
  payload: {
    planId: string;
    batchId: string;
    request: PlanRequest;
    scenario: SimulationScenario;
  };
}

export interface SimulationResultEvent {
  eventType: "simulation.result";
  payload: {
    planId: string;
    batchId: string;
    scenario: SimulationScenario;
    result: ProviderSimulationResult;
    completedAt: string;
  };
}

export interface SimulationResultFailedEvent {
  eventType: "simulation.result.failed";
  payload: {
    planId: string;
    batchId: string;
    scenario: SimulationScenario;
    error: string;
    completedAt: string;
  };
}

export interface SimulationCompletedEvent {
  eventType: "simulation.completed";
  payload: {
    planId: string;
    batchId: string;
    results: ProviderSimulationResult[];
    availability: AvailabilityScore[];
  };
}

export interface SimulationFailedEvent {
  eventType: "simulation.failed";
  payload: {
    planId: string;
    batchId?: string;
    error: string;
  };
}

export type QueueEvent =
  | PlanCreatedEvent
  | SimulationRequestedEvent
  | SimulationResultEvent
  | SimulationResultFailedEvent
  | SimulationCompletedEvent
  | SimulationFailedEvent;

export interface RegionCoordinate {
  provider: CloudProvider;
  region: string;
  latitude: number;
  longitude: number;
  countryCode: string;
}

export interface HealthResponse {
  ok: true;
  service: string;
  timestamp: string;
}
