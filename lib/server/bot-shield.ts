/**
 * Edge-compatible Bot Shield & burst flood protection.
 * Uses pure Web Standard APIs only so it runs in both Cloudflare Workers
 * Edge Middleware and Node.js unit tests with zero external dependencies.
 */

export type RequestCategory = "page" | "api" | "auth";

export type BotShieldInput = {
  pathname: string;
  method: string;
  userAgent: string;
  ip: string;
  nowMs?: number;
};

export type BotShieldDecision =
  | { allowed: true; isKnownBot: boolean; category: RequestCategory }
  | { allowed: false; status: 403 | 429; reason: string; retryAfterSec?: number; category: RequestCategory };

const STATIC_PREFIXES = [
  "/_next/",
  "/models/",
  "/branding/",
  "/home/",
  "/environments/",
  "/decoders/",
  "/assets/",
  "/catalog/",
];

const STATIC_EXT_RE = /\.(?:glb|gltf|webp|png|jpe?g|gif|svg|ico|wasm|js|mjs|css|woff2?|ttf|eot|exr|hdr|mp4|webm|map)$/i;

const PROBE_PATH_RE = /(?:^\/(?:\.env|\.git|\.aws|\.htaccess|\.htpasswd|\.ds_store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|adminer|cgi-bin|actuator|vendor\/phpunit|server-status|boaform|HNAP1|solr|jenkins|hudson)|(?:\.(?:php|phtml|asp|aspx|jsp|jspx|cgi|pl|sql|bak|old|orig|swp|ini|yml|yaml|toml|log))(?:\?|$|\/))/i;

const BLOCKED_BOT_TOKENS = [
  "gptbot",
  "chatgpt-user",
  "oai-searchbot",
  "claudebot",
  "anthropic-ai",
  "claude-web",
  "ccbot",
  "bytespider",
  "amazonbot",
  "petalbot",
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "dotbot",
  "blexbot",
  "dataforseobot",
  "barkrowler",
  "magpie-crawler",
  "scrapy",
  "python-requests",
  "python-urllib",
  "httpx",
  "aiohttp",
  "go-http-client",
  "curl/",
  "wget/",
  "libwww-perl",
  "apache-httpclient",
  "okhttp/",
  "sqlmap",
  "nikto",
  "nmap",
  "masscan",
  "zgrab",
  "nuclei",
  "acunetix",
  "nessus",
  "headlesschrome",
  "puppeteer",
  "playwright",
  "selenium",
  "phantomjs",
];

const ALLOWED_SEARCH_BOT_TOKENS = [
  "googlebot",
  "bingbot",
  "duckduckbot",
  "applebot",
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "linkedinbot",
  "zalo",
  "telegrambot",
  "discordbot",
  "slackbot",
];

const PUBLIC_SEO_PATHS = new Set([
  "/",
  "/about",
  "/contact",
  "/robots.txt",
  "/sitemap.xml",
]);

const WINDOW_MS = 60_000;
const BLOCK_MS = 5 * 60_000;
const GENERAL_LIMIT_PER_MIN = 90;
const SENSITIVE_LIMIT_PER_MIN = 35;
const MAX_TRACKED_KEYS = 5_000;

type RateEntry = {
  windowStart: number;
  count: number;
  blockedUntil: number;
};

const ipRateMap = new Map<string, RateEntry>();

export function resetBotShieldStateForTests() {
  ipRateMap.clear();
}

export function isStaticOrBypassPath(pathname: string): boolean {
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml" || pathname === "/favicon.ico" || pathname === "/icon.svg") {
    return true;
  }
  for (const prefix of STATIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  if (!pathname.startsWith("/api/") && STATIC_EXT_RE.test(pathname)) {
    return true;
  }
  return false;
}

export function classifyRequestCategory(pathname: string): RequestCategory {
  if (
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/account/login") ||
    pathname.startsWith("/api/account/register") ||
    pathname.startsWith("/api/account/password") ||
    pathname.startsWith("/api/account/verification") ||
    pathname.startsWith("/api/admin/auth") ||
    pathname.startsWith("/api/admin/bootstrap")
  ) {
    return "auth";
  }
  if (pathname.startsWith("/api/")) return "api";
  return "page";
}

function isSensitiveBurstPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/account/") ||
    pathname.startsWith("/api/admin/auth") ||
    pathname.startsWith("/api/admin/bootstrap") ||
    pathname.startsWith("/api/payments/orders") ||
    pathname.startsWith("/api/telemetry/")
  );
}

