import { XMLParser } from "fast-xml-parser";
import type { ParserOutput } from "../services/parser.service";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true
});

const toArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
};

const maybeNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const maybeString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
};

const collectServerNodes = (node: unknown, output: Record<string, unknown>[]): void => {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectServerNodes(item, output));
    return;
  }

  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    const lower = key.toLowerCase();
    if (lower === "server" || lower === "servers") {
      toArray(value).forEach((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          output.push(item as Record<string, unknown>);
        }
      });
    }
    collectServerNodes(value, output);
  }
};

const normalizeServer = (server: Record<string, unknown>): Record<string, unknown> => {
  return {
    cpu: maybeNumber(server.cpu ?? server.vcpu ?? server.vCPU ?? server.cores),
    ram: maybeNumber(server.ram ?? server.memory ?? server.ramGB ?? server.memGB),
    storage: maybeNumber(server.storage ?? server.storageGB ?? server.disk ?? server.diskGB),
    os: maybeString(server.os ?? server.osType ?? server.platform),
    quantity: maybeNumber(server.quantity ?? server.count ?? server.instances) ?? 1
  };
};

export const parseXmlFile = async (
  file: Express.Multer.File
): Promise<ParserOutput> => {
  const xmlText = file.buffer.toString("utf8").trim();
  if (!xmlText) {
    throw Object.assign(new Error("XML file is empty"), {
      statusCode: 422
    });
  }

  let parsedXml: unknown;
  try {
    parsedXml = xmlParser.parse(xmlText);
  } catch (error) {
    throw Object.assign(new Error("Failed to parse XML"), {
      statusCode: 422,
      cause: error
    });
  }

  const serverNodes: Record<string, unknown>[] = [];
  collectServerNodes(parsedXml, serverNodes);
  const servers = serverNodes.map(normalizeServer);

  return {
    rawInfrastructureData: {
      servers,
      parsedXml
    },
    sourceType: "xml",
    parsingConfidence: 0.95
  };
};
