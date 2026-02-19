export const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, value));

export const round3 = (value: number): number =>
  Number(value.toFixed(3));

export const normalizeInverse = (value: number, min: number, max: number): number => {
  if (max <= min) {
    return 1;
  }
  return clamp01((max - value) / (max - min));
};

export const normalizeDirect = (value: number, min: number, max: number): number => {
  if (max <= min) {
    return 1;
  }
  return clamp01((value - min) / (max - min));
};

