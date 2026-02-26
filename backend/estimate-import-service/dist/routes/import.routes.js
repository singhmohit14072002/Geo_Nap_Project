"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const import_controller_1 = require("../controllers/import.controller");
const router = (0, express_1.Router)();
router.post("/import", import_controller_1.importEstimateController);
exports.default = router;
