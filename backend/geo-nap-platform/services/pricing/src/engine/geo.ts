import { RegionCoordinate } from "@geo-nap/common";

const EARTH_RADIUS_KM = 6371;

export function parseDataLocation(value: string): { provider: string; region: string } {
  const normalized = value.trim().toLowerCase();
  const firstDash = normalized.indexOf("-");
  if (firstDash <= 0) {
    throw new Error("Invalid data_location format");
  }
  return {
    provider: normalized.slice(0, firstDash),
    region: normalized.slice(firstDash + 1)
  };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceKm(from: RegionCoordinate, to: RegionCoordinate): number {
  const lat1 = toRadians(from.latitude);
  const lon1 = toRadians(from.longitude);
  const lat2 = toRadians(to.latitude);
  const lon2 = toRadians(to.longitude);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function findCoordinate(coords: RegionCoordinate[], provider: string, region: string): RegionCoordinate | null {
  return coords.find((c) => c.provider === provider && c.region.toLowerCase() === region.toLowerCase()) ?? null;
}
