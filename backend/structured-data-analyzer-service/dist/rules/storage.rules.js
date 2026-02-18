"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageScore = exports.STORAGE_KEYWORDS = void 0;
const keyword_matcher_1 = require("../utils/keyword-matcher");
exports.STORAGE_KEYWORDS = [
    "disk",
    "ssd",
    "storage",
    "volume",
    "iops",
    "hdd",
    "throughput"
];
const storageScore = (searchText) => (0, keyword_matcher_1.scoreByKeywords)(searchText, exports.STORAGE_KEYWORDS);
exports.storageScore = storageScore;
