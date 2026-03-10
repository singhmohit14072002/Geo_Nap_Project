export type CloudProvider = "aws" | "azure" | "gcp";

export interface StorageObjectRef {
  bucket: string;
  objectKey: string;
  storageClass?: string;
}

export interface StorageSelection {
  object: StorageObjectRef;
}

export interface NetworkSelection {
  dataEgressGB: number;
  crossCloudTransfer: boolean;
}

export interface RequirementInput {
  cloudProvider: CloudProvider;
  region: string;
  storage: StorageSelection;
  network: NetworkSelection;
}

export interface PricingEngineContext {
  source: {
    cloudProvider: CloudProvider;
    region: string;
  };
  storageObject: StorageObjectRef;
  transfer: {
    dataEgressGB: number;
    crossCloudTransfer: boolean;
  };
}

export interface NormalizedRequirement {
  cloudProvider: CloudProvider;
  region: string;
  storage: StorageSelection;
  network: NetworkSelection;
  pricingContext: PricingEngineContext;
}
