"use client";

import Image from "next/image";
import { getProviders, SessionProvider, signIn } from "next-auth/react";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import styles from "./AuthDialog.module.css";

type AuthMode = "login" | "register" | "forgot";
type Field = "name" | "email" | "code" | "password";
type FieldErrors = Partial<Record<Field, string>>;
type OpenAuth = (mode?: AuthMode) => void;
export type AccountUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  avatarUrl?: string | null;
};
type AccountContextValue = { user: AccountUser | null; refresh: () => Promise<void> };

const AuthContext = createContext<OpenAuth | null>(null);
const AccountContext = createContext<AccountContextValue | null>(null);

const copy = {
  login: {
    title: "Login",
    description: "",
    action: "Login",
  },
  register: {
    title: "Create account",
    description: "",
    action: "Create account",
  },
  forgot: {
    title: "Reset your password",
    description: "Send a 6-digit code to your email, then set a new password.",
    action: "Reset password",
  },
} as const;

function mapServerError(code: string | undefined, mode: AuthMode): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "The email or password is incorrect.";
    case "EMAIL_EXISTS":
      return "This email is already registered. Try logging in instead.";
    case "INVALID_CODE":
      return "The 6-digit verification code is incorrect.";
    case "CODE_EXPIRED":
      return "The verification code has expired. Please request a new code.";
    case "CODE_TOO_MANY_ATTEMPTS":
      return "Too many incorrect code attempts. Please request a new code.";
    case "VERIFICATION_COOLDOWN":
      return "Please wait a moment before requesting another code.";
    case "AUTH_RATE_LIMIT":
      return "Too many attempts. Please wait a bit before trying again.";
    case "EMAIL_NOT_CONFIGURED":
      return "Email verification service is not configured on the server yet.";
    case "EMAIL_SEND_FAILED":
      return "Could not send the verification email. Please try again in a moment.";
    case "REGISTRATIONS_DISABLED":
      return "New account registrations are currently paused.";
    case "INVALID_INPUT":
      return mode === "login"
        ? "Please check your email and password."
        : "Use a valid email, 6-digit code, and a 12+ character password with letters and numbers.";
    default:
      return "Account access could not be completed. Please try again.";
  }
}

export function useAuthDialog(): OpenAuth {
  const openAuth = useContext(AuthContext);
  if (!openAuth) throw new Error("useAuthDialog requires AuthDialogProvider.");
  return openAuth;
}

export function useAccount(): AccountContextValue {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount requires AuthDialogProvider.");
  return account;
}

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [initialMode, setInitialMode] = useState<AuthMode | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [oauthError, setOauthError] = useState("");
  const triggerRef = useRef<HTMLElement | null>(null);
  const openAuth = useCallback<OpenAuth>((mode = "login") => {
    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setOauthError("");
    setInitialMode(mode);
  }, []);
  const dismiss = useCallback(() => {
    setInitialMode(null);
    setOauthError("");
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { user?: AccountUser | null };
      setUser(payload.user ?? null);
    } catch { setUser(null); }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void refresh(); });
    const onChange = () => { void refresh(); };
    window.addEventListener("labellab-account-changed", onChange);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("labellab-account-changed", onChange); };
  }, [refresh]);

  useEffect(() => {
    // Open the native modal after hydration when OAuth returns an error.
    const frame = requestAnimationFrame(() => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("error")) return;
      setOauthError("Google sign-in could not be completed. Please try again.");
      setInitialMode("login");
      // Consume the provider's error without displaying raw query text.
      url.searchParams.delete("error");
      window.history.replaceState(window.history.state, "", url);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <SessionProvider>
      <AuthContext.Provider value={openAuth}>
        <AccountContext.Provider value={{ user, refresh }}>
          {children}
          {initialMode && <AuthDialog initialMode={initialMode} initialGoogleError={oauthError} onDismiss={dismiss} />}
        </AccountContext.Provider>
      </AuthContext.Provider>
    </SessionProvider>
  );
}

