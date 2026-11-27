export const TOPUP_MULTIPLIER_MIN = 2;
export const TOPUP_MULTIPLIER_MAX = 5;

export type TopupMultiplierConfig = {
  enabled: boolean;
  multiplier: number;
  label: string;
  updatedAt: string | null;
};

export const DEFAULT_TOPUP_MULTIPLIER: TopupMultiplierConfig = {
  enabled: false,
  multiplier: 2,
  label: "",
  updatedAt: null,
};

export function sanitizeTopupMultiplier(input: unknown): TopupMultiplierConfig {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_TOPUP_MULTIPLIER };
  }
  const raw = input as Record<string, unknown>;
  const enabled = raw.enabled === true;
  const rawMultiplier = Number(raw.multiplier);
  const multiplier =
    Number.isSafeInteger(rawMultiplier) &&
    rawMultiplier >= TOPUP_MULTIPLIER_MIN &&
    rawMultiplier <= TOPUP_MULTIPLIER_MAX
      ? rawMultiplier
      : DEFAULT_TOPUP_MULTIPLIER.multiplier;
  const label =
    typeof raw.label === "string"
      ? raw.label.replace(/\s+/g, " ").trim().slice(0, 120)
      : "";
  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim()
      ? raw.updatedAt.trim().slice(0, 64)
      : null;

  return { enabled, multiplier, label, updatedAt };
}

export function resolveTopupCoins(
  baseCoins: number,
  promo: Pick<TopupMultiplierConfig, "enabled" | "multiplier"> | null | undefined,
): {
  baseCoins: number;
  coins: number;
  multiplier: number;
  bonusApplied: boolean;
} {
  const safeBase = Number.isSafeInteger(baseCoins) && baseCoins > 0 ? baseCoins : 0;
  const activeMultiplier =
    promo?.enabled &&
    Number.isSafeInteger(promo.multiplier) &&
    promo.multiplier >= TOPUP_MULTIPLIER_MIN &&
    promo.multiplier <= TOPUP_MULTIPLIER_MAX
      ? promo.multiplier
      : 1;
  return {
    baseCoins: safeBase,
    coins: safeBase * activeMultiplier,
    multiplier: activeMultiplier,
    bonusApplied: activeMultiplier > 1 && safeBase > 0,
  };
}
