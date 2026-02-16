"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExtractionPrompt = void 0;
const buildExtractionPrompt = (rawText) => {
    return [
        "Extract infrastructure requirements from the provided document text.",
        "Return ONLY valid JSON. No markdown, no explanations, no extra keys.",
        "Output schema:",
        "{",
        '  "compute": [',
        "    {",
        '      "vCPU": number,',
        '      "ramGB": number,',
        '      "storageGB": number,',
        '      "storageType": "ssd" | "hdd" | "standard" | null,',
        '      "osType": "linux" | "windows",',
        '      "quantity": number',
        "    }",
        "  ],",
        '  "database": {',
        '    "engine": "postgres" | "mysql" | "mssql" | "none",',
        '    "storageGB": number,',
        '    "ha": boolean',
        "  },",
        '  "network": {',
        '    "dataEgressGB": number',
        "  },",
        '  "region": string',
        "}",
        "Rules:",
        "1) Do not estimate costs.",
        "2) Do not invent unavailable values; if unclear, keep the field null or omit it.",
        "3) Use integer values for vCPU, quantity.",
        "4) Use GB units for RAM, storage, and egress.",
        "5) If storage type is not explicit, return null for storageType.",
        "Document text follows:",
        rawText
    ].join("\n");
};
exports.buildExtractionPrompt = buildExtractionPrompt;
