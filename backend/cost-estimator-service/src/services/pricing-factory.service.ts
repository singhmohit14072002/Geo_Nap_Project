import { CloudProvider } from "../domain/cost.model";
import { HttpError } from "../utils/http-error.util";
import { AwsPricingService } from "./aws-pricing.service";
import { AzurePricingService } from "./azure-pricing.service";
import { GcpPricingService } from "./gcp-pricing.service";
import { CloudPricingService } from "./pricing.types";

export const getPricingService = (
  provider: CloudProvider
): CloudPricingService => {
  switch (provider) {
    case "azure":
      return new AzurePricingService();
    case "aws":
      return new AwsPricingService();
    case "gcp":
      return new GcpPricingService();
    default:
      throw new HttpError(400, `Invalid cloud provider: ${provider}`);
  }
};

