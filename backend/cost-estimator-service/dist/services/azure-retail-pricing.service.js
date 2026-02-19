"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAzureRetailPricingDirect = exports.pickPostgresBaseHourlyUsd = exports.pickEgressPerGbUsd = exports.pickStoragePerGbMonthUsd = exports.pickVmHourlyPriceUsd = exports.selectReferenceVm = exports.fetchAzureRetailPrices = exports.getEffectivePrice = exports.VM_REFERENCE_CATALOG = void 0;
const https_1 = __importDefault(require("https"));
const AZURE_RETAIL_ENDPOINT = process.env.AZURE_RETAIL_ENDPOINT ??
    "https://prices.azure.com/api/retail/prices";
const AZURE_RETAIL_API_VERSION = process.env.AZURE_RETAIL_API_VERSION ?? "2023-01-01-preview";
const AZURE_RETAIL_MAX_PAGES = Number(process.env.AZURE_RETAIL_MAX_PAGES ?? "3");
const AZURE_USD_TO_INR = Number(process.env.AZURE_USD_TO_INR ?? "83");
const FALLBACK = {
    vcpuPerMonthInr: 500,
    storagePerGbPerMonthInr: 4,
    egressPerGbInr: 5,
    databaseBasePerMonthInr: 2000
};
exports.VM_REFERENCE_CATALOG = [
    { sku: "Standard_F2s_v2", vcpu: 2, ramGB: 4 },
    { sku: "Standard_F2as_v6", vcpu: 2, ramGB: 8 },
    { sku: "Standard_F4s_v2", vcpu: 4, ramGB: 8 },
    { sku: "Standard_F8s_v2", vcpu: 8, ramGB: 16 },
    { sku: "Standard_F8as_v6", vcpu: 8, ramGB: 32 },
    { sku: "Standard_F16s_v2", vcpu: 16, ramGB: 32 },
    { sku: "Standard_D2s_v5", vcpu: 2, ramGB: 8 },
    { sku: "Standard_D4s_v5", vcpu: 4, ramGB: 16 },
    { sku: "Standard_D8s_v5", vcpu: 8, ramGB: 32 },
    { sku: "Standard_D16s_v5", vcpu: 16, ramGB: 64 },
    { sku: "Standard_D32s_v5", vcpu: 32, ramGB: 128 }
];
const round2 = (value) => Number(value.toFixed(2));
const fetchJson = (url) => new Promise((resolve, reject) => {
    https_1.default
        .get(url, (res) => {
        const statusCode = res.statusCode ?? 500;
        const chunks = [];
        res.on("data", (chunk) => {
            chunks.push(chunk);
        });
        res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            if (statusCode >= 400) {
                reject(new Error(`Azure retail API request failed with status ${statusCode}`));
                return;
            }
            try {
                resolve(JSON.parse(body));
            }
            catch (err) {
                reject(new Error(`Failed to parse Azure retail API response: ${err instanceof Error ? err.message : "invalid JSON"}`));
            }
        });
    })
        .on("error", reject);
});
const getEffectivePrice = (item) => {
    if (typeof item.retailPrice === "number" && item.retailPrice > 0) {
        return item.retailPrice;
    }
    if (typeof item.unitPrice === "number" && item.unitPrice > 0) {
        return item.unitPrice;
    }
    return 0;
};
exports.getEffectivePrice = getEffectivePrice;
const fetchAzureRetailPrices = async (filter, maxPages = Math.max(1, AZURE_RETAIL_MAX_PAGES)) => {
    let nextUrl = `${AZURE_RETAIL_ENDPOINT}?api-version=${encodeURIComponent(AZURE_RETAIL_API_VERSION)}&$filter=${encodeURIComponent(filter)}`;
    const collected = [];
    let pages = 0;
    while (nextUrl && pages < maxPages) {
        const data = await fetchJson(nextUrl);
        const items = Array.isArray(data.Items) ? data.Items : [];
        collected.push(...items);
        nextUrl = data.NextPageLink ?? data.nextPageLink ?? "";
        pages += 1;
    }
    return collected;
};
exports.fetchAzureRetailPrices = fetchAzureRetailPrices;
const selectReferenceVm = (compute) => {
    for (const vm of exports.VM_REFERENCE_CATALOG) {
        if (vm.vcpu >= compute.vCPU && vm.ramGB >= compute.ramGB) {
            return vm;
        }
    }
    return exports.VM_REFERENCE_CATALOG[exports.VM_REFERENCE_CATALOG.length - 1];
};
exports.selectReferenceVm = selectReferenceVm;
const pickVmHourlyPriceUsd = (items, osType) => {
    const filtered = items
        .filter((item) => {
        const price = (0, exports.getEffectivePrice)(item);
        if (price <= 0) {
            return false;
        }
        const product = `${item.productName ?? ""}`.toLowerCase();
        const meter = `${item.meterName ?? ""}`.toLowerCase();
        if (product.includes("spot") || meter.includes("spot")) {
            return false;
        }
        if (product.includes("low priority") || meter.includes("low priority")) {
            return false;
        }
        const isWindows = product.includes("windows");
        return osType === "windows" ? isWindows : !isWindows;
    })
        .sort((a, b) => (0, exports.getEffectivePrice)(a) - (0, exports.getEffectivePrice)(b));
    if (filtered.length === 0) {
        return null;
    }
    return (0, exports.getEffectivePrice)(filtered[0]);
};
exports.pickVmHourlyPriceUsd = pickVmHourlyPriceUsd;
const pickStoragePerGbMonthUsd = (items) => {
    const candidates = items
        .filter((item) => {
        const meter = `${item.meterName ?? ""}`.toLowerCase();
        const unit = `${item.unitOfMeasure ?? ""}`.toLowerCase();
        const price = (0, exports.getEffectivePrice)(item);
        return (price > 0 &&
            meter.includes("data stored") &&
            meter.includes("hot") &&
            meter.includes("lrs") &&
            unit.includes("gb"));
    })
        .sort((a, b) => (0, exports.getEffectivePrice)(a) - (0, exports.getEffectivePrice)(b));
    if (candidates.length === 0) {
        return null;
    }
    return (0, exports.getEffectivePrice)(candidates[0]);
};
exports.pickStoragePerGbMonthUsd = pickStoragePerGbMonthUsd;
const pickEgressPerGbUsd = (items) => {
    const candidates = items
        .filter((item) => {
        const meter = `${item.meterName ?? ""}`.toLowerCase();
        const unit = `${item.unitOfMeasure ?? ""}`.toLowerCase();
        const price = (0, exports.getEffectivePrice)(item);
        return (price > 0 &&
            meter.includes("data transfer out") &&
            unit.includes("gb"));
    })
        .sort((a, b) => (0, exports.getEffectivePrice)(a) - (0, exports.getEffectivePrice)(b));
    if (candidates.length === 0) {
        return null;
    }
    return (0, exports.getEffectivePrice)(candidates[0]);
};
exports.pickEgressPerGbUsd = pickEgressPerGbUsd;
const pickPostgresBaseHourlyUsd = (items) => {
    const candidates = items
        .filter((item) => {
        const product = `${item.productName ?? ""}`.toLowerCase();
        const meter = `${item.meterName ?? ""}`.toLowerCase();
        const unit = `${item.unitOfMeasure ?? ""}`.toLowerCase();
        const price = (0, exports.getEffectivePrice)(item);
        return (price > 0 &&
            product.includes("flexible server") &&
            meter.includes("vcore") &&
            unit.includes("hour"));
    })
        .sort((a, b) => (0, exports.getEffectivePrice)(a) - (0, exports.getEffectivePrice)(b));
    if (candidates.length === 0) {
        return null;
    }
    return (0, exports.getEffectivePrice)(candidates[0]);
};
exports.pickPostgresBaseHourlyUsd = pickPostgresBaseHourlyUsd;
const toInr = (price, currencyCode) => {
    const code = `${currencyCode ?? "USD"}`.toUpperCase();
    if (code === "INR") {
        return round2(price);
    }
    return round2(price * AZURE_USD_TO_INR);
};
const resolveAzureRetailPricingDirect = async (region, requirement) => {
    let usedFallback = false;
    const vmSelections = [];
    for (let index = 0; index < requirement.compute.length; index += 1) {
        const compute = requirement.compute[index];
        const refVm = (0, exports.selectReferenceVm)(compute);
        const vmFilter = `serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and armSkuName eq '${refVm.sku}' and priceType eq 'Consumption'`;
        let hourlyPriceUsd = null;
        try {
            const vmItems = await (0, exports.fetchAzureRetailPrices)(vmFilter);
            hourlyPriceUsd = (0, exports.pickVmHourlyPriceUsd)(vmItems, compute.osType);
        }
        catch {
            hourlyPriceUsd = null;
        }
        let monthlyCostInr;
        if (hourlyPriceUsd === null) {
            usedFallback = true;
            monthlyCostInr = round2(compute.vCPU * FALLBACK.vcpuPerMonthInr * compute.quantity);
        }
        else {
            monthlyCostInr = round2(toInr(hourlyPriceUsd, "USD") * 730 * compute.quantity);
        }
        vmSelections.push({
            requirementIndex: index,
            sku: refVm.sku,
            vcpu: refVm.vcpu,
            ramGB: refVm.ramGB,
            osType: compute.osType,
            quantity: compute.quantity,
            monthlyCostInr,
            hourlyPriceUsd: hourlyPriceUsd ?? undefined
        });
    }
    let storagePerGbPerMonthInr = FALLBACK.storagePerGbPerMonthInr;
    try {
        const storageItems = await (0, exports.fetchAzureRetailPrices)(`serviceName eq 'Storage' and armRegionName eq '${region}' and priceType eq 'Consumption'`);
        const storageUsd = (0, exports.pickStoragePerGbMonthUsd)(storageItems);
        if (storageUsd !== null) {
            storagePerGbPerMonthInr = toInr(storageUsd, "USD");
        }
        else {
            usedFallback = true;
        }
    }
    catch {
        usedFallback = true;
    }
    let egressPerGbInr = FALLBACK.egressPerGbInr;
    try {
        const bandwidthItems = await (0, exports.fetchAzureRetailPrices)(`serviceName eq 'Bandwidth' and armRegionName eq '${region}' and priceType eq 'Consumption'`);
        const egressUsd = (0, exports.pickEgressPerGbUsd)(bandwidthItems);
        if (egressUsd !== null) {
            egressPerGbInr = toInr(egressUsd, "USD");
        }
        else {
            usedFallback = true;
        }
    }
    catch {
        usedFallback = true;
    }
    let databaseBasePerMonthInr = FALLBACK.databaseBasePerMonthInr;
    try {
        const postgresItems = await (0, exports.fetchAzureRetailPrices)(`serviceName eq 'Azure Database for PostgreSQL' and armRegionName eq '${region}' and priceType eq 'Consumption'`);
        const postgresHourlyUsd = (0, exports.pickPostgresBaseHourlyUsd)(postgresItems);
        if (postgresHourlyUsd !== null) {
            databaseBasePerMonthInr = round2(toInr(postgresHourlyUsd, "USD") * 730);
        }
        else {
            usedFallback = true;
        }
    }
    catch {
        usedFallback = true;
    }
    return {
        storagePerGbPerMonthInr,
        egressPerGbInr,
        databaseBasePerMonthInr,
        vmSelections,
        pricingVersion: usedFallback
            ? "azure-retail-direct-mixed-fallback"
            : "azure-retail-direct",
        source: usedFallback ? "mixed-fallback" : "retail"
    };
};
exports.resolveAzureRetailPricingDirect = resolveAzureRetailPricingDirect;
