interface GcpRegionMeta {
  code: string;
  city: string;
  aliases: string[];
}

const GCP_REGION_MAP: Record<string, GcpRegionMeta> = {
  "asia-south1": {
    code: "asia-south1",
    city: "Mumbai",
    aliases: ["mumbai", "asia south1", "asia-south-1"]
  },
  "asia-south2": {
    code: "asia-south2",
    city: "Delhi",
    aliases: ["delhi", "asia south2", "asia-south-2"]
  }
};

export const normalizeGcpRegion = (rawRegion: string): string => {
  const normalized = rawRegion.trim().toLowerCase();
  if (GCP_REGION_MAP[normalized]) {
    return GCP_REGION_MAP[normalized].code;
  }

  for (const meta of Object.values(GCP_REGION_MAP)) {
    if (meta.aliases.includes(normalized)) {
      return meta.code;
    }
  }

  return normalized;
};

export const getGcpRegionCity = (region: string): string | null => {
  const normalized = normalizeGcpRegion(region);
  return GCP_REGION_MAP[normalized]?.city ?? null;
};

