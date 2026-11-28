const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  ...(!isDev ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://static.cloudflareinsights.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://qr.sepay.vn https://lh3.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' data: blob: https://cloudflareinsights.com https://api.polar.sh https://sandbox-api.polar.sh https://checkout.polar.sh https://sandbox-checkout.polar.sh https://buy.polar.sh",
      "frame-src 'self' https://checkout.polar.sh https://sandbox-checkout.polar.sh https://buy.polar.sh https://pay.sepay.vn https://pay-sandbox.sepay.vn",
      "form-action 'self' https://pay.sepay.vn https://pay-sandbox.sepay.vn https://accounts.google.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const config = {
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default config;
