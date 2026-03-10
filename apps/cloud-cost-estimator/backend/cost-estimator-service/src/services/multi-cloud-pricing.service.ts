import logger from "../utils/logger";
import { CloudPricingProvider } from "./cloud-pricing-provider.interface";
import { AzurePricingEngine } from "./azure-pricing-engine.service";
import { AwsPricingEngine } from "./aws-pricing-engine.service";
import { GcpPricingEngine } from "./gcp-pricing-engine.service";
import {
  CircuitBreakerOpenError,
  providerCircuitBreaker
} from "./circuit-breaker.service";
import {
  MultiCloudComparisonResult,
  NormalizedPricingParams,
  ProviderFailure,
  PricingResult
} from "./multi-cloud-pricing.types";

type ProviderName = "azure" | "aws" | "gcp";

const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS ?? "5000");

class ProviderTimeoutError extends Error {
  readonly code = "PROVIDER_TIMEOUT";
  readonly provider: ProviderName;

  constructor(provider: ProviderName, timeoutMs: number) {
    super(`Provider ${provider} exceeded timeout of ${timeoutMs}ms`);
    this.name = "ProviderTimeoutError";
    this.provider = provider;
  }
}

const toErrorMessage = (reason: unknown): string => {
  if (reason instanceof Error) {
    return reason.message;
  }
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
};

const toProviderFailure = (reason: unknown): ProviderFailure => {
  if (reason && typeof reason === "object" && "code" in reason) {
    return {
      code: String((reason as { code: unknown }).code),
      message: toErrorMessage(reason)
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: toErrorMessage(reason)
  };
};

export class MultiCloudPricingService {
  private readonly azureProvider: CloudPricingProvider<
    NormalizedPricingParams,
    PricingResult
  >;
  private readonly awsProvider: CloudPricingProvider<
    NormalizedPricingParams,
    PricingResult
  >;
  private readonly gcpProvider: CloudPricingProvider<
    NormalizedPricingParams,
    PricingResult
  >;

  constructor(
    azureProvider: CloudPricingProvider<NormalizedPricingParams, PricingResult> = new AzurePricingEngine(),
    awsProvider: CloudPricingProvider<NormalizedPricingParams, PricingResult> = new AwsPricingEngine(),
    gcpProvider: CloudPricingProvider<NormalizedPricingParams, PricingResult> = new GcpPricingEngine()
  ) {
    this.azureProvider = azureProvider;
    this.awsProvider = awsProvider;
    this.gcpProvider = gcpProvider;
  }

  private resolveProvider(
    provider: ProviderName
  ): CloudPricingProvider<NormalizedPricingParams, PricingResult> {
    if (provider === "azure") {
      return this.azureProvider;
    }
    if (provider === "aws") {
      return this.awsProvider;
    }
    return this.gcpProvider;
  }

  private async withTimeout(
    provider: ProviderName,
    operation: Promise<PricingResult>
  ): Promise<PricingResult> {
    let timeoutRef: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<PricingResult>((_, reject) => {
      timeoutRef = setTimeout(() => {
        reject(new ProviderTimeoutError(provider, PROVIDER_TIMEOUT_MS));
      }, PROVIDER_TIMEOUT_MS);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
    }
  }

  private async executeProvider(
    provider: ProviderName,
    params: NormalizedPricingParams
  ): Promise<PricingResult> {
    providerCircuitBreaker.canExecute(provider);
    const engine = this.resolveProvider(provider);

    try {
      const result = await this.withTimeout(provider, engine.calculatePrice(params));
      providerCircuitBreaker.recordSuccess(provider);
      return result;
    } catch (error) {
      if (!(error instanceof CircuitBreakerOpenError)) {
        providerCircuitBreaker.recordFailure(provider);
      }
      throw error;
    }
  }

  private applySettledResult(
    provider: ProviderName,
    settled: PromiseSettledResult<PricingResult>,
    result: MultiCloudComparisonResult
  ): void {
    if (settled.status === "fulfilled") {
      logger.info("PROVIDER_SUCCESS", {
        provider,
        serviceName: settled.value.serviceName,
        monthlyCost: settled.value.monthlyCost,
        pricingVersion: settled.value.pricingVersion
      });
      result[provider] = settled.value;
      return;
    }

    const providerFailure = toProviderFailure(settled.reason);
    logger.error("PROVIDER_FAILURE", {
      provider,
      serviceName: "multi-cloud-pricing",
      code: providerFailure.code,
      error: providerFailure.message
    });

    result.errors = {
      ...(result.errors ?? {}),
      [provider]: providerFailure
    };
  }

  async comparePrice(
    params: NormalizedPricingParams
  ): Promise<MultiCloudComparisonResult> {
    const [azure, aws, gcp] = await Promise.allSettled([
      this.executeProvider("azure", params),
      this.executeProvider("aws", params),
      this.executeProvider("gcp", params)
    ]);

    const result: MultiCloudComparisonResult = {};
    this.applySettledResult("azure", azure, result);
    this.applySettledResult("aws", aws, result);
    this.applySettledResult("gcp", gcp, result);

    return result;
  }
}
