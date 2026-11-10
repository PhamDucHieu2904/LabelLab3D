# Google sign-in

Google is an optional sign-in method on both Login and Create account. Email/password forms and password reset remain in place; those existing forms still require an email account service before they can authenticate users.

## Configuration

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the OAuth consent screen and create an OAuth client of type **Web application**. During Google testing, add the intended Google accounts as test users.
2. Add this exact authorized redirect URI for local development:

   ```text
   http://127.0.0.1:3005/api/auth/callback/google
   ```

   If opening the app at `localhost` instead, use `http://localhost:3005` consistently in both `NEXTAUTH_URL` and the redirect URI. Google treats these as separate origins.

3. Copy `.env.example` to `.env.local`. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL` and a random `NEXTAUTH_SECRET`. Generate the session secret locally with:

   ```powershell
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Keep the actual values in `.env.local` or the host's secret manager. Do not put secrets into `NEXT_PUBLIC_*` variables, commit them, or paste them into chat.

4. Restart the Next.js server. For production, use the real HTTPS origin as `NEXTAUTH_URL` and add `https://YOUR_DOMAIN/api/auth/callback/google` to Google's authorized redirect URIs. Put the consent screen into the appropriate published state for public users.

## Behavior and boundaries

NextAuth 4.24.15 handles Google OpenID Connect, state, PKCE, CSRF and encrypted HttpOnly session cookies. Google profiles must have a verified email and a nonempty provider subject. Google supplies the name, email and profile picture; no extra registration form or Labellab password is required. Only `openid email profile` scopes are requested.

The same encrypted session works across Home and Studio, expires after seven days and is removed on Log out. The UI receives the public profile, never Google's access/refresh tokens or the session secret. Header and Home profile use the Google identity. Existing sample coin balance, days logged in and recent usage are not assigned to a signed-in Google user; those still need real account/ledger services. Projects and artwork keep their existing local persistence behavior.

Without a complete valid configuration, `/api/auth/providers` returns an empty provider list and `/api/auth/session` returns an empty session. Other auth requests return 503; clicking Google shows an unavailable message. No fallback identity or token is fabricated. Canceled or rejected OAuth returns to the Login dialog with a retry message; raw provider errors are not rendered.

There is no database adapter yet. The session identifies the Google user by provider subject; it does not create a persistent application account, attach local projects to an account, or grant coins/admin/export entitlements. Future email identity linking must be explicit and verified; do not enable automatic linking based only on matching email addresses. Existing admin routes remain a separate prototype and must not use a Google session alone as proof of admin access.

## Verification

`npm test` covers configuration gating, verified-profile admission, stable name/subject mapping and hostile callback URLs. Typecheck, lint and production build are also required. Browser QA covers Login/Create account/reset, Google unavailable state, OAuth error return, preserved email, keyboard navigation and mobile layout. A live Google login/name/avatar/logout check requires the real OAuth configuration and the user's Google account; local fixture checks do not establish that Google's consent flow is working for the deployed domain.
