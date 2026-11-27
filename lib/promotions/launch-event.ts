export const LAUNCH_PROMO_ID = "launch-2026-11";
export const LAUNCH_PROMO_ANNOUNCEMENT_ID = "promo-launch-2026";
export const LAUNCH_PROMO_COINS = 100;

/** 2026-11-27 00:00:00.000 Asia/Ho_Chi_Minh (UTC+7) */
export const LAUNCH_PROMO_START_ISO = "2026-11-26T17:00:00.000Z";
/** 2026-12-04 23:59:59.999 Asia/Ho_Chi_Minh (UTC+7) */
export const LAUNCH_PROMO_END_ISO = "2026-12-04T16:59:59.999Z";

export const LAUNCH_PROMO_START_DATE = "2026-11-27";
export const LAUNCH_PROMO_END_DATE = "2026-12-04";
export const LAUNCH_PROMO_MAX_CLAIMS_PER_IP = 3;

export type LaunchPromoReason =
  | "ELIGIBLE"
  | "LOGIN_REQUIRED"
  | "ALREADY_CLAIMED"
  | "ALREADY_CLAIMED_EMAIL"
  | "NOT_ELIGIBLE_REGISTRATION_DATE"
  | "EMAIL_NOT_VERIFIED"
  | "PROMO_NOT_STARTED"
  | "PROMO_EXPIRED"
  | "ACCOUNT_INACTIVE";

export type LaunchPromoStatusResponse = {
  promoId: string;
  coins: number;
  startsAt: string;
  endsAt: string;
  windowState: "upcoming" | "active" | "ended";
  authenticated: boolean;
  eligible: boolean;
  claimed: boolean;
  claimedAt: string | null;
  reason: LaunchPromoReason;
};
