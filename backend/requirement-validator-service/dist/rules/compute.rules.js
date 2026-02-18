"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCompute = void 0;
const toNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const normalized = value.trim();
        if (!normalized) {
            return null;
        }
        const parsed = Number(normalized);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
};
const issue = (code, path, message, question) => ({
    code,
    path,
    message,
    question
});
const validateCompute = (requirement) => {
    const issues = [];
    const normalized = [];
    const items = requirement.compute ?? [];
    if (items.length === 0) {
        issues.push(issue("COMPUTE_MISSING", "compute", "At least one compute workload is required.", "Please provide at least one compute workload configuration."));
        return {
            normalized: null,
            issues
        };
    }
    items.forEach((item, index) => {
        const path = `compute[${index}]`;
        const vCPU = toNumber(item.vCPU);
        const ramGB = toNumber(item.ramGB);
        const storageGB = toNumber(item.storageGB);
        const quantityRaw = toNumber(item.quantity);
        const quantity = quantityRaw == null ? 1 : quantityRaw;
        const osType = item.osType ?? null;
        if (vCPU == null || vCPU <= 0) {
            issues.push(issue("COMPUTE_VCPU_INVALID", `${path}.vCPU`, "vCPU is missing or invalid.", `What is the vCPU value for workload ${index + 1}?`));
        }
        if (ramGB == null || ramGB <= 0) {
            issues.push(issue("COMPUTE_RAM_INVALID", `${path}.ramGB`, "ramGB is missing or invalid.", `What is the RAM (GB) for workload ${index + 1}?`));
        }
        if (storageGB == null || storageGB <= 0) {
            issues.push(issue("COMPUTE_STORAGE_INVALID", `${path}.storageGB`, "storageGB is missing or must be greater than 0.", `What is the storage size (GB) for workload ${index + 1}?`));
        }
        if (quantity <= 0 || !Number.isFinite(quantity)) {
            issues.push(issue("COMPUTE_QUANTITY_INVALID", `${path}.quantity`, "quantity must be greater than 0.", `How many instances are required for workload ${index + 1}?`));
        }
        if (osType !== "linux" && osType !== "windows") {
            issues.push(issue("COMPUTE_OS_INVALID", `${path}.osType`, "osType is missing or invalid.", `Which OS should be used for workload ${index + 1} (linux or windows)?`));
        }
        if (vCPU != null && ramGB != null) {
            const isUnrealistic = (vCPU <= 2 && ramGB >= 128) ||
                (vCPU > 0 && ramGB / vCPU >= 32);
            if (isUnrealistic) {
                issues.push(issue("COMPUTE_UNREALISTIC", path, "Compute configuration appears unrealistic.", `Workload ${index + 1} looks unrealistic (vCPU ${vCPU}, RAM ${ramGB}GB). Please confirm correct values.`));
            }
        }
        if (vCPU != null &&
            vCPU > 0 &&
            ramGB != null &&
            ramGB > 0 &&
            storageGB != null &&
            storageGB > 0 &&
            quantity > 0 &&
            Number.isInteger(quantity) &&
            (osType === "linux" || osType === "windows")) {
            normalized.push({
                vCPU: Math.trunc(vCPU),
                ramGB,
                storageGB,
                osType,
                quantity: Math.trunc(quantity)
            });
        }
    });
    if (issues.length > 0) {
        return {
            normalized: null,
            issues
        };
    }
    return {
        normalized,
        issues: []
    };
};
exports.validateCompute = validateCompute;