function AuthDialog({ initialMode, initialGoogleError, onDismiss }: {
  initialMode: AuthMode;
  initialGoogleError: string;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>(initialGoogleError ? '[role="alert"]' : "h2")?.focus({ preventScroll: true });
    return () => {
      // Removing the element releases the native modal. Calling close() here
      // would queue a close event during React Strict Mode's effect replay.
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [initialGoogleError]);

  const switchMode = (next: AuthMode, currentEmail: string) => {
    setEmail(currentEmail);
    setMode(next);
    if (dialogRef.current) dialogRef.current.scrollTop = 0;
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={mode === "forgot" ? descriptionId : undefined}
      onClose={(event) => {
        if (!event.currentTarget.open) onDismiss();
      }}
      onCancel={(event) => {
        event.preventDefault();
        dialogRef.current?.close();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]',
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement?.tagName === "H2")) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        backdropPress.current = event.target === event.currentTarget && (
          event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom
        );
      }}
      onPointerUp={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (backdropPress.current && (
          event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom
        )) dialogRef.current?.close();
        backdropPress.current = false;
      }}
    >
      <div className={styles.brandRow}>
        <Image src="/branding/LLLogo.svg" alt="HyperMockup" width={156} height={33} />
        <button
          type="button"
          className={styles.close}
          aria-label="Close account dialog"
          onClick={() => dialogRef.current?.close()}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <AuthForm
        key={mode}
        mode={mode}
        initialEmail={email}
        initialGoogleError={mode === initialMode ? initialGoogleError : ""}
        titleId={titleId}
        descriptionId={descriptionId}
        onSwitchMode={switchMode}
        onAuthenticated={() => {
          window.dispatchEvent(new Event("labellab-account-changed"));
          onDismiss();
        }}
      />
    </dialog>
  );
}

