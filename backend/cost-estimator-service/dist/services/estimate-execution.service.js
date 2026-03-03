"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEstimateComputation = void 0;
const http_error_util_1 = require("../utils/http-error.util");
const logger_1 = __importDefault(require("../utils/logger"));
const optimization_engine_service_1 = require("./optimization-engine.service");
const pricing_factory_service_1 = require("./pricing-factory.service");
const universal_azure_pricing_engine_service_1 = require("./universal-azure-pricing-engine.service");
const estimate_schema_1 = require("../schemas/estimate.schema");
const azure_universal_extractor_service_1 = require("./azure-universal-extractor.service");
const universal_azure_pricing_service_1 = require("./universal-azure-pricing.service");
const normalizeRegionKey = (value) => value.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "") || "centralindia";
const classifyAzureService = (row) => {
    const cat = row.serviceCategory.toLowerCase();
    const type = row.serviceType.toLowerCase();
    if (type.includes("virtual machines") || type.includes("virtual machine"))
        return "COMPUTE_VM";
    if (cat.includes("compute") && type.includes("virtual"))
        return "COMPUTE_VM";
    if (type.includes("managed disks") || type.includes("managed disk"))
        return "STORAGE_DISK";
    if (type.includes("application gateway") || type.includes("nat gateway") || type.includes("virtual network"))
        return "NETWORK_GATEWAY";
    if (type.includes("bandwidth") || type.includes("data transfer"))
        return "NETWORK_EGRESS";
    if (type.includes("backup"))
        return "BACKUP";
    if (type.includes("automation"))
        return "AUTOMATION";
    if (type.includes("monitor"))
        return "MONITORING";
    if (type.includes("logic apps") || type.includes("logic app"))
        return "LOGIC_APPS";
    return "OTHER";
};
const parseNumber = (text, fallback = 0) => {
    const match = text.match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : fallback;
};
const extractPricingParameters = (row, classification) => {
    const desc = row.description || "";
    let quantity = parseNumber(desc, 1);
    if (quantity <= 0)
        quantity = 1;
    let hours = parseNumber(desc, 730);
    if (hours < 1)
        hours = 730;
    const osType = desc.toLowerCase().includes("windows") ? "windows" : "linux";
    if (classification === "COMPUTE_VM") {
        const skuMatch = desc.match(/([a-z]\d+[a-z0-9._-]*(?:v\d+)?)/i);
        const rawSku = skuMatch ? skuMatch[1].replace(/\s+/g, "") : "F2s";
        return {
            serviceName: "Virtual Machines",
            skuName: rawSku,
            hours,
            quantity,
            osType
        };
    }
    if (classification === "STORAGE_DISK") {
        const skuMatch = desc.match(/(p\d{1,2})/i);
        const skuName = skuMatch ? skuMatch[1].toUpperCase() : "P10";
        return {
            serviceName: "Managed Disks",
            skuName,
            quantity
        };
    }
    if (classification === "NETWORK_EGRESS") {
        const usageGB = parseNumber(desc, 0);
        return {
            serviceName: "Bandwidth",
            usageGB,
            quantity: 1
        };
    }
    if (classification === "NETWORK_GATEWAY") {
        return {
            serviceName: "Application Gateway",
            quantity,
            hours
        };
    }
    if (classification === "BACKUP") {
        const usageGB = parseNumber(desc, 0);
        return {
            serviceName: "Backup",
            usageGB,
            quantity: 1
        };
    }
    if (classification === "AUTOMATION") {
        return {
            serviceName: "Automation",
            quantity,
            hours
        };
    }
    if (classification === "LOGIC_APPS") {
        return {
            serviceName: "Logic Apps",
            quantity,
            hours
        };
    }
    return {
        serviceName: row.serviceType || row.serviceCategory || "Other",
        quantity
    };
};
const hasAzureEstimatePayload = (payload) => {
    if (!("azureEstimate" in payload)) {
        return false;
    }
    const record = payload;
    const azureEstimate = record.azureEstimate;
    if (!azureEstimate || typeof azureEstimate !== "object") {
        return false;
    }
    const value = azureEstimate;
    if (value.documentType !== "CLOUD_ESTIMATE") {
        return false;
    }
    if (!Array.isArray(value.classifiedServices)) {
        return false;
    }
    return value.classifiedServices.length > 0;
};
const DEFAULT_MONTHLY_HOURS = Number(process.env.DEFAULT_MONTHLY_HOURS ?? "730");
const normalizeRegion = (value, fallback) => {
    const normalized = value
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9-]/g, "")
        .trim();
    return normalized || fallback;
};
const classifyByServiceType = (serviceTypeRaw) => {
    const type = (serviceTypeRaw ?? "").toLowerCase();
    if (type === "virtual machines" || type === "virtual machine") {
        return "COMPUTE_VM";
    }
    if (type === "managed disks" || type === "managed disk") {
        return "STORAGE_DISK";
    }
    if (type === "bandwidth" || type === "internet egress") {
        return "NETWORK_EGRESS";
    }
    if (type === "application gateway" || type === "azure nat gateway") {
        return "NETWORK_GATEWAY";
    }
    if (type === "automation") {
        return "AUTOMATION";
    }
    if (type === "azure backup" || type === "backup") {
        return "BACKUP";
    }
    return "OTHER";
};
const mapServiceName = (serviceType) => {
    const type = (serviceType ?? "").trim();
    if (type.toLowerCase() === "azure nat gateway") {
        return "Virtual Network";
    }
    if (type) {
        return type;
    }
    return "Unknown Service";
};
const buildNormalizedAzureRow = (region, service) => {
    const params = (service.pricingParameters ?? {});
    const targetRegion = params.serviceName?.toLowerCase() === "bandwidth" && service.row?.region
        ? normalizeRegion(String(service.row.region), region)
        : normalizeRegion(String(service.row?.region ?? region), region);
    return {
        classification: classifyByServiceType(service.serviceType ?? null),
        serviceName: params.serviceName ?? mapServiceName(service.serviceType ?? null),
        skuName: params.skuName ?? null,
        region: targetRegion,
        quantity: typeof params.quantity === "number" && params.quantity > 0
            ? params.quantity
            : 1,
        usageHours: typeof params.hours === "number" && params.hours > 0
            ? params.hours
            : DEFAULT_MONTHLY_HOURS,
        usageGB: typeof params.usageGB === "number" && params.usageGB >= 0 ? params.usageGB : 0,
        osType: params.osType,
        capacityUnits: 0,
        sourceServiceType: service.serviceType ?? null,
        sourceRow: service.row
    };
};
const priceAzureNormalizedRow = async (region, row) => {
    return (0, universal_azure_pricing_engine_service_1.estimateAzureNormalizedServices)({
        region,
        services: [row]
    });
};
const priceVirtualMachine = async (region, row) => priceAzureNormalizedRow(region, { ...row, classification: "COMPUTE_VM", serviceName: "Virtual Machines" });
const priceManagedDisk = async (region, row) => priceAzureNormalizedRow(region, { ...row, classification: "STORAGE_DISK", serviceName: "Storage" });
const priceApplicationGateway = async (region, row) => priceAzureNormalizedRow(region, { ...row, classification: "NETWORK_GATEWAY", serviceName: "Application Gateway" });
const priceNatGateway = async (region, row) => priceAzureNormalizedRow(region, { ...row, classification: "NETWORK_GATEWAY", serviceName: "Virtual Network" });
const priceInternetEgress = async (region, row) => priceAzureNormalizedRow(region, { ...row, classification: "NETWORK_EGRESS", serviceName: "Bandwidth" });
const priceVnetTransfer = async (region, row) => priceAzureNormalizedRow(region, { ...row, classification: "NETWORK_EGRESS", serviceName: "Virtual Network" });
const priceBackup = async (region, row) => priceAzureNormalizedRow(region, { ...row, classification: "BACKUP", serviceName: "Recovery Services" });
const priceAutomation = async (region, row) => priceAzureNormalizedRow(region, { ...row, classification: "AUTOMATION", serviceName: "Automation" });
const processAzureRow = async (region, row) => {
    const key = (row.sourceServiceType ?? row.serviceName).toLowerCase();
    switch (key) {
        case "virtual machines":
        case "virtual machine":
            {
                const priced = await priceVirtualMachine(region, row);
                const detail = priced.details[0];
                logger_1.default.info("VM_PRICED_DEBUG", {
                    armSkuName: row.skuName,
                    unitPrice: detail?.unitPrice,
                    monthlyCost: detail?.monthlyCost
                });
                return priced;
            }
        case "managed disks":
        case "managed disk":
            return priceManagedDisk(region, row);
        case "application gateway":
            return priceApplicationGateway(region, row);
        case "azure nat gateway":
            return priceNatGateway(region, row);
        case "bandwidth":
            return priceInternetEgress(region, row);
        case "virtual network":
            return priceVnetTransfer(region, row);
        case "azure backup":
        case "backup":
            return priceBackup(region, row);
        case "automation":
            return priceAutomation(region, row);
        default:
            logger_1.default.warn("Unsupported Azure estimate row serviceType; skipping", {
                serviceType: row.sourceServiceType,
                serviceName: row.serviceName
            });
            return null;
    }
};
const aggregateAzureResults = (region, rows, normalizedRows) => {
    const services = [];
    rows.forEach((res, idx) => {
        if (!res)
            return;
        const detail = res.details[0];
        const row = normalizedRows[idx];
        const monthlyCost = detail?.monthlyCost ?? res.summary.monthlyTotal ?? 0;
        services.push({
            serviceName: row.serviceName,
            skuName: row.skuName ?? detail?.sku,
            region: normalizeRegion(row.region, region),
            unitPrice: detail?.unitPrice ?? 0,
            quantity: row.quantity,
            hours: row.usageHours,
            usageGB: row.usageGB,
            monthlyCost
        });
    });
    const totalMonthlyCost = Number(services.reduce((sum, svc) => sum + (svc?.monthlyCost ?? 0), 0).toFixed(2));
    const totalYearlyCost = Number((totalMonthlyCost * 12).toFixed(2));
    logger_1.default.info("AZURE_ESTIMATE_RESPONSE_SENT", {
        serviceCount: services.length,
        totalMonthlyCost
    });
    return {
        mode: "AZURE_ESTIMATE_MODE",
        services,
        totalMonthlyCost,
        totalYearlyCost
    };
};
const runAzureUniversalPipeline = async (payload) => {
    logger_1.default.info("UNIVERSAL_SERVICE_MODEL_ENABLED");
    const services = payload.azureEstimate.classifiedServices
        .map((item) => {
        const raw = estimate_schema_1.azureEstimateRowSchema.safeParse(item);
        if (!raw.success)
            return null;
        return (0, azure_universal_extractor_service_1.extractAzureService)(raw.data);
    })
        .filter(Boolean);
    if (services.length === 0) {
        throw new http_error_util_1.HttpError(422, "No Azure services could be extracted from estimate file");
    }
    const settled = await Promise.allSettled(services.map((svc) => (0, universal_azure_pricing_service_1.resolveAzurePrice)(svc)));
    const priced = settled
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
    if (priced.length === 0) {
        throw new http_error_util_1.HttpError(422, "No Azure retail pricing record matched the requested parameters");
    }
    if (priced.length < services.length) {
        logger_1.default.warn("AZURE_PRICING_PARTIAL_SUCCESS", {
            requested: services.length,
            priced: priced.length,
            failed: services.length - priced.length
        });
    }
    const totalMonthly = Number(priced.reduce((sum, s) => sum + (s.monthlyCost ?? 0), 0).toFixed(2));
    return {
        provider: "AZURE",
        services: priced,
        totalMonthlyCost: totalMonthly,
        totalYearlyCost: Number((totalMonthly * 12).toFixed(2))
    };
};
const runAzureEstimatePipeline = async (payload) => {
    const ignoredProviders = payload.cloudProviders.filter((provider) => provider !== "azure");
    if (ignoredProviders.length > 0) {
        logger_1.default.warn("Ignoring non-Azure providers in AZURE_ESTIMATE_MODE", { ignoredProviders });
    }
    const validated = [];
    const rawRows = [];
    payload.azureEstimate.classifiedServices.forEach((item) => {
        const parsed = estimate_schema_1.classifiedServiceSchema.safeParse(item);
        if (parsed.success) {
            validated.push(parsed.data);
            return;
        }
        const rawParsed = estimate_schema_1.azureEstimateRowSchema.safeParse(item);
        if (rawParsed.success) {
            rawRows.push(rawParsed.data);
        }
    });
    rawRows.forEach((row) => {
        const classification = classifyAzureService(row);
        validated.push({
            classification,
            serviceCategory: row.serviceCategory,
            serviceType: row.serviceType,
            pricingParameters: extractPricingParameters(row, classification),
            row
        });
    });
    if (validated.length === 0) {
        throw new http_error_util_1.HttpError(422, "No valid classified services provided for azureEstimate mode");
    }
    const normalizedRows = validated.map((service) => buildNormalizedAzureRow(payload.region, service));
    const pricingJobs = normalizedRows.map((row) => processAzureRow(payload.region, row));
    const pricedRows = await Promise.all(pricingJobs);
    if (pricedRows.filter(Boolean).length === 0) {
        throw new http_error_util_1.HttpError(422, "No Azure estimate rows could be priced");
    }
    return aggregateAzureResults(payload.region, pricedRows, normalizedRows);
};
const runGenericInfraPipeline = async (payload) => {
    if (!("requirement" in payload)) {
        throw new http_error_util_1.HttpError(422, "Missing requirement payload for standard estimation mode");
    }
    const requirement = payload
        .requirement;
    const uniqueProviders = [...new Set(payload.cloudProviders)];
    const settled = await Promise.allSettled(uniqueProviders.map(async (provider) => {
        const pricingService = (0, pricing_factory_service_1.getPricingService)(provider);
        return pricingService.estimate({
            provider,
            region: payload.region,
            requirement
        });
    }));
    const successful = settled
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);
    const failed = settled.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
        failed.forEach((result) => {
            logger_1.default.warn("Provider estimation failed", {
                error: result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason)
            });
        });
    }
    if (successful.length === 0) {
        throw new http_error_util_1.HttpError(422, "No provider could produce a valid estimate for the requested resources");
    }
    return (0, optimization_engine_service_1.attachOptimizationRecommendations)(successful);
};
const runEstimateComputation = async (payload) => {
    if (hasAzureEstimatePayload(payload)) {
        const mode = payload.azureEstimate.mode === "AZURE_ESTIMATE_MODE"
            ? "AZURE_ESTIMATE_MODE"
            : "GENERIC_INFRA_MODE";
        if (mode === "AZURE_ESTIMATE_MODE") {
            return runAzureEstimatePipeline(payload);
        }
        logger_1.default.info("Falling back to GENERIC_INFRA_MODE despite azureEstimate presence", {
            mode
        });
        return runGenericInfraPipeline(payload);
    }
    return runGenericInfraPipeline(payload);
};
exports.runEstimateComputation = runEstimateComputation;
