"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGcpRegionCity = exports.normalizeGcpRegion = void 0;
const GCP_REGION_MAP = {
    "asia-south1": {
        code: "asia-south1",
        city: "Mumbai",
        aliases: ["mumbai", "asia south1", "asia-south-1"]
    },
    "asia-south2": {
        code: "asia-south2",
        city: "Delhi",
        aliases: ["delhi", "asia south2", "asia-south-2"]
    }
};
const normalizeGcpRegion = (rawRegion) => {
    const normalized = rawRegion.trim().toLowerCase();
    if (GCP_REGION_MAP[normalized]) {
        return GCP_REGION_MAP[normalized].code;
    }
    for (const meta of Object.values(GCP_REGION_MAP)) {
        if (meta.aliases.includes(normalized)) {
            return meta.code;
        }
    }
    return normalized;
};
exports.normalizeGcpRegion = normalizeGcpRegion;
const getGcpRegionCity = (region) => {
    const normalized = (0, exports.normalizeGcpRegion)(region);
    return GCP_REGION_MAP[normalized]?.city ?? null;
};
exports.getGcpRegionCity = getGcpRegionCity;
