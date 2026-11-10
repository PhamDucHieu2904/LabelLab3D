import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getGoogleAuthConfig, isVerifiedGoogleProfile, sameOriginRedirect } from "./google-config";

export const googleAuthConfig = getGoogleAuthConfig();

export const authOptions: NextAuthOptions = {
  secret: googleAuthConfig?.secret,
  providers: googleAuthConfig ? [GoogleProvider({
    clientId: googleAuthConfig.clientId,
    clientSecret: googleAuthConfig.clientSecret,
    authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
    checks: ["pkce", "state"],
  })] : [],
  // NextAuth verifies Google's response and keeps the session in an encrypted,
  // HttpOnly cookie. Provider access/refresh tokens are never exposed to the UI.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/", error: "/" },
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider === "google" && isVerifiedGoogleProfile(profile);
    },
    redirect({ url, baseUrl }) {
      return sameOriginRedirect(url, baseUrl);
    },
  },
};
