"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyAzureEstimateRow = exports.AZURE_SERVICE_TYPE = void 0;
exports.AZURE_SERVICE_TYPE = {
    COMPUTE_VM: "COMPUTE_VM",
    STORAGE_DISK: "STORAGE_DISK",
    APPLICATION_GATEWAY: "APPLICATION_GATEWAY",
    BANDWIDTH: "BANDWIDTH",
    NAT_GATEWAY: "NAT_GATEWAY",
    BACKUP: "BACKUP",
    AUTOMATION: "AUTOMATION",
    MONITORING: "MONITORING",
    LOGIC_APPS: "LOGIC_APPS",
    VIRTUAL_NETWORK: "VIRTUAL_NETWORK",
    OTHER: "OTHER"
};
const includesAny = (text, needles) => {
    const t = text.toLowerCase();
    return needles.some((n) => t.includes(n));
};
const classifyAzureEstimateRow = (row) => {
    const cat = row.serviceCategory.toLowerCase();
    const type = row.serviceType.toLowerCase();
    if (includesAny(type, ["virtual machine"])) {
        return { type: exports.AZURE_SERVICE_TYPE.COMPUTE_VM, row };
    }
    if (includesAny(type, ["managed disk"])) {
        return { type: exports.AZURE_SERVICE_TYPE.STORAGE_DISK, row };
    }
    if (includesAny(type, ["application gateway"])) {
        return { type: exports.AZURE_SERVICE_TYPE.APPLICATION_GATEWAY, row };
    }
    if (includesAny(type, ["bandwidth", "data transfer"])) {
        return { type: exports.AZURE_SERVICE_TYPE.BANDWIDTH, row };
    }
    if (includesAny(type, ["nat gateway"])) {
        return { type: exports.AZURE_SERVICE_TYPE.NAT_GATEWAY, row };
    }
    if (includesAny(type, ["virtual network"])) {
        return { type: exports.AZURE_SERVICE_TYPE.VIRTUAL_NETWORK, row };
    }
    if (includesAny(type, ["backup"])) {
        return { type: exports.AZURE_SERVICE_TYPE.BACKUP, row };
    }
    if (includesAny(type, ["automation"])) {
        return { type: exports.AZURE_SERVICE_TYPE.AUTOMATION, row };
    }
    if (includesAny(type, ["monitor"])) {
        return { type: exports.AZURE_SERVICE_TYPE.MONITORING, row };
    }
    if (includesAny(type, ["logic apps", "logic app"])) {
        return { type: exports.AZURE_SERVICE_TYPE.LOGIC_APPS, row };
    }
    // Category-based fallbacks
    if (cat.includes("network")) {
        return { type: exports.AZURE_SERVICE_TYPE.VIRTUAL_NETWORK, row };
    }
    if (cat.includes("compute")) {
        return { type: exports.AZURE_SERVICE_TYPE.COMPUTE_VM, row };
    }
    if (cat.includes("storage")) {
        return { type: exports.AZURE_SERVICE_TYPE.STORAGE_DISK, row };
    }
    return { type: exports.AZURE_SERVICE_TYPE.OTHER, row };
};
exports.classifyAzureEstimateRow = classifyAzureEstimateRow;
