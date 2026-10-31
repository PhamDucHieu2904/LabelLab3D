"use client";

import Image from "next/image";
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
type Field = "name" | "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;
type OpenAuth = (mode?: AuthMode) => void;

const AuthContext = createContext<OpenAuth | null>(null);

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
    title: "Forgot your password?",
    description: "Enter your email to request a password reset link.",
    action: "Send reset link",
  },
} as const;

export function useAuthDialog(): OpenAuth {
  const openAuth = useContext(AuthContext);
  if (!openAuth) throw new Error("useAuthDialog requires AuthDialogProvider.");
  return openAuth;
}

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [initialMode, setInitialMode] = useState<AuthMode | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const openAuth = useCallback<OpenAuth>((mode = "login") => {
    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setInitialMode(mode);
  }, []);
  const dismiss = useCallback(() => {
    setInitialMode(null);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <AuthContext.Provider value={openAuth}>
      {children}
      {initialMode && <AuthDialog initialMode={initialMode} onDismiss={dismiss} />}
    </AuthContext.Provider>
  );
}

function AuthDialog({ initialMode, onDismiss }: {
  initialMode: AuthMode;
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
    dialog.querySelector<HTMLHeadingElement>("h2")?.focus({ preventScroll: true });
    return () => {
      // Removing the element releases the native modal. Calling close() here
      // would queue a close event during React Strict Mode's effect replay.
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

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
        <Image src="/branding/LLLogo.svg" alt="Labellab" width={156} height={33} />
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
        titleId={titleId}
        descriptionId={descriptionId}
        onSwitchMode={switchMode}
      />
    </dialog>
  );
}

function AuthForm({ mode, initialEmail, titleId, descriptionId, onSwitchMode }: {
  mode: AuthMode;
  initialEmail: string;
  titleId: string;
  descriptionId: string;
  onSwitchMode: (mode: AuthMode, email: string) => void;
}) {
  const [values, setValues] = useState({ name: "", email: initialEmail, password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const content = copy[mode];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const validate = (field: Field, value: string): string | undefined => {
    if (field === "name" && !value.trim()) return "Enter your name.";
    if (field === "email") {
      if (!value.trim()) return "Enter your email address.";
      if (!formRef.current?.querySelector<HTMLInputElement>('[name="email"]')?.validity.valid) {
        return "Enter a valid email address.";
      }
    }
    if (field === "password") {
      if (!value) return "Enter your password.";
      if (mode === "register" && value.length < 12) return "Use at least 12 characters for your password.";
    }
  };

  const update = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setSubmitError("");
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields: Field[] = mode === "register" ? ["name", "email", "password"]
      : mode === "login" ? ["email", "password"] : ["email"];
    const nextErrors: FieldErrors = {};
    for (const field of fields) {
      const error = validate(field, values[field]);
      if (error) nextErrors[field] = error;
    }
    setErrors(nextErrors);
    const firstInvalid = fields.find((field) => nextErrors[field]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }

    // UI-only until the account service is connected. Never persist credentials
    // or imply that an account/session/reset email was created successfully.
    setSubmitError(mode === "forgot"
      ? "Password reset is not available yet. Please try again later."
      : "Account access is not available yet. Please try again later.");
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  return (
    <>
      {mode !== "forgot" ? (
        <h2 className="sr-only" ref={headingRef} tabIndex={-1} id={titleId}>{content.title}</h2>
      ) : <div className={styles.intro}>
        <span className={styles.eyebrow}>LET’S GET YOU BACK IN</span>
        <h2 ref={headingRef} tabIndex={-1} id={titleId}>{content.title}</h2>
        <p id={descriptionId}>{content.description}</p>
      </div>}
      <form ref={formRef} className={`${styles.form} ${mode !== "forgot" ? styles.compactForm : ""}`} onSubmit={submit} noValidate>
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
        {mode !== "forgot" && (
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor={`${fieldId}-password`}>Password</label>
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
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required
                minLength={mode === "register" ? 12 : undefined}
                value={values.password}
                placeholder={mode === "register" ? "Create a password" : "Enter your password"}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? `${fieldId}-password-error`
                  : mode === "register" ? `${fieldId}-password-hint` : undefined}
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
            {mode === "register" && !errors.password && <p className={styles.hint} id={`${fieldId}-password-hint`}>Use at least 12 characters.</p>}
          </div>
        )}
        {submitError && (
          <div ref={errorRef} className={styles.serviceError} role="alert" tabIndex={-1}>
            <CircleAlert size={18} aria-hidden="true" />
            <p>{submitError}</p>
          </div>
        )}
        <button type="submit" className={styles.submit}>
          <span>{content.action}</span><ArrowRight size={19} aria-hidden="true" />
        </button>
      </form>
      <div className={styles.footer}>
        {mode === "forgot" ? (
          <button type="button" className={styles.backButton} onClick={() => onSwitchMode("login", values.email)}>
            <ArrowLeft size={17} aria-hidden="true" /> Back to login
          </button>
        ) : (
          <>
            <span>{mode === "login" ? "New to Labellab?" : "Already have an account?"}</span>
            <button type="button" className={styles.textButton} onClick={() => onSwitchMode(mode === "login" ? "register" : "login", values.email)}>
              {mode === "login" ? "Create an account" : "Login"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
