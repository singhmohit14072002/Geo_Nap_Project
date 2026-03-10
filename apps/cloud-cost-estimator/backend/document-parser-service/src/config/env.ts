import dotenv from "dotenv";

dotenv.config();

const requireEnv = (name: "AZURE_DOC_ENDPOINT" | "AZURE_DOC_KEY"): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const validateEndpoint = (endpoint: string): string => {
  try {
    const parsed = new URL(endpoint);
    if (!parsed.protocol.startsWith("http")) {
      throw new Error("Endpoint must start with http/https");
    }
    return endpoint;
  } catch {
    throw new Error("AZURE_DOC_ENDPOINT must be a valid URL");
  }
};

const portRaw = process.env.PORT?.trim() ?? "4020";
const portNumber = Number(portRaw);
if (!Number.isFinite(portNumber) || portNumber <= 0) {
  throw new Error("PORT must be a positive number");
}

export const env = {
  port: portNumber,
  nodeEnv: process.env.NODE_ENV ?? "development",
  azureDocEndpoint: validateEndpoint(requireEnv("AZURE_DOC_ENDPOINT")),
  azureDocKey: requireEnv("AZURE_DOC_KEY")
};
