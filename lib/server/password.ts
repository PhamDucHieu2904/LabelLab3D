import { base64Url, base64UrlBytes, constantTimeEqual } from "./db";

const ITERATIONS = 310_000;
const encoder = new TextEncoder();

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 256) throw new Error("Password must be 12-256 characters");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${base64Url(salt)}$${base64Url(hash)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, iterationText, saltText, digestText] = encoded.split("$");
  const iterations = Number(iterationText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isSafeInteger(iterations) || iterations < 100_000 || !saltText || !digestText) return false;
  const actual = base64Url(await derive(password, base64UrlBytes(saltText), iterations));
  return constantTimeEqual(actual, digestText);
}
