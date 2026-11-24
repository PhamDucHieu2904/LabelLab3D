export type CoinPackage = { coins: number; vnd: number; usd: number };

// This catalog is shared by the display and the server. The server still
// validates the selected package against this list before creating an order.
export const COIN_PACKAGES: readonly CoinPackage[] = [
  { coins: 20, vnd: 10_000, usd: 1 },
  { coins: 45, vnd: 20_000, usd: 2 },
  { coins: 120, vnd: 50_000, usd: 5 },
  { coins: 300, vnd: 100_000, usd: 10 },
] as const;

export function findCoinPackage(coins: number) {
  return COIN_PACKAGES.find((item) => item.coins === coins) ?? null;
}
