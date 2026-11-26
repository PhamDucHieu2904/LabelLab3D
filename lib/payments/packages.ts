export type CoinRegion = "vietnam" | "international";
export type CoinPackageBadge = "popular" | "best";

export type CoinPackage = {
  id: string;
  region?: CoinRegion;
  tier?: string;
  coins: number;
  baseCoins?: number;
  bonusPct?: number;
  badge?: CoinPackageBadge;
  vnd: number;
  usd: number;
};

/**
 * Coin scale: 10 coins = 1 standard 2048 px studio render
 * (~600 VND at Vietnam base, ~$0.08 USD at International base).
 */
export const DEFAULT_RENDER_COIN_COST = 10;
export const DEFAULT_DIELINE_COIN_COST = 20;
export const DEFAULT_SHARE_COIN_COST = 20;
export const DEFAULT_PROJECT_EXTEND_COIN_COST = 10;
export const WELCOME_BONUS_COINS = 20;

export const RENDER_COST_MULTIPLIERS = {
  1024: 0.5,
  2048: 1,
  4096: 2,
  8129: 4,
} as const;

export type SupportedRenderResolution = keyof typeof RENDER_COST_MULTIPLIERS;

export function isSupportedRenderResolution(resolution: number): resolution is SupportedRenderResolution {
  return Object.hasOwn(RENDER_COST_MULTIPLIERS, resolution);
}

/**
 * Compute render coin cost for a given output resolution from the live 2048 px
 * base cost (default 10 coins -> 5 / 10 / 20 / 40 across 1K / 2K / 4K / 8K).
 */
export function resolveRenderCoinCost(
  resolution: number,
  base2kCost: number = DEFAULT_RENDER_COIN_COST,
): number {
  const safeBase = Number.isFinite(base2kCost) ? Math.max(0, Math.floor(base2kCost)) : DEFAULT_RENDER_COIN_COST;
  if (safeBase === 0) return 0;
  const multiplier = isSupportedRenderResolution(resolution) ? RENDER_COST_MULTIPLIERS[resolution] : 1;
  return Math.max(1, Math.round(safeBase * multiplier));
}

// Regional coin catalog shared by display and server. Vietnam (SePay VietQR, VND)
// and International (Polar.sh, USD) each keep clean local price points with exact
// 0% / +5% / +10% / +20% bonus tiers.
export const COIN_PACKAGES: readonly CoinPackage[] = [
  // Vietnam (SePay VietQR · VND)
  { id: "vn-starter", region: "vietnam", tier: "Starter", coins: 330, baseCoins: 330, bonusPct: 0, vnd: 20_000, usd: 0 },
  { id: "vn-basic", region: "vietnam", tier: "Basic", coins: 870, baseCoins: 830, bonusPct: 5, vnd: 50_000, usd: 0 },
  { id: "vn-pro", region: "vietnam", tier: "Pro", coins: 1_850, baseCoins: 1_660, bonusPct: 10, badge: "popular", vnd: 100_000, usd: 0 },
  { id: "vn-studio", region: "vietnam", tier: "Studio", coins: 4_000, baseCoins: 3_330, bonusPct: 20, badge: "best", vnd: 200_000, usd: 0 },
  // International (Polar.sh · USD)
  { id: "intl-starter", region: "international", tier: "Starter", coins: 620, baseCoins: 620, bonusPct: 0, vnd: 0, usd: 5 },
  { id: "intl-basic", region: "international", tier: "Basic", coins: 1_310, baseCoins: 1_250, bonusPct: 5, vnd: 0, usd: 10 },
  { id: "intl-pro", region: "international", tier: "Pro", coins: 2_750, baseCoins: 2_500, bonusPct: 10, badge: "popular", vnd: 0, usd: 20 },
  { id: "intl-studio", region: "international", tier: "Studio", coins: 4_500, baseCoins: 3_750, bonusPct: 20, badge: "best", vnd: 0, usd: 30 },
] as const;

export function getCoinPackagesByRegion<T extends Pick<CoinPackage, "region">>(
  packages: readonly T[],
  region: CoinRegion,
): T[] {
  const regional = packages.filter((pkg) => !pkg.region || pkg.region === region);
  return regional.length > 0 ? regional : [...packages];
}

export function findCoinPackage(coins: number, region?: CoinRegion): CoinPackage | null {
  return COIN_PACKAGES.find(
    (item) => item.coins === coins && (!region || !item.region || item.region === region),
  ) ?? null;
}
