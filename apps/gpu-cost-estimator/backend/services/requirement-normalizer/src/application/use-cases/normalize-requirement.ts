import {
  NormalizedRequirement,
  PricingEngineContext,
  RequirementInput
} from "../../domain/types";

function buildPricingContext(input: RequirementInput): PricingEngineContext {
  return {
    source: {
      cloudProvider: input.cloudProvider,
      region: input.region
    },
    storageObject: {
      bucket: input.storage.object.bucket,
      objectKey: input.storage.object.objectKey,
      storageClass: input.storage.object.storageClass
    },
    transfer: {
      dataEgressGB: input.network.dataEgressGB,
      crossCloudTransfer: input.network.crossCloudTransfer
    }
  };
}

export function normalizeRequirement(input: RequirementInput): NormalizedRequirement {
  const normalized: RequirementInput = {
    cloudProvider: input.cloudProvider,
    region: input.region.trim().toLowerCase(),
    storage: {
      object: {
        bucket: input.storage.object.bucket.trim(),
        objectKey: input.storage.object.objectKey.trim(),
        storageClass: input.storage.object.storageClass?.trim()
      }
    },
    network: {
      dataEgressGB: input.network.dataEgressGB,
      crossCloudTransfer: input.network.crossCloudTransfer
    }
  };

  return {
    ...normalized,
    pricingContext: buildPricingContext(normalized)
  };
}
