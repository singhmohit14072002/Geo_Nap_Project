"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.networkScore = exports.NETWORK_KEYWORDS = void 0;
const keyword_matcher_1 = require("../utils/keyword-matcher");
exports.NETWORK_KEYWORDS = [
    "bandwidth",
    "egress",
    "transfer",
    "network",
    "throughput",
    "outbound",
    "ingress"
];
const networkScore = (searchText) => (0, keyword_matcher_1.scoreByKeywords)(searchText, exports.NETWORK_KEYWORDS);
exports.networkScore = networkScore;
