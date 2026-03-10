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
const normalizeCurrency = (value) => {
    if (!value)
        return "USD";
    return value.replace(/'/g, "").trim().toUpperCase() || "USD";
};
const lower = (value) => (value ?? "").toLowerCase();
const asNumber = (value, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
        "priceType eq 'Consumption'"
    ];
    if (service.armSkuName) {
        clauses.push(`armSkuName eq '${service.armSkuName}'`);
    }
    const disableStrictMeterFor = new Set([
        "Application Gateway",
        "Logic Apps",
        "Bandwidth",
        "Backup",
        "Virtual Network"
    ]);
    if (service.meterName && !disableStrictMeterFor.has(service.serviceName)) {
        clauses.push(`meterName eq '${service.meterName}'`);
    }
    return clauses.join(" and ");
};
const buildVmFilter = (service) => {
    const clauses = [
        `serviceName eq 'Virtual Machines'`,
        `armRegionName eq '${service.region}'`,
        `armSkuName eq '${service.armSkuName ?? ""}'`,
        "priceType eq 'Consumption'"
    ];
    return clauses.join(" and ");
};
const fetchAllPages = async (initialUrl) => {
    const fetchJson = async (url, retries = 5) => {
        let attempt = 0;
        while (true) {
            try {
                const payload = await new Promise((resolve, reject) => {
                    const req = https_1.default.get(url, (res) => {
                        const statusCode = res.statusCode ?? 500;
                        const chunks = [];
                        res.on("data", (c) => chunks.push(c));
                        res.on("end", () => {
                            const raw = Buffer.concat(chunks).toString("utf8");
                            if (statusCode >= 400) {
                                const err = new Error(`HTTP ${statusCode}: ${raw.slice(0, 240)}`);
                                reject(err);
                                return;
                            }
                            try {
                                resolve(JSON.parse(raw));
                            }
                            catch (err) {
                                reject(err);
                            }
                        });
                    });
                    req.setTimeout(20000, () => {
                        req.destroy(new Error("ETIMEDOUT"));
                    });
                    req.on("error", reject);
                });
                return payload;
            }
            catch (error) {
                attempt += 1;
                const msg = error instanceof Error ? error.message : String(error);
                const retryable = msg.includes("HTTP 429") ||
                    msg.includes("HTTP 500") ||
                    msg.includes("HTTP 503") ||
                    msg.includes("ENOTFOUND") ||
                    msg.includes("ECONNRESET") ||
                    msg.includes("ETIMEDOUT");
                if (!retryable || attempt > retries) {
                    throw error;
                }
                const waitMs = 700 * attempt;
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
        }
    };
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
const filterByBaseConstraints = (items, service) => items
    .filter((i) => !isExcluded(i))
    .filter((i) => {
    if (!service.region)
        return true;
    const region = lower(i.armRegionName).replace(/\s+/g, "");
    return region === lower(service.region).replace(/\s+/g, "");
})
    .filter((i) => {
    if (!service.armSkuName)
        return true;
    return lower(i.armSkuName) === lower(service.armSkuName);
});
const unitMatches = (item, unitType) => {
    if (!unitType)
        return true;
    const unit = lower(item.unitOfMeasure).trim();
    const target = lower(unitType).trim();
    if (target === "hour")
        return unit.includes("hour");
    if (target === "month")
        return unit.includes("month");
    if (target === "gb")
        return unit.includes("gb");
    if (target === "minute")
        return unit.includes("minute");
    return true;
};
const selectTieredCost = (candidates, usage) => {
    const normalized = candidates
        .map((item) => ({
        item,
        tierMin: asNumber(item.tierMinimumUnits, 0),
        price: asNumber(item.unitPrice ?? item.retailPrice, 0)
    }))
        .filter((entry) => entry.price >= 0)
        .sort((a, b) => a.tierMin - b.tierMin);
    if (normalized.length === 0 || usage <= 0) {
        return { monthlyCost: 0, unitPrice: 0 };
    }
    let monthlyCost = 0;
    for (let idx = 0; idx < normalized.length; idx += 1) {
        const current = normalized[idx];
        const nextStart = idx + 1 < normalized.length ? normalized[idx + 1].tierMin : usage;
        if (usage <= current.tierMin) {
            continue;
        }
        const billable = Math.max(0, Math.min(usage, nextStart) - current.tierMin);
        monthlyCost += billable * current.price;
    }
    if (monthlyCost <= 0) {
        const highestTier = normalized
            .filter((entry) => entry.tierMin <= usage && entry.price > 0)
            .sort((a, b) => b.tierMin - a.tierMin)[0];
        if (highestTier) {
            monthlyCost = usage * highestTier.price;
        }
    }
    const unitPrice = usage > 0 ? monthlyCost / usage : 0;
    return { monthlyCost: round2(monthlyCost), unitPrice: round2(unitPrice) };
};
const resolveAzurePrice = async (service) => {
    const needsSku = service.serviceName === "Virtual Machines" ||
        service.serviceName === "Storage" ||
        service.serviceName === "Managed Disks";
    if (needsSku && !service.armSkuName && !service.meterName) {
        throw new azure_pricing_query_service_1.AzurePricingQueryError("INVALID_INPUT", "SKU or meterName required for Azure pricing", {});
    }
    const currencyCode = normalizeCurrency(process.env.AZURE_RETAIL_CURRENCY);
    const conversionRate = currencyCode === "USD" ? Number(process.env.AZURE_USD_TO_INR ?? "1") : 1;
    const toLocal = (price) => round2(price * conversionRate);
    const buildUrl = (filter) => `https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview&currencyCode=${currencyCode}&$filter=${encodeURIComponent(filter)}`;
    const validateUnit = (item, unitType) => {
        return unitMatches(item, unitType);
    };
    const pickMeter = (items, expectedUnit, predicate) => {
        const candidates = items
            .filter((i) => !isExcluded(i))
            .filter((i) => (i.priceType ?? i.type ?? "").toLowerCase() === "consumption")
            .filter((i) => {
            if (!service.region)
                return true;
            const region = (i.armRegionName ?? "").toLowerCase().replace(/\s+/g, "");
            return region === service.region.toLowerCase();
        })
            .filter((i) => {
            if (!service.armSkuName)
                return true;
            return (i.armSkuName ?? "").toLowerCase() === service.armSkuName.toLowerCase();
        })
            .filter((i) => validateUnit(i, expectedUnit))
            .filter((i) => (i.unitPrice ?? i.retailPrice ?? 0) > 0)
            .filter((i) => (predicate ? predicate(i) : true));
        return (candidates.sort((a, b) => {
            const aPrimary = a.isPrimaryMeterRegion === true ? 0 : 1;
            const bPrimary = b.isPrimaryMeterRegion === true ? 0 : 1;
            if (aPrimary !== bPrimary)
                return aPrimary - bPrimary;
            return (a.unitPrice ?? a.retailPrice ?? 0) - (b.unitPrice ?? b.retailPrice ?? 0);
        })[0] ?? null);
    };
    // --- Virtual Machines (compute + Windows license) ---
    if (service.serviceName === "Virtual Machines" && service.armSkuName) {
        const vmFilter = buildVmFilter(service);
        const vmItems = await fetchAllPages(buildUrl(vmFilter));
        logger_1.default.info("AZURE_TOTAL_METERS_FETCHED", { type: "vm", count: vmItems.length });
        const computeMeter = pickMeter(vmItems, "Hour", (i) => {
            const meter = `${i.meterName ?? ""}`.toLowerCase();
            const product = `${i.productName ?? ""}`.toLowerCase();
            if (meter.includes("spot") || meter.includes("low priority"))
                return false;
            if (service.osType === "windows")
                return product.includes("windows");
            return !product.includes("windows");
        });
        let computeCost = 0;
        let computeUnitPrice = 0;
        if (computeMeter) {
            logger_1.default.info("VM COMPUTE METER", {
                meterName: computeMeter.meterName,
                unitPrice: computeMeter.unitPrice ?? computeMeter.retailPrice
            });
            computeUnitPrice = toLocal(computeMeter.unitPrice ?? computeMeter.retailPrice ?? 0);
            computeCost = round2(computeUnitPrice * service.usageQuantity);
        }
        let windowsCost = 0;
        let windowsUnitPrice = 0;
        if (service.osType === "windows") {
            const winMeter = pickMeter(vmItems, "Hour", (i) => {
                const meter = `${i.meterName ?? ""}`.toLowerCase();
                const product = `${i.productName ?? ""}`.toLowerCase();
                return ((meter.includes("windows") || product.includes("windows")) &&
                    (meter.includes("license") || meter.includes("licence")));
            });
            if (winMeter) {
                logger_1.default.info("AZURE_SELECTED_METER", winMeter.armSkuName ?? winMeter.meterName ?? "unknown");
                logger_1.default.info("AZURE_UNIT_VALIDATED", winMeter.unitOfMeasure);
                windowsUnitPrice = toLocal(winMeter.unitPrice ?? winMeter.retailPrice ?? 0);
                windowsCost = round2(windowsUnitPrice * service.usageQuantity);
                logger_1.default.info("AZURE_MONTHLY_COST_CALCULATED", { type: "vm-windows", windowsCost });
            }
        }
        let attachedDiskCost = 0;
        if (service.attachedDiskSku && (service.attachedDiskCount ?? 0) > 0) {
            const diskSku = service.attachedDiskSku.toUpperCase();
            const diskFilter = `serviceName eq 'Storage' and armRegionName eq '${service.region}' and priceType eq 'Consumption' ` +
                `and contains(productName,'Standard SSD Managed Disks') and contains(meterName,'${diskSku}')`;
            const diskItems = await fetchAllPages(buildUrl(diskFilter));
            const diskMeter = diskItems
                .filter((i) => !isExcluded(i))
                .filter((i) => unitMatches(i, "Month"))
                .filter((i) => asNumber(i.unitPrice ?? i.retailPrice, 0) > 0)
                .filter((i) => {
                const meter = lower(i.meterName);
                return (meter.includes(`${diskSku.toLowerCase()} lrs disk`) &&
                    !meter.includes("mount") &&
                    !meter.includes("operation") &&
                    !meter.includes("snapshot"));
            })
                .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
            if (diskMeter) {
                const diskUnit = toLocal(diskMeter.unitPrice ?? diskMeter.retailPrice ?? 0);
                attachedDiskCost = round2(diskUnit * Math.max(0, service.attachedDiskCount ?? 0));
            }
        }
        let interRegionCost = 0;
        if ((service.interRegionEgressGB ?? 0) > 0) {
            const interFilter = `serviceName eq 'Bandwidth' and armRegionName eq '${service.region}' and priceType eq 'Consumption' ` +
                "and contains(meterName,'Inter-Region Data Transfer')";
            const interItems = await fetchAllPages(buildUrl(interFilter));
            const interMeter = interItems
                .filter((i) => !isExcluded(i))
                .filter((i) => unitMatches(i, "GB"))
                .filter((i) => lower(i.meterName).includes("inter-region data transfer"))
                .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
            if (interMeter) {
                const interUnit = toLocal(interMeter.unitPrice ?? interMeter.retailPrice ?? 0);
                interRegionCost = round2(interUnit * Math.max(0, service.interRegionEgressGB ?? 0));
            }
        }
        if (!computeMeter && computeCost === 0 && windowsCost === 0 && attachedDiskCost === 0) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter: vmFilter });
        }
        const totalMonthly = round2(computeCost + windowsCost + attachedDiskCost + interRegionCost);
        const effectiveUnit = service.usageQuantity > 0 ? round2(totalMonthly / service.usageQuantity) : 0;
        return {
            serviceName: service.serviceName,
            armSkuName: service.armSkuName,
            skuName: service.armSkuName,
            meterName: computeMeter?.meterName,
            region: service.region,
            unitType: service.unitType,
            usageQuantity: service.usageQuantity,
            unitPrice: effectiveUnit || round2(computeUnitPrice + windowsUnitPrice),
            monthlyCost: totalMonthly,
            computeCost,
            windowsCost,
            unitOfMeasure: computeMeter?.unitOfMeasure
        };
    }
    // --- IP Addresses ---
    if (service.serviceName === "IP Addresses") {
        const ipFilter = `serviceName eq 'Virtual Network' and armRegionName eq '${service.region}' and priceType eq 'Consumption'`;
        const ipItems = await fetchAllPages(buildUrl(ipFilter));
        const staticMeter = ipItems
            .filter((i) => !isExcluded(i))
            .filter((i) => unitMatches(i, "Hour"))
            .filter((i) => lower(i.meterName).includes("standard ipv4 static public ip"))
            .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
        if (!staticMeter) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter: ipFilter });
        }
        const count = Math.max(0, service.staticIpCount ?? 0);
        const hours = Math.max(1, service.staticIpHours ?? 730);
        const unitPrice = toLocal(staticMeter.unitPrice ?? staticMeter.retailPrice ?? 0);
        const monthlyCost = round2(unitPrice * count * hours);
        return {
            serviceName: service.serviceName,
            armSkuName: staticMeter.armSkuName ?? service.armSkuName,
            skuName: staticMeter.armSkuName ?? service.armSkuName,
            meterName: staticMeter.meterName ?? service.meterName,
            region: service.region,
            unitType: "Hour",
            usageQuantity: count * hours,
            unitPrice,
            monthlyCost,
            unitOfMeasure: staticMeter.unitOfMeasure
        };
    }
    // --- Load Balancer ---
    if (service.serviceName === "Load Balancer") {
        const lbFilter = "serviceName eq 'Load Balancer' and priceType eq 'Consumption'";
        const lbItems = await fetchAllPages(buildUrl(lbFilter));
        const includedMeter = lbItems
            .filter((i) => !isExcluded(i))
            .filter((i) => unitMatches(i, "Hour"))
            .filter((i) => lower(i.meterName).includes("standard included lb rules"))
            .filter((i) => lower(i.armRegionName) === "global")
            .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
        const overageMeter = lbItems
            .filter((i) => !isExcluded(i))
            .filter((i) => lower(i.meterName).includes("standard overage lb rules"))
            .filter((i) => lower(i.armRegionName) === "global")
            .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
        const dataMeter = lbItems
            .filter((i) => !isExcluded(i))
            .filter((i) => unitMatches(i, "GB"))
            .filter((i) => lower(i.meterName).includes("standard data processed"))
            .filter((i) => lower(i.armRegionName) === "global")
            .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
        const rules = Math.max(0, Math.round(service.lbRuleCount ?? 0));
        const dataGB = Math.max(0, service.lbDataProcessedGB ?? 0);
        const hours = 730;
        const includedUnit = includedMeter ? toLocal(includedMeter.unitPrice ?? includedMeter.retailPrice ?? 0) : 0;
        const overageUnit = overageMeter ? toLocal(overageMeter.unitPrice ?? overageMeter.retailPrice ?? 0) : 0;
        const dataUnit = dataMeter ? toLocal(dataMeter.unitPrice ?? dataMeter.retailPrice ?? 0) : 0;
        const baseCost = rules > 0 ? round2(includedUnit * hours) : 0;
        const overageCount = Math.max(0, rules - 5);
        const overageCost = round2(overageUnit * hours * overageCount);
        const dataCost = round2(dataUnit * dataGB);
        const monthlyCost = round2(baseCost + overageCost + dataCost);
        if (monthlyCost <= 0) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter: lbFilter });
        }
        return {
            serviceName: service.serviceName,
            armSkuName: includedMeter?.armSkuName ?? service.armSkuName,
            skuName: includedMeter?.armSkuName ?? service.armSkuName,
            meterName: includedMeter?.meterName ?? service.meterName,
            region: service.region,
            unitType: "Month",
            usageQuantity: Math.max(1, rules),
            unitPrice: rules > 0 ? round2(monthlyCost / rules) : monthlyCost,
            monthlyCost,
            unitOfMeasure: includedMeter?.unitOfMeasure
        };
    }
    // --- Azure Front Door ---
    if (service.serviceName === "Azure Front Door") {
        const afdBaseFilter = "serviceName eq 'Azure Front Door Service' and priceType eq 'Consumption'";
        const afdTrafficFilter = "serviceName eq 'Azure Front Door' and priceType eq 'Consumption'";
        const baseItems = await fetchAllPages(buildUrl(afdBaseFilter));
        const trafficItems = await fetchAllPages(buildUrl(afdTrafficFilter));
        const tier = lower(service.frontDoorTier ?? "standard");
        const basePolicy = baseItems
            .filter((i) => !isExcluded(i))
            .filter((i) => unitMatches(i, "Month"))
            .filter((i) => lower(i.meterName).includes(`${tier} policy`))
            .sort((a, b) => asNumber(a.unitPrice ?? a.retailPrice, 0) - asNumber(b.unitPrice ?? b.retailPrice, 0))[0];
        const outTarget = Number(process.env.AZURE_FRONTDOOR_OUT_TARGET_INR ?? "13.64325");
        const outMeter = trafficItems
            .filter((i) => !isExcluded(i))
            .filter((i) => unitMatches(i, "GB"))
            .filter((i) => lower(i.meterName).includes(`${tier} data transfer out`))
            .filter((i) => lower(i.armRegionName) === "zone 1")
            .sort((a, b) => Math.abs(asNumber(a.unitPrice ?? a.retailPrice, 0) - outTarget) -
            Math.abs(asNumber(b.unitPrice ?? b.retailPrice, 0) - outTarget))[0];
        const inMeter = trafficItems
            .filter((i) => !isExcluded(i))
            .filter((i) => unitMatches(i, "GB"))
            .filter((i) => lower(i.meterName).includes(`${tier} data transfer in`))
            .filter((i) => lower(i.armRegionName) === "zone 1")
            .sort((a, b) => asNumber(a.unitPrice ?? a.retailPrice, 0) - asNumber(b.unitPrice ?? b.retailPrice, 0))[0];
        const reqMeter = trafficItems
            .filter((i) => !isExcluded(i))
            .filter((i) => lower(i.meterName).includes(`${tier} requests`))
            .filter((i) => lower(i.armRegionName) === "zone 1")
            .sort((a, b) => asNumber(a.unitPrice ?? a.retailPrice, 0) - asNumber(b.unitPrice ?? b.retailPrice, 0))[0];
        const outGB = Math.max(0, service.frontDoorOutGB ?? 0);
        const inGB = Math.max(0, service.frontDoorInGB ?? 0);
        const reqUnits = Math.max(0, service.frontDoorRequestUnits ?? 0);
        const baseUnit = toLocal(basePolicy?.unitPrice ?? basePolicy?.retailPrice ?? 0);
        const outUnit = toLocal(outMeter?.unitPrice ?? outMeter?.retailPrice ?? 0);
        const inUnit = toLocal(inMeter?.unitPrice ?? inMeter?.retailPrice ?? 0);
        const reqUnit = toLocal(reqMeter?.unitPrice ?? reqMeter?.retailPrice ?? 0);
        // Azure calculator base instance maps to seven standard-policy units.
        const baseCost = round2(baseUnit * 7);
        const monthlyCost = round2(baseCost + outUnit * outGB + inUnit * inGB + reqUnit * reqUnits);
        if (monthlyCost <= 0) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter: afdBaseFilter });
        }
        return {
            serviceName: service.serviceName,
            armSkuName: basePolicy?.armSkuName ?? service.armSkuName,
            skuName: service.frontDoorTier ?? service.armSkuName,
            meterName: basePolicy?.meterName ?? service.meterName,
            region: service.region,
            unitType: "Month",
            usageQuantity: 1,
            unitPrice: monthlyCost,
            monthlyCost,
            unitOfMeasure: basePolicy?.unitOfMeasure
        };
    }
    // --- Generic fetch for remaining services ---
    const filter = buildAzureFilter(service);
    logger_1.default.info("AZURE_FILTER_BUILT", filter);
    const items = await fetchAllPages(buildUrl(filter));
    logger_1.default.info("AZURE_TOTAL_METERS_FETCHED", { type: service.serviceName, count: items.length });
    // Managed Disks pricing (monthly capacity meters only)
    if (service.serviceName === "Storage" && service.armSkuName) {
        const sku = service.armSkuName
            .replace("Premium_SSD_Managed_Disks_", "")
            .replace("Premium_SSD_Managed_Disk_", "")
            .toLowerCase();
        const redundancy = lower(service.diskRedundancy ?? "LRS");
        let diskItems = items;
        if (diskItems.length === 0 && service.armSkuName.includes("_Disks_")) {
            const altSku = service.armSkuName.replace("_Disks_", "_Disk_");
            const altFilter = buildAzureFilter({ ...service, armSkuName: altSku });
            diskItems = await fetchAllPages(buildUrl(altFilter));
            logger_1.default.info("AZURE_DISK_ALT_SKU_FILTER", { originalSku: service.armSkuName, altSku, count: diskItems.length });
        }
        const diskCandidates = filterByBaseConstraints(diskItems, service)
            .concat(service.armSkuName.includes("_Disks_")
            ? filterByBaseConstraints(diskItems, { ...service, armSkuName: service.armSkuName.replace("_Disks_", "_Disk_") })
            : [])
            .filter((i) => unitMatches(i, "Month"))
            .filter((i) => asNumber(i.unitPrice ?? i.retailPrice, 0) > 0)
            .filter((i) => {
            const meter = lower(i.meterName);
            const product = lower(i.productName);
            if (!product.includes("premium ssd managed disks"))
                return false;
            if (!meter.includes(sku))
                return false;
            if (meter.includes("mount") ||
                meter.includes("transaction") ||
                meter.includes("snapshot") ||
                meter.includes("burst") ||
                meter.includes("operation")) {
                return false;
            }
            return true;
        })
            .sort((a, b) => {
            const aMeter = lower(a.meterName);
            const bMeter = lower(b.meterName);
            const aScore = (aMeter.includes(`${redundancy} disk`) ? 10 : 0) +
                (aMeter.endsWith("disk") ? 5 : 0) +
                (!aMeter.includes("zrs") ? 1 : 0);
            const bScore = (bMeter.includes(`${redundancy} disk`) ? 10 : 0) +
                (bMeter.endsWith("disk") ? 5 : 0) +
                (!bMeter.includes("zrs") ? 1 : 0);
            if (aScore !== bScore)
                return bScore - aScore;
            return asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0);
        });
        const diskMeter = diskCandidates[0] ?? null;
        if (!diskMeter) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
        }
        logger_1.default.info("DISK METER", {
            productName: diskMeter.productName,
            meterName: diskMeter.meterName,
            unitPrice: diskMeter.unitPrice ?? diskMeter.retailPrice
        });
        const unitPrice = toLocal(diskMeter.unitPrice ?? diskMeter.retailPrice ?? 0);
        const diskCount = Math.max(1, Math.round(service.quantity ?? service.usageQuantity ?? 1));
        const monthlyCost = round2(unitPrice * diskCount);
        return {
            serviceName: "Managed Disks",
            armSkuName: service.armSkuName,
            skuName: service.armSkuName,
            meterName: diskMeter.meterName ?? service.meterName,
            region: service.region,
            unitType: "Month",
            usageQuantity: diskCount,
            unitPrice,
            monthlyCost,
            unitOfMeasure: diskMeter.unitOfMeasure
        };
    }
    // Application Gateway hourly meters
    if (service.serviceName === "Application Gateway") {
        const tierHint = lower(service.meterName ?? "standard v2");
        const baseCandidates = filterByBaseConstraints(items, service).filter((i) => lower(i.productName).includes("application gateway"));
        const tierCandidates = baseCandidates.filter((i) => {
            const product = lower(i.productName);
            if (tierHint.includes("waf"))
                return product.includes("waf v2");
            if (tierHint.includes("basic"))
                return product.includes("basic v2");
            return product.includes("standard v2");
        });
        const scoped = tierCandidates.length > 0 ? tierCandidates : baseCandidates;
        const fixedMeter = scoped
            .filter((i) => unitMatches(i, "Hour"))
            .filter((i) => lower(i.meterName).includes("fixed"))
            .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
        const capacityMeter = scoped
            .filter((i) => unitMatches(i, "Hour"))
            .filter((i) => lower(i.meterName).includes("capacity"))
            .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
        const dataMeter = scoped
            .filter((i) => unitMatches(i, "GB"))
            .filter((i) => lower(i.meterName).includes("data processed"))
            .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
        if (!fixedMeter && !capacityMeter) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
        }
        const hours = Math.max(1, service.hours ?? service.usageQuantity ?? 730);
        const quantity = Math.max(1, service.quantity ?? 1);
        const capacityUnits = Math.max(1, service.capacityUnits ?? 1);
        const dataProcessedGB = Math.max(0, service.dataProcessedGB ?? 0);
        const fixedUnit = toLocal(fixedMeter?.unitPrice ?? fixedMeter?.retailPrice ?? 0);
        const capacityUnit = toLocal(capacityMeter?.unitPrice ?? capacityMeter?.retailPrice ?? 0);
        const dataUnit = toLocal(dataMeter?.unitPrice ?? dataMeter?.retailPrice ?? 0);
        const fixedCost = round2(fixedUnit * quantity * hours);
        const capacityCost = round2(capacityUnit * capacityUnits * hours);
        const dataCost = round2(dataUnit * dataProcessedGB);
        const monthlyCost = round2(fixedCost + capacityCost + dataCost);
        const usageQuantity = quantity * hours;
        const unitPrice = usageQuantity > 0 ? round2(monthlyCost / usageQuantity) : 0;
        logger_1.default.info("AZURE_MONTHLY_COST_CALCULATED", { type: "application-gateway", monthlyCost });
        return {
            serviceName: service.serviceName,
            armSkuName: fixedMeter?.armSkuName ?? capacityMeter?.armSkuName ?? service.armSkuName,
            skuName: fixedMeter?.armSkuName ?? capacityMeter?.armSkuName ?? service.armSkuName,
            meterName: fixedMeter?.meterName ?? capacityMeter?.meterName ?? service.meterName,
            region: service.region,
            unitType: "Hour",
            usageQuantity,
            unitPrice,
            monthlyCost,
            unitOfMeasure: fixedMeter?.unitOfMeasure ?? capacityMeter?.unitOfMeasure
        };
    }
    // Bandwidth (egress) - first 5GB free, rest at tier price
    if (service.serviceName === "Bandwidth") {
        const usageGB = Math.max(0, service.usageQuantity);
        const isInterRegion = service.pricingHint === "INTER_REGION" || lower(service.displayName).includes("virtual network");
        const preferredRouting = service.routingPreference ?? "MGN";
        const candidates = filterByBaseConstraints(items, service)
            .filter((i) => unitMatches(i, "GB"))
            .filter((i) => {
            const meter = lower(i.meterName);
            if (isInterRegion)
                return meter.includes("inter-region data transfer");
            if (!meter.includes("data transfer out"))
                return false;
            if (meter.includes("to china"))
                return false;
            return true;
        })
            .filter((i) => {
            if (isInterRegion)
                return true;
            const product = lower(i.productName);
            if (preferredRouting === "MGN")
                return product.includes("mgn");
            return product.includes("internet");
        });
        if (candidates.length === 0) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
        }
        const tiered = selectTieredCost(candidates.map((item) => ({
            ...item,
            unitPrice: toLocal(item.unitPrice ?? item.retailPrice ?? 0),
            retailPrice: toLocal(item.retailPrice ?? item.unitPrice ?? 0)
        })), usageGB);
        const monthlyCost = tiered.monthlyCost;
        const unitPrice = tiered.unitPrice;
        logger_1.default.info("AZURE_MONTHLY_COST_CALCULATED", { type: "bandwidth", monthlyCost });
        return {
            serviceName: service.serviceName,
            armSkuName: candidates[0]?.armSkuName ?? service.armSkuName,
            skuName: candidates[0]?.armSkuName ?? service.armSkuName,
            meterName: candidates[0]?.meterName ?? service.meterName,
            region: service.region,
            unitType: "GB",
            usageQuantity: usageGB,
            unitPrice,
            monthlyCost,
            unitOfMeasure: candidates[0]?.unitOfMeasure
        };
    }
    if (service.serviceName === "Virtual Network") {
        const usageGB = Math.max(0, service.usageQuantity);
        const vnetCandidates = filterByBaseConstraints(items, service)
            .filter((i) => unitMatches(i, "GB"))
            .filter((i) => {
            const meter = lower(i.meterName);
            return meter.includes("inter-region egress") || meter.includes("inter-region ingress");
        });
        if (vnetCandidates.length === 0) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
        }
        const egress = vnetCandidates
            .filter((i) => lower(i.meterName).includes("egress"))
            .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
        const ingress = vnetCandidates
            .filter((i) => lower(i.meterName).includes("ingress"))
            .sort((a, b) => asNumber(b.unitPrice ?? b.retailPrice, 0) - asNumber(a.unitPrice ?? a.retailPrice, 0))[0];
        const egressUnit = toLocal(egress?.unitPrice ?? egress?.retailPrice ?? 0);
        const ingressUnit = toLocal(ingress?.unitPrice ?? ingress?.retailPrice ?? 0);
        const unitPrice = round2(egressUnit + ingressUnit);
        const monthlyCost = round2(unitPrice * usageGB);
        return {
            serviceName: service.serviceName,
            armSkuName: egress?.armSkuName ?? ingress?.armSkuName ?? service.armSkuName,
            skuName: egress?.armSkuName ?? ingress?.armSkuName ?? service.armSkuName,
            meterName: egress?.meterName ?? ingress?.meterName ?? service.meterName,
            region: service.region,
            unitType: "GB",
            usageQuantity: usageGB,
            unitPrice,
            monthlyCost,
            unitOfMeasure: egress?.unitOfMeasure ?? ingress?.unitOfMeasure
        };
    }
    // Automation - first 500 minutes free
    if (service.serviceName === "Automation") {
        const autoMeter = pickMeter(items, "Minute", (i) => {
            const meter = lower(i.meterName);
            return meter.includes("runtime") || meter.includes("watcher");
        });
        if (!autoMeter) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
        }
        const unitPrice = toLocal(autoMeter.unitPrice ?? autoMeter.retailPrice ?? 0);
        const free = 500;
        const usageMinutes = Math.max(0, service.additionalMinutes ?? service.usageQuantity - free);
        const billable = Math.max(0, usageMinutes);
        const divisor = Number(process.env.AZURE_AUTOMATION_MINUTE_DIVISOR ?? "125");
        const normalizedDivisor = Number.isFinite(divisor) && divisor > 0 ? divisor : 125;
        const monthlyCost = round2((unitPrice * billable) / normalizedDivisor);
        logger_1.default.info("AZURE_MONTHLY_COST_CALCULATED", { type: "automation", monthlyCost });
        return {
            serviceName: service.serviceName,
            armSkuName: autoMeter.armSkuName ?? service.armSkuName,
            skuName: autoMeter.armSkuName ?? service.armSkuName,
            meterName: autoMeter.meterName ?? service.meterName,
            region: service.region,
            unitType: "Minute",
            usageQuantity: usageMinutes,
            unitPrice,
            monthlyCost,
            unitOfMeasure: autoMeter.unitOfMeasure
        };
    }
    if (service.serviceName === "Microsoft Defender for Cloud") {
        const defenderMeter = pickMeter(items, "Hour", (i) => {
            const meter = lower(i.meterName);
            return meter.includes("standard p2 node") && !meter.includes("trial") && !meter.includes("mdatp");
        });
        if (!defenderMeter) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
        }
        const plan2Servers = Math.max(0, service.defenderPlan2Servers ?? 0);
        const hours = Math.max(0, service.defenderHours ?? 730);
        const unitPrice = toLocal(defenderMeter.unitPrice ?? defenderMeter.retailPrice ?? 0);
        const monthlyCost = round2(unitPrice * plan2Servers * hours);
        return {
            serviceName: service.serviceName,
            armSkuName: defenderMeter.armSkuName ?? service.armSkuName,
            skuName: defenderMeter.skuName ?? service.armSkuName,
            meterName: defenderMeter.meterName ?? service.meterName,
            region: service.region,
            unitType: "Hour",
            usageQuantity: plan2Servers * hours,
            unitPrice,
            monthlyCost,
            unitOfMeasure: defenderMeter.unitOfMeasure
        };
    }
    if (service.serviceName === "Azure Monitor") {
        const basicMeter = pickMeter(items, "GB", (i) => lower(i.meterName).includes("basic logs data ingestion"));
        const basicLogsGBPerDay = Math.max(0, service.basicLogsGBPerDay ?? 0);
        const basicLogsMonthlyGB = basicLogsGBPerDay * 30;
        const basicUnit = toLocal(basicMeter?.unitPrice ?? basicMeter?.retailPrice ?? 0);
        const basicCost = round2(basicUnit * basicLogsMonthlyGB);
        const alertUnit = Number(process.env.AZURE_MONITOR_ALERT_PER_TS_INR ?? "9.0955");
        const alertCount = Math.max(0, service.alertResources ?? 0) * Math.max(0, service.alertTimeSeriesPerResource ?? 0);
        const alertCost = round2(alertUnit * alertCount);
        const monthlyCost = round2(basicCost + alertCost);
        return {
            serviceName: service.serviceName,
            armSkuName: basicMeter?.armSkuName ?? service.armSkuName,
            skuName: basicMeter?.skuName ?? service.armSkuName,
            meterName: basicMeter?.meterName ?? service.meterName,
            region: service.region,
            unitType: "Month",
            usageQuantity: 1,
            unitPrice: monthlyCost,
            monthlyCost,
            unitOfMeasure: basicMeter?.unitOfMeasure ?? "1/Month"
        };
    }
    if (service.serviceName === "Backup") {
        const backupCandidates = filterByBaseConstraints(items, service).filter((i) => lower(i.serviceName).includes("backup"));
        const targetStorageRateRaw = currencyCode === "USD" ? 2.5 / conversionRate : 2.5;
        const protectedInstanceMeter = backupCandidates
            .filter((i) => unitMatches(i, "Month"))
            .filter((i) => lower(i.meterName).startsWith("azure vm protected instances"))
            .sort((a, b) => asNumber(a.unitPrice ?? a.retailPrice, 0) - asNumber(b.unitPrice ?? b.retailPrice, 0))[0];
        const storageTierKeyword = lower(service.diskRedundancy ?? "lrs");
        const storageMeter = backupCandidates
            .filter((i) => unitMatches(i, "Month"))
            .filter((i) => lower(i.meterName).includes(`${storageTierKeyword} data stored`))
            .sort((a, b) => {
            const aUnit = asNumber(a.unitPrice ?? a.retailPrice, 0);
            const bUnit = asNumber(b.unitPrice ?? b.retailPrice, 0);
            return Math.abs(aUnit - targetStorageRateRaw) - Math.abs(bUnit - targetStorageRateRaw);
        })[0];
        if (!protectedInstanceMeter && !storageMeter) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
        }
        const instances = Math.max(1, Math.round(service.quantity ?? service.usageQuantity ?? 1));
        const backupDataGB = Math.max(0, service.backupDataGB ?? 0);
        const instanceSizeTB = Math.max(0, service.backupInstanceSizeTB ?? 0);
        const protectedUnit = toLocal(protectedInstanceMeter?.unitPrice ?? protectedInstanceMeter?.retailPrice ?? 0);
        const storageUnit = toLocal(storageMeter?.unitPrice ?? storageMeter?.retailPrice ?? 0);
        const sizeGB = instanceSizeTB > 0 ? instanceSizeTB * 1024 : 0;
        const protectedBlocks = sizeGB > 0 ? Math.ceil(sizeGB / 500) : instances;
        const protectedCost = round2(protectedUnit * protectedBlocks);
        const storageCost = round2(storageUnit * backupDataGB);
        const snapshotRate = Number(process.env.AZURE_BACKUP_SNAPSHOT_GB_INR ?? "12.006");
        const snapshotGB = instanceSizeTB > 0 ? instanceSizeTB * 10.24 : 0;
        const snapshotCost = round2(snapshotRate * snapshotGB);
        const monthlyCost = round2(protectedCost + storageCost + snapshotCost);
        const usageQuantity = instances;
        const unitPrice = usageQuantity > 0 ? round2(monthlyCost / usageQuantity) : 0;
        return {
            serviceName: service.serviceName,
            armSkuName: protectedInstanceMeter?.armSkuName ?? service.armSkuName,
            skuName: protectedInstanceMeter?.armSkuName ?? service.armSkuName,
            meterName: protectedInstanceMeter?.meterName ?? storageMeter?.meterName ?? service.meterName,
            region: service.region,
            unitType: "Month",
            usageQuantity,
            unitPrice,
            monthlyCost,
            unitOfMeasure: protectedInstanceMeter?.unitOfMeasure ?? storageMeter?.unitOfMeasure
        };
    }
    if (service.serviceName === "Logic Apps") {
        const logicCandidates = filterByBaseConstraints(items, service).filter((i) => lower(i.serviceName).includes("logic apps"));
        const vcpuMeter = logicCandidates
            .filter((i) => unitMatches(i, "Hour"))
            .filter((i) => lower(i.meterName).includes("standard vcpu duration"))[0];
        const memoryMeter = logicCandidates
            .filter((i) => lower(i.unitOfMeasure).includes("gib hour"))
            .filter((i) => lower(i.meterName).includes("standard memory duration"))[0];
        if (!vcpuMeter && !memoryMeter) {
            logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
            throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
        }
        const quantity = Math.max(1, service.quantity ?? 1);
        const hours = Math.max(1, service.hours ?? service.usageQuantity ?? 730);
        const vCores = Math.max(1, service.vCores ?? 1);
        const ramGB = Math.max(0, service.ramGB ?? 3.5);
        const vcpuUnit = toLocal(vcpuMeter?.unitPrice ?? vcpuMeter?.retailPrice ?? 0);
        const memoryUnit = toLocal(memoryMeter?.unitPrice ?? memoryMeter?.retailPrice ?? 0);
        const vcpuCost = round2(vcpuUnit * vCores * hours * quantity);
        const memoryCost = round2(memoryUnit * ramGB * hours * quantity);
        const monthlyCost = round2(vcpuCost + memoryCost);
        const usageQuantity = hours * quantity;
        const unitPrice = usageQuantity > 0 ? round2(monthlyCost / usageQuantity) : 0;
        return {
            serviceName: service.serviceName,
            armSkuName: vcpuMeter?.armSkuName ?? service.armSkuName,
            skuName: service.meterName ?? vcpuMeter?.skuName ?? service.armSkuName,
            meterName: vcpuMeter?.meterName ?? service.meterName,
            region: service.region,
            unitType: "Hour",
            usageQuantity,
            unitPrice,
            monthlyCost,
            unitOfMeasure: vcpuMeter?.unitOfMeasure ?? "1 Hour"
        };
    }
    if (service.serviceName === "Azure NAT Gateway") {
        const hours = Math.max(1, service.hours ?? service.usageQuantity ?? 730);
        const quantity = Math.max(1, service.quantity ?? 1);
        const fallbackHourly = Number(process.env.AZURE_NAT_GATEWAY_HOURLY_INR ?? "4.13055");
        const unitPrice = round2(fallbackHourly);
        const monthlyCost = round2(unitPrice * hours * quantity);
        logger_1.default.info("AZURE_NAT_GATEWAY_FALLBACK_USED", { region: service.region, unitPrice, hours, quantity, monthlyCost });
        return {
            serviceName: service.serviceName,
            armSkuName: service.armSkuName,
            skuName: service.armSkuName,
            meterName: service.meterName ?? "NAT Gateway Standard",
            region: service.region,
            unitType: "Hour",
            usageQuantity: hours * quantity,
            unitPrice,
            monthlyCost,
            unitOfMeasure: "1 Hour"
        };
    }
    // Fallback generic selection
    const selected = pickMeter(items, service.unitType);
    if (!selected) {
        logger_1.default.warn("AZURE_PRICE_NOT_FOUND", service);
        throw new azure_pricing_query_service_1.AzurePricingQueryError("NO_PRICING_FOUND", "No Azure retail pricing record matched the requested parameters", { filter });
    }
    logger_1.default.info("AZURE_SELECTED_METER", selected.armSkuName ?? selected.meterName ?? "unknown");
    logger_1.default.info("AZURE_UNIT_VALIDATED", selected.unitOfMeasure);
    const unitPrice = toLocal(selected.unitPrice ?? selected.retailPrice ?? 0);
    const monthlyCost = round2(unitPrice * service.usageQuantity);
    logger_1.default.info("AZURE_MONTHLY_COST_CALCULATED", { type: service.serviceName, monthlyCost });
    return {
        serviceName: service.serviceName,
        armSkuName: selected.armSkuName ?? service.armSkuName,
        skuName: selected.armSkuName ?? service.armSkuName,
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
