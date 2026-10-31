"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./CoinPricing.module.css";

// Display quotes only. Checkout and server-side pricing will be connected later.
const packages = [
  { coins: 20, vnd: 10_000, usd: 1 },
  { coins: 45, vnd: 20_000, usd: 2 },
  { coins: 120, vnd: 50_000, usd: 5 },
  { coins: 300, vnd: 100_000, usd: 10 },
] as const;

const regions = [
  { id: "vietnam", label: "Vietnam", currency: "VND", locale: "vi-VN" },
  { id: "international", label: "International", currency: "USD", locale: "en-US" },
] as const;

export default function CoinPricing() {
  const [regionId, setRegionId] = useState<typeof regions[number]["id"]>("vietnam");
  const [selectedCoins, setSelectedCoins] = useState<number>(20);
  const region = regions.find((item) => item.id === regionId)!;
  const prices = new Intl.NumberFormat(region.locale, {
    style: "currency",
    currency: region.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <article className={`home-card ${styles.card}`} aria-labelledby="coin-pricing-title">
      <div className={styles.headingRow}>
        <div className={styles.titleBlock}>
          <h2 id="coin-pricing-title">Coin packages</h2>
          <p>Choose your region to view local prices.</p>
        </div>
        <Image className={styles.coinArt} src="/branding/LLCoin.svg" alt="" width={56} height={56} />
      </div>

      <div className={styles.markets} role="group" aria-label="Pricing region">
        {regions.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={regionId === item.id}
            onClick={() => setRegionId(item.id)}
          >
            <span className={styles.marketLabel}>{item.label}</span>
            <small className={styles.marketCurrency}>{item.currency}</small>
          </button>
        ))}
      </div>

      <div className={styles.packs} role="group" aria-label={`${region.label} coin packages`}>
        {packages.map((item) => {
          const price = prices.format(regionId === "vietnam" ? item.vnd : item.usd);
          return (
            <button
              key={item.coins}
              className={styles.pack}
              type="button"
              aria-pressed={selectedCoins === item.coins}
              aria-label={`${item.coins} coins, ${price}`}
              onClick={() => setSelectedCoins(item.coins)}
            >
              <span className={styles.coinRow}>
                <Image src="/branding/LLCoin.svg" alt="" width={20} height={20} />
                <strong>{item.coins}</strong>
                <span>coins</span>
              </span>
              <strong className={styles.price}>{price}</strong>
            </button>
          );
        })}
      </div>
    </article>
  );
}