function isPublicSeoPath(pathname: string): boolean {
  return PUBLIC_SEO_PATHS.has(pathname) || pathname.startsWith("/legal/");
}

function evictOverflow(nowMs: number) {
  if (ipRateMap.size < MAX_TRACKED_KEYS) return;
  for (const [key, entry] of ipRateMap) {
    if (entry.blockedUntil <= nowMs && nowMs - entry.windowStart > WINDOW_MS * 2) {
      ipRateMap.delete(key);
    }
    if (ipRateMap.size < MAX_TRACKED_KEYS * 0.75) break;
  }
  if (ipRateMap.size >= MAX_TRACKED_KEYS) {
    const oldest = ipRateMap.keys().next().value;
    if (oldest) ipRateMap.delete(oldest);
  }
}

function checkBurstLimit(ip: string, sensitive: boolean, nowMs: number): { ok: boolean; retryAfterSec?: number } {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return { ok: true };
  const bucketKey = `${sensitive ? "s" : "g"}:${ip}`;
  const limit = sensitive ? SENSITIVE_LIMIT_PER_MIN : GENERAL_LIMIT_PER_MIN;
  const existing = ipRateMap.get(bucketKey);

  if (existing) {
    if (existing.blockedUntil > nowMs) {
      return {
        ok: false,
        retryAfterSec: Math.max(10, Math.ceil((existing.blockedUntil - nowMs) / 1000)),
      };
    }
    if (nowMs - existing.windowStart < WINDOW_MS) {
      existing.count += 1;
      if (existing.count > limit) {
        existing.blockedUntil = nowMs + BLOCK_MS;
        return { ok: false, retryAfterSec: 60 };
      }
      return { ok: true };
    }
    existing.windowStart = nowMs;
    existing.count = 1;
    existing.blockedUntil = 0;
    return { ok: true };
  }

  evictOverflow(nowMs);
  ipRateMap.set(bucketKey, { windowStart: nowMs, count: 1, blockedUntil: 0 });
  return { ok: true };
}

export function evaluateIncomingRequest(input: BotShieldInput): BotShieldDecision {
  const pathname = input.pathname || "/";
  const category = classifyRequestCategory(pathname);

  // Payment webhooks (SePay / Polar.sh) use server HTTP clients — never block them here.
  if (pathname.startsWith("/api/payments/webhook/")) {
    return { allowed: true, isKnownBot: false, category };
  }

  // Static files & SEO manifests bypass bot shield checks.
  if (isStaticOrBypassPath(pathname)) {
    return { allowed: true, isKnownBot: false, category };
  }

  // 1. Block vulnerability scanner / exploit probe paths immediately.
  if (PROBE_PATH_RE.test(pathname)) {
    return { allowed: false, status: 403, reason: "PROBE_PATH_BLOCKED", category };
  }

  const uaLower = (input.userAgent || "").trim().toLowerCase();
  const isAllowedSearchBot = uaLower.length > 0 && ALLOWED_SEARCH_BOT_TOKENS.some((token) => uaLower.includes(token));

  // 2. Allow legitimate search/social bots ONLY on public pages, never on API/admin/studio.
  if (isAllowedSearchBot) {
    if (isPublicSeoPath(pathname) && (input.method === "GET" || input.method === "HEAD")) {
      return { allowed: true, isKnownBot: true, category };
    }
    return { allowed: false, status: 403, reason: "BOT_RESTRICTED_ROUTE", category };
  }

  // 3. Block empty User-Agent on API, Studio, and Admin routes.
  if (!uaLower && (pathname.startsWith("/api/") || pathname.startsWith("/studio") || pathname.startsWith("/admin"))) {
    return { allowed: false, status: 403, reason: "EMPTY_USER_AGENT", category };
  }

  // 4. Block known AI crawlers, SEO scrapers, headless browsers, and exploit tools.
  if (uaLower && BLOCKED_BOT_TOKENS.some((token) => uaLower.includes(token))) {
    return { allowed: false, status: 403, reason: "BOT_USER_AGENT_BLOCKED", category };
  }

  // 5. Per-IP burst flood limiter in isolate memory.
  const nowMs = input.nowMs ?? Date.now();
  const sensitive = isSensitiveBurstPath(pathname);
  const burst = checkBurstLimit(input.ip, sensitive, nowMs);
  if (!burst.ok) {
    return {
      allowed: false,
      status: 429,
      reason: sensitive ? "SENSITIVE_RATE_LIMIT" : "BURST_RATE_LIMIT",
      retryAfterSec: burst.retryAfterSec ?? 60,
      category,
    };
  }

  return { allowed: true, isKnownBot: false, category };
}
