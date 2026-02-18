"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analyzer_controller_1 = require("../controllers/analyzer.controller");
const router = (0, express_1.Router)();
router.post("/analyze", analyzer_controller_1.analyzeController);
exports.default = router;
