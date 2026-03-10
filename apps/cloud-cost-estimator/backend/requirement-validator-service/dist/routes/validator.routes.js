"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validator_controller_1 = require("../controllers/validator.controller");
const router = (0, express_1.Router)();
router.post("/validate", validator_controller_1.validateRequirementController);
exports.default = router;
