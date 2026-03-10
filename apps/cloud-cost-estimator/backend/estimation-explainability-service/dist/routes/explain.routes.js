"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const explain_controller_1 = require("../controllers/explain.controller");
const router = (0, express_1.Router)();
router.post("/explain", explain_controller_1.explainController);
exports.default = router;
