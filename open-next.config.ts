import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Use the adapter's dummy cache until a production cache backend is provisioned.
// This keeps the first Cloudflare deployment self-contained and avoids silently
// creating an R2 bucket from CI.
export default defineCloudflareConfig();
