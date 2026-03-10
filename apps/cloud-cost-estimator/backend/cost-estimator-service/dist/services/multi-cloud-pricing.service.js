"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiCloudPricingService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const azure_pricing_engine_service_1 = require("./azure-pricing-engine.service");
const aws_pricing_engine_service_1 = require("./aws-pricing-engine.service");
const gcp_pricing_engine_service_1 = require("./gcp-pricing-engine.service");
const circuit_breaker_service_1 = require("./circuit-breaker.service");
const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS ?? "5000");
class ProviderTimeoutError extends Error {
    constructor(provider, timeoutMs) {
        super(`Provider ${provider} exceeded timeout of ${timeoutMs}ms`);
        this.code = "PROVIDER_TIMEOUT";
        this.name = "ProviderTimeoutError";
        this.provider = provider;
    }
}
const toErrorMessage = (reason) => {
    if (reason instanceof Error) {
        return reason.message;
    }
    if (reason && typeof reason === "object" && "message" in reason) {
        return String(reason.message);
    }
    return String(reason);
};
const toProviderFailure = (reason) => {
    if (reason && typeof reason === "object" && "code" in reason) {
        return {
            code: String(reason.code),
            message: toErrorMessage(reason)
        };
    }
    return {
        code: "UNKNOWN_ERROR",
        message: toErrorMessage(reason)
    };
};
class MultiCloudPricingService {
    constructor(azureProvider = new azure_pricing_engine_service_1.AzurePricingEngine(), awsProvider = new aws_pricing_engine_service_1.AwsPricingEngine(), gcpProvider = new gcp_pricing_engine_service_1.GcpPricingEngine()) {
        this.azureProvider = azureProvider;
        this.awsProvider = awsProvider;
        this.gcpProvider = gcpProvider;
    }
    resolveProvider(provider) {
        if (provider === "azure") {
            return this.azureProvider;
        }
        if (provider === "aws") {
            return this.awsProvider;
        }
        return this.gcpProvider;
    }
    async withTimeout(provider, operation) {
        let timeoutRef = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutRef = setTimeout(() => {
                reject(new ProviderTimeoutError(provider, PROVIDER_TIMEOUT_MS));
            }, PROVIDER_TIMEOUT_MS);
        });
        try {
            return await Promise.race([operation, timeoutPromise]);
        }
        finally {
            if (timeoutRef) {
                clearTimeout(timeoutRef);
            }
        }
    }
    async executeProvider(provider, params) {
        circuit_breaker_service_1.providerCircuitBreaker.canExecute(provider);
        const engine = this.resolveProvider(provider);
        try {
            const result = await this.withTimeout(provider, engine.calculatePrice(params));
            circuit_breaker_service_1.providerCircuitBreaker.recordSuccess(provider);
            return result;
        }
        catch (error) {
            if (!(error instanceof circuit_breaker_service_1.CircuitBreakerOpenError)) {
                circuit_breaker_service_1.providerCircuitBreaker.recordFailure(provider);
            }
            throw error;
        }
    }
    applySettledResult(provider, settled, result) {
        if (settled.status === "fulfilled") {
            logger_1.default.info("PROVIDER_SUCCESS", {
                provider,
                serviceName: settled.value.serviceName,
                monthlyCost: settled.value.monthlyCost,
                pricingVersion: settled.value.pricingVersion
            });
            result[provider] = settled.value;
            return;
        }
        const providerFailure = toProviderFailure(settled.reason);
        logger_1.default.error("PROVIDER_FAILURE", {
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
    async comparePrice(params) {
        const [azure, aws, gcp] = await Promise.allSettled([
            this.executeProvider("azure", params),
            this.executeProvider("aws", params),
            this.executeProvider("gcp", params)
        ]);
        const result = {};
        this.applySettledResult("azure", azure, result);
        this.applySettledResult("aws", aws, result);
        this.applySettledResult("gcp", gcp, result);
        return result;
    }
}
exports.MultiCloudPricingService = MultiCloudPricingService;
