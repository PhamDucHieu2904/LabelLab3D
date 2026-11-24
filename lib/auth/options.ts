import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getGoogleAuthConfig, isVerifiedGoogleProfile, sameOriginRedirect } from "./google-config";

type AuthEnvMap = Record<string, string | undefined>;
type GoogleProfilePayload = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export function createAuthOptions(
  envMap: AuthEnvMap = process.env,
  onVerifiedGoogleSignIn?: (profile: GoogleProfilePayload) => Promise<void>,
): NextAuthOptions {
  const config = getGoogleAuthConfig(envMap);
  return {
    secret: config?.secret,
    providers: config ? [GoogleProvider({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
      checks: ["pkce", "state"],
    })] : [],
    // NextAuth verifies Google's response and keeps the session in an encrypted,
    // HttpOnly cookie. Provider access/refresh tokens are never exposed to the UI.
    session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
    pages: { signIn: "/", error: "/" },
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== "google" || !isVerifiedGoogleProfile(profile)) return false;
        if (onVerifiedGoogleSignIn) {
          const verified = profile as GoogleProfilePayload;
          try {
            await onVerifiedGoogleSignIn({
              sub: verified.sub,
              email: verified.email,
              name: verified.name,
              picture: verified.picture,
            });
          } catch {
            return false;
          }
        }
        return true;
      },
      redirect({ url, baseUrl }) {
        return sameOriginRedirect(url, baseUrl);
      },
    },
  };
}

export const googleAuthConfig = getGoogleAuthConfig();
export const authOptions: NextAuthOptions = createAuthOptions();
