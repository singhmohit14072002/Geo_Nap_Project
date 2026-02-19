"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const decision_controller_1 = require("../controllers/decision.controller");
const router = (0, express_1.Router)();
router.post("/recommend", decision_controller_1.recommendProviderController);
exports.default = router;
