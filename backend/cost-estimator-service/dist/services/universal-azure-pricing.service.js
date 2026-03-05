"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAzurePrice = void 0;
const https_1 = __importDefault(require("https"));
const azure_pricing_query_service_1 = require("./azure-pricing-query.service");
const logger_1 = __importDefault(require("../utils/logger"));
const AZURE_RETAIL_QUERY_MAX_PAGES = Number(process.env.AZURE_RETAIL_QUERY_MAX_PAGES ?? process.env.AZURE_RETAIL_MAX_PAGES ?? "20");
const round2 = (v) => Number(v.toFixed(2));
const isExcluded = (item) => {
    const type = (item.type ?? "").toLowerCase();
    const priceType = (item.priceType ?? type).toLowerCase();
    const meterName = (item.meterName ?? "").toLowerCase();
    if (type === "devtestconsumption" || type === "reservation" || type === "savingsplanconsumption")
        return true;
    if (priceType === "devtestconsumption" || priceType === "reservation" || priceType === "savingsplanconsumption")
        return true;
    if (meterName.includes("spot") || meterName.includes("low priority"))
        return true;
    if (priceType !== "consumption")
        return true;
    return false;
};
const buildAzureFilter = (service) => {
    const clauses = [
        `serviceName eq '${service.serviceName}'`,
        `armRegionName eq '${service.region}'`,
        "priceType eq 'Consumption'",
        "isPrimaryMeterRegion eq true"
    ];
    if (service.armSkuName) {
        clauses.push(`armSkuName eq '${service.armSkuName}'`);
    }
    if (service.meterName) {
        clauses.push(`meterName eq '${service.meterName}'`);
    }
    return clauses.join(" and ");
};
const buildVmFilter = (service, { includeWindows }) => {
    const clauses = [
        `serviceName eq 'Virtual Machines'`,
        `armRegionName eq '${service.region}'`,
        `armSkuName eq '${service.armSkuName ?? ""}'`,
        "priceType eq 'Consumption'",
        "isPrimaryMeterRegion eq true"
    ];
    if (includeWindows) {
        clauses.push("contains(meterName,'Windows')");
    }
    else {
        clauses.push("not contains(meterName,'Windows')");
    }
    return clauses.join(" and ");
};
const fetchAllPages = async (initialUrl) => {
    const fetchJson = (url) => new Promise((resolve, reject) => {
        https_1.default
            .get(url, (res) => {
            const statusCode = res.statusCode ?? 500;
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                if (statusCode >= 400) {
                    reject(new Error(`HTTP ${statusCode}`));
                    return;
                }
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
                }
                catch (err) {
                    reject(err);
                }
            });
        })
            .on("error", reject);
    });
    let url = initialUrl;
    const all = [];
    let pages = 0;
    while (url && pages < AZURE_RETAIL_QUERY_MAX_PAGES) {
        const page = await fetchJson(url);
        pages += 1;
        const items = Array.isArray(page.Items) ? page.Items : [];
        all.push(...items);
        const next = page.NextPageLink ?? page.nextPageLink ?? "";
        url = next || "";
        if (!next)
            break;
    }
    return all;
};
const resolveAzurePrice = async (service) => {
    if (!service.armSkuName && !service.meterName) {
        throw new azure_pricing_query_service_1.AzurePricingQueryError("INVALID_INPUT", "SKU or meterName required for Azure pricing", {});
    }
    const currency = process.env.AZURE_RETAIL_CURRENCY ?? "'INR'";
    const rate = Number(process.env.AZURE_USD_TO_INR ?? "83");
    const buildUrl = (filter) => `https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&currencyCode=${currency}&$filter=${encodeURIComponent(filter)}`;
    const pickMeter = (items) => {
        const candidates = items
            .filter((i) => !isExcluded(i))
            .filter((i) => i.isPrimaryMeterRegion === true)
            .filter((i) => (i.priceType ?? "").toLowerCase() === "consumption")
            .filter((i) => {
            if (!service.osType)
                return true;
            const product = `${i.productName ?? ""}`.toLowerCase();
            if (service.osType === "windows")
                return product.includes("windows");
            return !product.includes("windows");
        })
            .filter((i) => {
            const u = (i.unitOfMeasure ?? "").trim();
            if (service.unitType === "Hour" && u !== "1 Hour")
                return false;
            if (service.unitType === "Month" && !u.includes("Month"))
                return false;
            if (service.unitType === "GB" && !u.includes("GB"))
                return false;
            return true;
        })
            .filter((i) => (i.unitPrice ?? i.retailPrice ?? 0) > 0);
        return candidates.sort((a, b) => (a.unitPrice ?? a.retailPrice ?? 0) - (b.unitPrice ?? b.retailPrice ?? 0))[0] ?? null;
    };
    // Special handling for Virtual Machines to include Windows license meters
    if (service.serviceName === "Virtual Machines" && service.armSkuName) {
        // compute meter (exclude Windows)
        const filterCompute = buildVmFilter(service, { includeWindows: false });
        logger_1.default.info("AZURE_FILTER_BUILT", filterCompute);
        const itemsCompute = await fetchAllPages(buildUrl(filterCompute));
        logger_1.default.info("AZURE_TOTAL_METERS_FETCHED", itemsCompute.length);
        const computeMeter = pickMeter(itemsCompute);
        let computeCost = 0;
        let computeUnitPrice = 0;
        if (computeMeter) {
            logger_1.default.info("AZURE_SELECTED_METER", computeMeter.armSkuName ?? computeMeter.meterName ?? "unknown");
            logger_1.default.info("AZURE_UNIT_VALIDATED", computeMeter.unitOfMeasure);
            computeUnitPrice = round2((computeMeter.unitPrice ?? computeMeter.retailPrice ?? 0) * rate);
            computeCost = round2(computeUnitPrice * service.usageQuantity);
            logger_1.default.info("AZURE_MONTHLY_COST_CALCULATED", computeCost);
        }
        let windowsCost = 0;
        let windowsUnitPrice = 0;
        if (service.osType === "windows") {
            const filterWin = buildVmFilter(service, { includeWindows: true });
            logger_1.default.info("AZURE_FILTER_BUILT", filterWin);
            const itemsWin = await fetchAllPages(buildUrl(filterWin));
            logger_1.default.info("AZURE_TOTAL_METERS_FETCHED", itemsWin.length);
            const winMeter = pickMeter(itemsWin);
            if (winMeter) {
                logger_1.default.info("AZURE_SELECTED_METER", winMeter.armSkuName ?? winMeter.meterName ?? "unknown");
                logger_1.default.info("AZURE_UNIT_VALIDATED", winMeter.unitOfMeasure);
                windowsUnitPrice = round2((winMeter.unitPrice ?? winMeter.retailPrice ?? 0) * rate);
                windowsCost = round2(windowsUnitPrice * service.usageQuantity);
                logger_1.default.info("AZURE_MONTHLY_COST_CALCULATED", windowsCost);
            }
        }
        if (!computeMeter && computeCost === 0 && windowsCost === 0) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter: filterCompute });
        }
        return {
            serviceName: service.serviceName,
            armSkuName: service.armSkuName,
            meterName: computeMeter?.meterName,
            region: service.region,
            unitType: service.unitType,
            usageQuantity: service.usageQuantity,
            unitPrice: round2(computeUnitPrice + windowsUnitPrice),
            monthlyCost: round2(computeCost + windowsCost),
            computeCost,
            windowsCost,
            unitOfMeasure: computeMeter?.unitOfMeasure
        };
    }
    // Standard path for non-VM services
    const filter = buildAzureFilter(service);
    logger_1.default.info("AZURE_FILTER_BUILT", filter);
    const items = await fetchAllPages(buildUrl(filter));
    logger_1.default.info("AZURE_TOTAL_METERS_FETCHED", items.length);
    const selected = pickMeter(items);
    if (!selected) {
        logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
        throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
    }
    logger_1.default.info("AZURE_SELECTED_METER", selected.armSkuName ?? selected.meterName ?? "unknown");
    logger_1.default.info("AZURE_UNIT_VALIDATED", selected.unitOfMeasure);
    const unitPriceUsd = selected.unitPrice ?? selected.retailPrice ?? 0;
    const unitPrice = round2(unitPriceUsd * rate);
    const monthlyCost = round2(unitPrice * service.usageQuantity);
    logger_1.default.info("AZURE_MONTHLY_COST_CALCULATED", monthlyCost);
    return {
        serviceName: service.serviceName,
        armSkuName: selected.armSkuName ?? service.armSkuName,
        meterName: selected.meterName ?? service.meterName,
        region: service.region,
        unitType: service.unitType,
        usageQuantity: service.usageQuantity,
        unitPrice,
        monthlyCost,
        unitOfMeasure: selected.unitOfMeasure
    };
};
exports.resolveAzurePrice = resolveAzurePrice;
