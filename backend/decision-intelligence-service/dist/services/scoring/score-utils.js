"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDirect = exports.normalizeInverse = exports.round3 = exports.clamp01 = void 0;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
exports.clamp01 = clamp01;
const round3 = (value) => Number(value.toFixed(3));
exports.round3 = round3;
const normalizeInverse = (value, min, max) => {
    if (max <= min) {
        return 1;
    }
    return (0, exports.clamp01)((max - value) / (max - min));
};
exports.normalizeInverse = normalizeInverse;
const normalizeDirect = (value, min, max) => {
    if (max <= min) {
        return 1;
    }
    return (0, exports.clamp01)((value - min) / (max - min));
};
exports.normalizeDirect = normalizeDirect;