function AuthForm({ mode, initialEmail, initialGoogleError, titleId, descriptionId, onSwitchMode, onAuthenticated }: {
  mode: AuthMode;
  initialEmail: string;
  initialGoogleError: string;
  titleId: string;
  descriptionId: string;
  onSwitchMode: (mode: AuthMode, email: string) => void;
  onAuthenticated: () => void;
}) {
  const [values, setValues] = useState({ name: "", email: initialEmail, code: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [googleError, setGoogleError] = useState(initialGoogleError);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [verificationSentTo, setVerificationSentTo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const googlePending = useRef(false);
  const formActive = useRef(true);
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const googleErrorRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const content = copy[mode];

  useEffect(() => {
    formActive.current = true;
    if (initialGoogleError) googleErrorRef.current?.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
    return () => { formActive.current = false; };
  }, [initialGoogleError]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const continueWithGoogle = async () => {
    if (googlePending.current) return;
    googlePending.current = true;
    setGoogleBusy(true);
    setSubmitError("");
    setGoogleError("");
    let redirecting = false;
    try {
      const providers = await getProviders();
      if (!formActive.current) return;
      if (!providers?.google) {
        setGoogleError("Google sign-in is not available yet. Please try again later.");
      } else {
        // NextAuth starts the server-verified OAuth flow with CSRF, PKCE and
        // state checks. Verified Google sign-ins also issue a D1 account session.
        await signIn("google", { callbackUrl: window.location.href });
        redirecting = true;
      }
    } catch {
      setGoogleError("Unable to connect to Google sign-in. Please try again.");
    } finally {
      googlePending.current = false;
      if (formActive.current && !redirecting) {
        setGoogleBusy(false);
        requestAnimationFrame(() => googleErrorRef.current?.focus());
      }
    }
  };

  const validate = (field: Field, value: string): string | undefined => {
    if (field === "name" && !value.trim()) return "Enter your name.";
    if (field === "email") {
      if (!value.trim()) return "Enter your email address.";
      if (!formRef.current?.querySelector<HTMLInputElement>('[name="email"]')?.validity.valid) {
        return "Enter a valid email address.";
      }
    }
    if (field === "code") {
      if (!/^\d{6}$/.test(value.trim())) return "Enter the 6-digit code sent to your email.";
    }
    if (field === "password") {
      if (!value) return "Enter your password.";
      if (mode !== "login") {
        if (value.length < 12 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
          return "Use at least 12 characters with letters and numbers.";
        }
      }
    }
  };

  const update = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setSubmitError("");
    setGoogleError("");
    if (field === "email" && value.trim().toLowerCase() !== verificationSentTo) {
      setVerificationSentTo("");
      setCooldown(0);
    }
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const emailIsValid = /^\S+@\S+\.\S+$/.test(values.email.trim());
  const needsCode = mode === "register" || mode === "forgot";

  const sendCode = async () => {
    if (!emailIsValid || sendBusy || cooldown > 0) return;
    const normalized = values.email.trim().toLowerCase();
    setSendBusy(true);
    setSubmitError("");
    setErrors((current) => ({ ...current, email: undefined, code: undefined }));
    try {
      const response = await fetch("/api/account/verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: normalized, purpose: mode === "forgot" ? "reset" : "register" }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; cooldownSeconds?: number; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "EMAIL_SEND_FAILED");
      }
      if (!formActive.current) return;
      setVerificationSentTo(normalized);
      setCooldown(Number(payload.cooldownSeconds) || 60);
    } catch (error) {
      if (!formActive.current) return;
      setSubmitError(mapServerError(error instanceof Error ? error.message : undefined, mode));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      if (formActive.current) setSendBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (googleBusy || submitBusy) return;
    setGoogleError("");
    const fields: Field[] = mode === "register"
      ? ["name", "email", "code", "password"]
      : mode === "forgot"
        ? ["email", "code", "password"]
        : ["email", "password"];
    const nextErrors: FieldErrors = {};
    for (const field of fields) {
      const error = validate(field, values[field]);
      if (error) nextErrors[field] = error;
    }
    setErrors(nextErrors);
    const firstInvalid = fields.find((field) => nextErrors[field]);
    if (firstInvalid) {
      const targetName = firstInvalid === "code" ? "verificationCode" : firstInvalid;
      formRef.current?.querySelector<HTMLInputElement>(`[name="${targetName}"]`)?.focus();
      return;
    }

    setSubmitBusy(true);
    setSubmitError("");
    try {
      const endpoint = mode === "register"
        ? "/api/account/register"
        : mode === "forgot"
          ? "/api/account/password/reset"
          : "/api/account/login";
      const body = mode === "register"
        ? { name: values.name.trim(), email: values.email.trim(), password: values.password, verificationCode: values.code.trim() }
        : mode === "forgot"
          ? { email: values.email.trim(), password: values.password, verificationCode: values.code.trim() }
          : { email: values.email.trim(), password: values.password };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "REQUEST_FAILED");
      onAuthenticated();
    } catch (error) {
      setSubmitError(mapServerError(error instanceof Error ? error.message : undefined, mode));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSubmitBusy(false);
    }
  };

  return (
    <>
      {mode !== "forgot" ? (
        <h2 className="sr-only" ref={headingRef} tabIndex={-1} id={titleId}>{content.title}</h2>
      ) : (
        <div className={styles.intro}>
          <span className={styles.eyebrow}>LET’S GET YOU BACK IN</span>
          <h2 ref={headingRef} tabIndex={-1} id={titleId}>{content.title}</h2>
          <p id={descriptionId}>{content.description}</p>
        </div>
      )}
      <form ref={formRef} className={`${styles.form} ${mode !== "forgot" ? styles.compactForm : ""}`} onSubmit={submit} noValidate>
        {mode !== "forgot" && (
          <div className={styles.googleOption}>
            <button
              type="button"
              className={styles.googleButton}
              aria-busy={googleBusy}
              disabled={googleBusy || submitBusy}
              onClick={() => void continueWithGoogle()}
            >
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
                <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
              </svg>
              <span>{googleBusy ? "Connecting to Google…" : "Continue with Google"}</span>
            </button>
            {googleError && (
              <div ref={googleErrorRef} className={styles.serviceError} role="alert" tabIndex={-1}>
                <CircleAlert size={18} aria-hidden="true" />
                <p>{googleError}</p>
              </div>
            )}
            <div className={styles.divider}><span>or continue with email</span></div>
          </div>
        )}
        {mode === "register" && (
          <div className={styles.field}>
            <label htmlFor={`${fieldId}-name`}>Your name</label>
            <input
              id={`${fieldId}-name`}
              name="name"
              autoComplete="name"
              required
              value={values.name}
              placeholder="Your display name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? `${fieldId}-name-error` : undefined}
              onChange={(event) => update("name", event.target.value)}
            />
            {errors.name && <p className={styles.fieldError} id={`${fieldId}-name-error`}>{errors.name}</p>}
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor={`${fieldId}-email`}>Email address</label>
          <input
            id={`${fieldId}-email`}
            name="email"
            type="email"
            autoComplete={mode === "forgot" ? "email" : "username"}
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            required
            value={values.email}
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? `${fieldId}-email-error` : undefined}
            onChange={(event) => update("email", event.target.value)}
          />
          {errors.email && <p className={styles.fieldError} id={`${fieldId}-email-error`}>{errors.email}</p>}
        </div>
        {needsCode && (
          <div className={`${styles.field} ${styles.verificationField}`}>
            <div className={styles.labelRow}>
              <label htmlFor={`${fieldId}-verification`}>Email verification code</label>
              <button
                type="button"
                className={styles.textButton}
                disabled={!emailIsValid || sendBusy || cooldown > 0}
                onClick={() => void sendCode()}
              >
                {sendBusy
                  ? "Sending…"
                  : cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : verificationSentTo
                      ? "Resend code"
                      : "Send code"}
              </button>
            </div>
            <input
              id={`${fieldId}-verification`}
              name="verificationCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              value={values.code}
              placeholder="Enter 6-digit code"
              aria-invalid={Boolean(errors.code)}
              aria-describedby={errors.code ? `${fieldId}-code-error` : undefined}
              onChange={(event) => update("code", event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            {errors.code ? (
              <p className={styles.fieldError} id={`${fieldId}-code-error`}>{errors.code}</p>
            ) : (
              <p className={styles.hint}>
                {verificationSentTo
                  ? `We sent a 6-digit code to ${verificationSentTo}. Check Spam if you don’t see it.`
                  : "Click Send code to receive a 6-digit verification code by email."}
              </p>
            )}
          </div>
        )}
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor={`${fieldId}-password`}>{mode === "forgot" ? "New password" : "Password"}</label>
            {mode === "login" && (
              <button type="button" className={styles.textButton} onClick={() => onSwitchMode("forgot", values.email)}>
                Forgot password?
              </button>
            )}
          </div>
          <div className={styles.passwordInput}>
            <input
              id={`${fieldId}-password`}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode !== "login" ? 12 : undefined}
              value={values.password}
              placeholder={mode === "login" ? "Enter your password" : mode === "forgot" ? "Create a new password" : "Create a password"}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? `${fieldId}-password-error`
                : mode !== "login" ? `${fieldId}-password-hint` : undefined}
              onChange={(event) => update("password", event.target.value)}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              aria-controls={`${fieldId}-password`}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
            </button>
          </div>
          {errors.password && <p className={styles.fieldError} id={`${fieldId}-password-error`}>{errors.password}</p>}
          {mode !== "login" && !errors.password && (
            <p className={styles.hint} id={`${fieldId}-password-hint`}>Use at least 12 characters with letters and numbers.</p>
          )}
        </div>
        {submitError && (
          <div ref={errorRef} className={styles.serviceError} role="alert" tabIndex={-1}>
            <CircleAlert size={18} aria-hidden="true" />
            <p>{submitError}</p>
          </div>
        )}
        <button type="submit" className={styles.submit} disabled={googleBusy || submitBusy}>
          <span>{submitBusy ? "Please wait…" : content.action}</span><ArrowRight size={19} aria-hidden="true" />
        </button>
      </form>
      <div className={styles.footer}>
        {mode === "forgot" ? (
          <button type="button" className={styles.backButton} onClick={() => onSwitchMode("login", values.email)}>
            <ArrowLeft size={17} aria-hidden="true" /> Back to login
          </button>
        ) : (
          <>
            <span>{mode === "login" ? "New to HyperMockup?" : "Already have an account?"}</span>
            <button type="button" className={styles.textButton} onClick={() => onSwitchMode(mode === "login" ? "register" : "login", values.email)}>
              {mode === "login" ? "Create an account" : "Login"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
