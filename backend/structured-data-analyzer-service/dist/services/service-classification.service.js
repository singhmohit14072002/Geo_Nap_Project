"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyServices = exports.SERVICE_CLASSIFICATIONS = void 0;
exports.SERVICE_CLASSIFICATIONS = [
    "COMPUTE_VM",
    "STORAGE_DISK",
    "NETWORK_GATEWAY",
    "NETWORK_EGRESS",
    "BACKUP",
    "AUTOMATION",
    "MONITORING",
    "LOGIC_APPS",
    "OTHER"
];
const buildEmptySummary = () => ({
    COMPUTE_VM: 0,
    STORAGE_DISK: 0,
    NETWORK_GATEWAY: 0,
    NETWORK_EGRESS: 0,
    BACKUP: 0,
    AUTOMATION: 0,
    MONITORING: 0,
    LOGIC_APPS: 0,
    OTHER: 0
});
const toStringValue = (value) => {
    if (typeof value === "string") {
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return null;
};
const readFirstString = (row, keys) => {
    for (const key of keys) {
        if (!(key in row)) {
            continue;
        }
        const value = toStringValue(row[key]);
        if (value) {
            return value;
        }
    }
    return null;
};
const normalize = (value) => (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const classifyServiceRow = (serviceCategoryRaw, serviceTypeRaw, descriptionRaw) => {
    const serviceCategory = normalize(serviceCategoryRaw);
    const serviceType = normalize(serviceTypeRaw);
    const description = normalize(descriptionRaw);
    const context = `${serviceCategory} ${serviceType} ${description}`;
    if (serviceType.includes("virtual machine") ||
        (serviceCategory.includes("compute") &&
            (description.includes("vcpu") || description.includes("vcore")))) {
        return {
            classification: "COMPUTE_VM",
            reason: "Matched VM/compute pattern"
        };
    }
    if (serviceType.includes("managed disk") || context.includes("disk type")) {
        return {
            classification: "STORAGE_DISK",
            reason: "Matched managed disk/storage pattern"
        };
    }
    if (serviceType.includes("application gateway") ||
        serviceType.includes("nat gateway")) {
        return {
            classification: "NETWORK_GATEWAY",
            reason: "Matched network gateway pattern"
        };
    }
    if (serviceType.includes("bandwidth") ||
        serviceType.includes("egress") ||
        serviceType.includes("data transfer out")) {
        return {
            classification: "NETWORK_EGRESS",
            reason: "Matched egress/bandwidth pattern"
        };
    }
    if (serviceType.includes("backup")) {
        return {
            classification: "BACKUP",
            reason: "Matched backup service pattern"
        };
    }
    if (serviceType.includes("automation")) {
        return {
            classification: "AUTOMATION",
            reason: "Matched automation service pattern"
        };
    }
    if (serviceType.includes("monitor") ||
        context.includes("application insights") ||
        context.includes("log analytics")) {
        return {
            classification: "MONITORING",
            reason: "Matched monitoring service pattern"
        };
    }
    if (serviceType.includes("logic apps")) {
        return {
            classification: "LOGIC_APPS",
            reason: "Matched logic apps service pattern"
        };
    }
    return {
        classification: "OTHER",
        reason: "No deterministic service rule matched"
    };
};
const isHeaderLikeRow = (serviceCategoryRaw, serviceTypeRaw) => {
    const category = normalize(serviceCategoryRaw);
    const serviceType = normalize(serviceTypeRaw);
    return category.includes("service category") || serviceType === "service type";
};
const classifyServices = (rows, documentType) => {
    const summary = buildEmptySummary();
    if (documentType !== "CLOUD_ESTIMATE") {
        return {
            classifiedServices: [],
            summary
        };
    }
    const classifiedServices = [];
    for (const row of rows) {
        const serviceCategory = readFirstString(row, [
            "servicecategory",
            "service_category",
            "service_category_name",
            "microsoft_azure_estimate"
        ]);
        const serviceType = readFirstString(row, [
            "servicetype",
            "service_type",
            "service_type_name",
            "__empty"
        ]);
        const description = readFirstString(row, [
            "description",
            "service_description",
            "__empty_3"
        ]);
        if (isHeaderLikeRow(serviceCategory, serviceType)) {
            continue;
        }
        if (!serviceType) {
            continue;
        }
        const decision = classifyServiceRow(serviceCategory, serviceType, description);
        summary[decision.classification] += 1;
        classifiedServices.push({
            classification: decision.classification,
            serviceCategory,
            serviceType,
            reason: decision.reason,
            row
        });
    }
    return {
        classifiedServices,
        summary
    };
};
exports.classifyServices = classifyServices;
