"use client";

import Image from "next/image";
import Link from "next/link";
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
import type { UiMessages } from "@/lib/i18n/messages";
import { fetchAccountMeCached } from "@/lib/client/api-cache";
import { useLocale } from "./LocaleProvider";
import styles from "./AuthDialog.module.css";

type AuthMode = "login" | "register" | "forgot";
type InputField = "name" | "email" | "code" | "password";
type Field = InputField | "consent";
type FieldErrors = Partial<Record<Field, string>>;
type OpenAuth = (mode?: AuthMode) => void;
export type AccountUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  avatarUrl?: string | null;
  studioTourPending?: boolean;
};
type AccountContextValue = { user: AccountUser | null; refresh: () => Promise<void> };

const AuthContext = createContext<OpenAuth | null>(null);
const AccountContext = createContext<AccountContextValue | null>(null);

function mapServerError(code: string | undefined, mode: AuthMode, a: UiMessages["auth"]): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return a.errInvalidCredentials;
    case "EMAIL_EXISTS":
      return a.errEmailExists;
    case "INVALID_CODE":
      return a.errInvalidCode;
    case "CODE_EXPIRED":
      return a.errCodeExpired;
    case "CODE_TOO_MANY_ATTEMPTS":
      return a.errCodeTooMany;
    case "VERIFICATION_COOLDOWN":
      return a.errCooldown;
    case "AUTH_RATE_LIMIT":
      return a.errRateLimit;
    case "EMAIL_NOT_CONFIGURED":
      return a.errEmailNotConfigured;
    case "EMAIL_SEND_FAILED":
      return a.errEmailSendFailed;
    case "REGISTRATIONS_DISABLED":
      return a.errRegistrationsDisabled;
    case "CONSENT_REQUIRED":
      return a.errConsentRequired;
    case "INVALID_INPUT":
      return mode === "login" ? a.errInvalidInputLogin : a.errInvalidInputOther;
    default:
      return a.errGeneric;
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
  const { t } = useLocale();
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
      const payload = await fetchAccountMeCached<{ user?: AccountUser | null }>();
      setUser(payload?.user ?? null);
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
      setOauthError(t.auth.googleOauthFailed);
      setInitialMode("login");
      // Consume the provider's error without displaying raw query text.
      url.searchParams.delete("error");
      window.history.replaceState(window.history.state, "", url);
    });
    return () => cancelAnimationFrame(frame);
  }, [t.auth.googleOauthFailed]);

  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
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
  const { t } = useLocale();
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
        <Image src="/branding/hypermockup-logo.svg" alt="HyperMockup" width={185} height={27} unoptimized />
        <button
          type="button"
          className={styles.close}
          aria-label={t.auth.closeAria}
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
  const { locale, t } = useLocale();
  const a = t.auth;
  const [values, setValues] = useState({ name: "", email: initialEmail, code: "", password: "" });
  const [consentAccepted, setConsentAccepted] = useState(false);
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
  const content = mode === "login"
    ? { title: a.loginTitle, description: "", action: a.loginAction }
    : mode === "register"
      ? { title: a.registerTitle, description: "", action: a.registerAction }
      : { title: a.forgotTitle, description: a.forgotDescription, action: a.forgotAction };

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
    if (mode === "register" && !consentAccepted) {
      setErrors((current) => ({
        ...current,
        consent: a.consentRequiredError,
      }));
      formRef.current?.querySelector<HTMLInputElement>('[name="legalConsent"]')?.focus();
      return;
    }
    googlePending.current = true;
    setGoogleBusy(true);
    setSubmitError("");
    setGoogleError("");
    let redirecting = false;
    try {
      const providers = await getProviders();
      if (!formActive.current) return;
      if (!providers?.google) {
        setGoogleError(a.googleUnavailable);
      } else {
        await signIn("google", { callbackUrl: window.location.href });
        redirecting = true;
      }
    } catch {
      setGoogleError(a.googleConnectError);
    } finally {
      googlePending.current = false;
      if (formActive.current && !redirecting) {
        setGoogleBusy(false);
        requestAnimationFrame(() => googleErrorRef.current?.focus());
      }
    }
  };

  const validate = (field: InputField, value: string): string | undefined => {
    if (field === "name" && !value.trim()) return a.valNameRequired;
    if (field === "email") {
      if (!value.trim()) return a.valEmailRequired;
      if (!formRef.current?.querySelector<HTMLInputElement>('[name="email"]')?.validity.valid) {
        return a.valEmailInvalid;
      }
    }
    if (field === "code") {
      if (!/^\d{6}$/.test(value.trim())) return a.valCodeInvalid;
    }
    if (field === "password") {
      if (!value) return a.valPasswordRequired;
      if (mode !== "login") {
        if (value.length < 12 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
          return a.valPasswordWeak;
        }
      }
    }
  };

  const update = (field: InputField, value: string) => {
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
      setSubmitError(mapServerError(error instanceof Error ? error.message : undefined, mode, a));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      if (formActive.current) setSendBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (googleBusy || submitBusy) return;
    setGoogleError("");
    const fields: InputField[] = mode === "register"
      ? ["name", "email", "code", "password"]
      : mode === "forgot"
        ? ["email", "code", "password"]
        : ["email", "password"];
    const nextErrors: FieldErrors = {};
    for (const field of fields) {
      const error = validate(field, values[field]);
      if (error) nextErrors[field] = error;
    }
    if (mode === "register" && !consentAccepted) {
      nextErrors.consent = a.consentRequiredError;
    }
    setErrors(nextErrors);
    const firstInvalid = [...fields, ...(mode === "register" ? (["consent"] as const) : [])].find((field) => nextErrors[field]);
    if (firstInvalid) {
      const targetName = firstInvalid === "code" ? "verificationCode" : firstInvalid === "consent" ? "legalConsent" : firstInvalid;
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
        ? {
            name: values.name.trim(),
            email: values.email.trim(),
            password: values.password,
            verificationCode: values.code.trim(),
            acceptedTerms: consentAccepted,
            acceptedPrivacy: consentAccepted,
          }
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
      setSubmitError(mapServerError(error instanceof Error ? error.message : undefined, mode, a));
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
          <span className={styles.eyebrow}>{a.forgotEyebrow}</span>
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
              <span>{googleBusy ? a.googleConnecting : a.googleContinue}</span>
            </button>
            {googleError && (
              <div ref={googleErrorRef} className={styles.serviceError} role="alert" tabIndex={-1}>
                <CircleAlert size={18} aria-hidden="true" />
                <p>{googleError}</p>
              </div>
            )}
            <div className={styles.divider}><span>{a.dividerEmail}</span></div>
          </div>
        )}
        {mode === "register" && (
          <div className={styles.field}>
            <label htmlFor={`${fieldId}-name`}>{a.nameLabel}</label>
            <input
              id={`${fieldId}-name`}
              name="name"
              autoComplete="name"
              required
              value={values.name}
              placeholder={a.namePlaceholder}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? `${fieldId}-name-error` : undefined}
              onChange={(event) => update("name", event.target.value)}
            />
            {errors.name && <p className={styles.fieldError} id={`${fieldId}-name-error`}>{errors.name}</p>}
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor={`${fieldId}-email`}>{a.emailLabel}</label>
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
            placeholder={a.emailPlaceholder}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? `${fieldId}-email-error` : undefined}
            onChange={(event) => update("email", event.target.value)}
          />
          {errors.email && <p className={styles.fieldError} id={`${fieldId}-email-error`}>{errors.email}</p>}
        </div>
        {needsCode && (
          <div className={`${styles.field} ${styles.verificationField}`}>
            <div className={styles.labelRow}>
              <label htmlFor={`${fieldId}-verification`}>{a.codeLabel}</label>
              <button
                type="button"
                className={styles.textButton}
                disabled={!emailIsValid || sendBusy || cooldown > 0}
                onClick={() => void sendCode()}
              >
                {sendBusy
                  ? a.sending
                  : cooldown > 0
                    ? a.resendIn(cooldown)
                    : verificationSentTo
                      ? a.resendCode
                      : a.sendCode}
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
              placeholder={a.codePlaceholder}
              aria-invalid={Boolean(errors.code)}
              aria-describedby={errors.code ? `${fieldId}-code-error` : undefined}
              onChange={(event) => update("code", event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            {errors.code ? (
              <p className={styles.fieldError} id={`${fieldId}-code-error`}>{errors.code}</p>
            ) : (
              <p className={styles.hint}>
                {verificationSentTo ? a.codeSentHint(verificationSentTo) : a.codePromptHint}
              </p>
            )}
          </div>
        )}
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor={`${fieldId}-password`}>{mode === "forgot" ? a.newPasswordLabel : a.passwordLabel}</label>
            {mode === "login" && (
              <button type="button" className={styles.textButton} onClick={() => onSwitchMode("forgot", values.email)}>
                {a.forgotPasswordLink}
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
              placeholder={mode === "login" ? a.passwordLoginPlaceholder : mode === "forgot" ? a.passwordForgotPlaceholder : a.passwordRegisterPlaceholder}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? `${fieldId}-password-error`
                : mode !== "login" ? `${fieldId}-password-hint` : undefined}
              onChange={(event) => update("password", event.target.value)}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              aria-label={showPassword ? a.hidePasswordAria : a.showPasswordAria}
              aria-pressed={showPassword}
              aria-controls={`${fieldId}-password`}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
            </button>
          </div>
          {errors.password && <p className={styles.fieldError} id={`${fieldId}-password-error`}>{errors.password}</p>}
          {mode !== "login" && !errors.password && (
            <p className={styles.hint} id={`${fieldId}-password-hint`}>{a.passwordHint}</p>
          )}
        </div>
        {mode === "register" && (
          <div className={styles.consentWrap}>
            <label className={styles.consentLabel}>
              <input
                type="checkbox"
                name="legalConsent"
                checked={consentAccepted}
                aria-invalid={Boolean(errors.consent)}
                aria-describedby={errors.consent ? `${fieldId}-consent-error` : undefined}
                onChange={(event) => {
                  setConsentAccepted(event.target.checked);
                  if (errors.consent) setErrors((current) => ({ ...current, consent: undefined }));
                  setSubmitError("");
                }}
              />
              <span>
                {a.consentPrefix}
                <Link href={`/legal/terms?lang=${locale}`} target="_blank" rel="noopener noreferrer">{a.consentTerms}</Link>
                {a.consentAnd}
                <Link href={`/legal/privacy?lang=${locale}`} target="_blank" rel="noopener noreferrer">{a.consentPrivacy}</Link>
                {a.consentSuffix}
              </span>
            </label>
            {errors.consent && <p className={styles.fieldError} id={`${fieldId}-consent-error`}>{errors.consent}</p>}
          </div>
        )}
        {mode === "login" && (
          <p className={styles.legalFootNote}>
            {a.loginLegalPrefix}
            <Link href={`/legal/terms?lang=${locale}`} target="_blank" rel="noopener noreferrer">{a.loginLegalTerms}</Link>
            {" & "}
            <Link href={`/legal/privacy?lang=${locale}`} target="_blank" rel="noopener noreferrer">{a.loginLegalPrivacy}</Link>.
          </p>
        )}
        {submitError && (
          <div ref={errorRef} className={styles.serviceError} role="alert" tabIndex={-1}>
            <CircleAlert size={18} aria-hidden="true" />
            <p>{submitError}</p>
          </div>
        )}
        <button type="submit" className={styles.submit} disabled={googleBusy || submitBusy}>
          <span>{submitBusy ? a.pleaseWait : content.action}</span><ArrowRight size={19} aria-hidden="true" />
        </button>
      </form>
      <div className={styles.footer}>
        {mode === "forgot" ? (
          <button type="button" className={styles.backButton} onClick={() => onSwitchMode("login", values.email)}>
            <ArrowLeft size={17} aria-hidden="true" /> {a.backToLogin}
          </button>
        ) : (
          <>
            <span>{mode === "login" ? a.newToBrand : a.alreadyHaveAccount}</span>
            <button type="button" className={styles.textButton} onClick={() => onSwitchMode(mode === "login" ? "register" : "login", values.email)}>
              {mode === "login" ? a.createAccountLink : a.loginLink}
            </button>
          </>
        )}
      </div>
    </>
  );
}
