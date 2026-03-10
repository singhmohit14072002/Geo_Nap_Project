"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPricingService = void 0;
const http_error_util_1 = require("../utils/http-error.util");
const aws_pricing_service_1 = require("./aws-pricing.service");
const azure_pricing_service_1 = require("./azure-pricing.service");
const gcp_pricing_service_1 = require("./gcp-pricing.service");
const getPricingService = (provider) => {
    switch (provider) {
        case "azure":
            return new azure_pricing_service_1.AzurePricingService();
        case "aws":
            return new aws_pricing_service_1.AwsPricingService();
        case "gcp":
            return new gcp_pricing_service_1.GcpPricingService();
        default:
            throw new http_error_util_1.HttpError(400, `Invalid cloud provider: ${provider}`);
    }
};
exports.getPricingService = getPricingService;
