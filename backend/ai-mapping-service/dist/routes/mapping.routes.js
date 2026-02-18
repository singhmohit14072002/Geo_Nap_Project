"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mapping_controller_1 = require("../controllers/mapping.controller");
const router = (0, express_1.Router)();
router.post("/map", mapping_controller_1.mappingController);
exports.default = router;
