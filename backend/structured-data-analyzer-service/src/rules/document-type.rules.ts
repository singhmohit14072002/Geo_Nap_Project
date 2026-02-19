import { toSearchText } from "../utils/keyword-matcher";

export type DocumentType = "CLOUD_ESTIMATE" | "REQUIREMENT";

interface SignalRule {
  name: string;
  pattern: RegExp;
  weight: number;
}

export interface DocumentTypeDetectionResult {
  documentType: DocumentType;
  score: number;
  matchedSignals: string[];
}

const SIGNAL_RULES: SignalRule[] = [
  {
    name: "azure_vm_sku_pattern",
    pattern: /\b(?:f|d|e|n|g|p)\d{1,3}[a-z0-9]*(?:\s*v\d+)?\b/i,
    weight: 2
  },
  {
    name: "azure_disk_sku_pattern",
    pattern: /\bp(?:10|15|20|30|40|50|60|70|80)\b/i,
    weight: 2
  },
  {
    name: "application_gateway",
    pattern: /\bapplication\s+gateway\b/i,
    weight: 2
  },
  {
    name: "managed_disks",
    pattern: /\bmanaged\s+disks?\b/i,
    weight: 2
  },
  {
    name: "pay_as_you_go",
    pattern: /\bpay\s+as\s+you\s+go\b/i,
    weight: 2
  },
  {
    name: "hours_730",
    pattern: /\bx\s*730\s*hours?\b/i,
    weight: 2
  },
  {
    name: "virtual_machines_service",
    pattern: /\bvirtual\s+machines?\b/i,
    weight: 1
  },
  {
    name: "network_egress_phrase",
    pattern: /\boutbound\s+data\s+transfer\b/i,
    weight: 1
  }
];

const stripNoise = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/[^\w\s:;,.()\-]/g, " ")
    .trim();

export const detectDocumentType = (
  rows: Record<string, unknown>[]
): DocumentTypeDetectionResult => {
  const matchedSignals = new Set<string>();
  let score = 0;

  for (const row of rows) {
    const rowText = stripNoise(toSearchText(row));
    if (!rowText) {
      continue;
    }
    for (const rule of SIGNAL_RULES) {
      if (!matchedSignals.has(rule.name) && rule.pattern.test(rowText)) {
        matchedSignals.add(rule.name);
        score += rule.weight;
      }
    }
  }

  const strongPairsDetected =
    (matchedSignals.has("pay_as_you_go") && matchedSignals.has("hours_730")) ||
    (matchedSignals.has("azure_vm_sku_pattern") &&
      matchedSignals.has("azure_disk_sku_pattern")) ||
    (matchedSignals.has("application_gateway") &&
      matchedSignals.has("managed_disks"));

  const documentType: DocumentType =
    strongPairsDetected || score >= 4 ? "CLOUD_ESTIMATE" : "REQUIREMENT";

  return {
    documentType,
    score,
    matchedSignals: [...matchedSignals]
  };
};
