"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeScore = exports.COMPUTE_KEYWORDS = void 0;
const keyword_matcher_1 = require("../utils/keyword-matcher");
exports.COMPUTE_KEYWORDS = [
    "cpu",
    "vcpu",
    "core",
    "ram",
    "memory",
    "vm",
    "instance",
    "server",
    "gpu"
];
const computeScore = (searchText) => (0, keyword_matcher_1.scoreByKeywords)(searchText, exports.COMPUTE_KEYWORDS);
exports.computeScore = computeScore;
