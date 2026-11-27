"use client";

import { CheckCircle2, Lock, LogIn, MessageSquareHeart, RotateCcw, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuthDialog } from "./AuthDialog";
import { useLocale } from "./LocaleProvider";
import styles from "./HomeFeedbackCard.module.css";

type FeedbackCategory = "suggestion" | "bug" | "model_request";

type HomeFeedbackCardProps = {
  user: { name: string; email: string } | null;
};

function formatCountdown(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function HomeFeedbackCard({ user }: HomeFeedbackCardProps) {
  const { locale, t } = useLocale();
  const openAuth = useAuthDialog();
  const [category, setCategory] = useState<FeedbackCategory>("suggestion");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownLeft]);

  const trimmed = message.trim();
  const canSubmit = Boolean(user) && !busy && cooldownLeft === 0 && trimmed.length >= 3;

  const categories: { id: FeedbackCategory; label: string }[] = [
    { id: "suggestion", label: t.home.feedbackCatIdea },
    { id: "bug", label: t.home.feedbackCatBug },
    { id: "model_request", label: t.home.feedbackCatModel },
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!user) {
      openAuth("login");
      return;
    }
    if (cooldownLeft > 0) {
      setError(t.home.feedbackCooldown(cooldownLeft));
      return;
    }
    if (trimmed.length < 3) {
      setError(t.home.feedbackTooShort);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: trimmed,
          pagePath: "/",
          locale,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        retryAfterSec?: number;
        cooldownSeconds?: number;
        limit?: number;
      } | null;

      if (response.status === 401 || payload?.error === "LOGIN_REQUIRED") {
        openAuth("login");
        return;
      }

      if (!response.ok || !payload?.ok) {
        if (payload?.error === "FEEDBACK_COOLDOWN") {
          const waitSec = Math.max(1, Number(payload.retryAfterSec ?? 120));
          setCooldownLeft(waitSec);
          setError(t.home.feedbackCooldown(waitSec));
        } else if (payload?.error === "FEEDBACK_DAILY_LIMIT") {
          setError(t.home.feedbackDailyLimit(Number(payload.limit ?? 10)));
        } else if (response.status === 429 || payload?.error === "AUTH_RATE_LIMIT") {
          setError(t.home.feedbackRateLimit);
        } else if (payload?.error === "INVALID_INPUT") {
          setError(t.home.feedbackInvalidInput);
        } else {
          setError(t.home.feedbackFailed);
        }
        return;
      }
      setSent(true);
      setMessage("");
      setError("");
      setCooldownLeft(Number(payload.cooldownSeconds ?? 120));
    } catch {
      setError(t.home.feedbackFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`home-card ${styles.card}`} id="home-feedback" aria-label={t.home.feedbackTitle}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.titleIcon} aria-hidden="true">
            <MessageSquareHeart size={16} />
          </span>
          <h2>{t.home.feedbackTitle}</h2>
        </div>

        {user && (
          <div className={styles.categories} role="group" aria-label={t.home.feedbackCategoryAria}>
            {categories.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.catBtn} ${category === item.id ? styles.catBtnActive : ""}`}
                aria-pressed={category === item.id}
                onClick={() => {
                  setCategory(item.id);
                  if (sent) setSent(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!user ? (
        <div className={styles.guestGate}>
          <div className={styles.guestCopy}>
            <Lock size={16} className={styles.guestLockIcon} aria-hidden="true" />
            <div>
              <p>{t.home.feedbackLoginPrompt}</p>
              <small>{t.home.feedbackQuotaHint}</small>
            </div>
          </div>
          <button
            type="button"
            className={`${styles.submitBtn} home-sheen`}
            onClick={() => openAuth("login")}
          >
            <LogIn size={14} aria-hidden="true" />
            <span>{t.home.feedbackLoginBtn}</span>
          </button>
        </div>
      ) : sent ? (
        <div className={styles.successBox} role="status" aria-live="polite">
          <div className={styles.successCopy}>
            <CheckCircle2 size={22} className={styles.successIcon} aria-hidden="true" />
            <div>
              <strong>{t.home.feedbackSentTitle}</strong>
              <p>{t.home.feedbackSentDesc}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.anotherBtn}
            onClick={() => setSent(false)}
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>
              {cooldownLeft > 0
                ? `${t.home.feedbackSendAnother} (${formatCountdown(cooldownLeft)})`
                : t.home.feedbackSendAnother}
            </span>
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <textarea
            className={styles.textarea}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (error) setError("");
            }}
            placeholder={t.home.feedbackPlaceholder}
            maxLength={1500}
            rows={2}
            aria-label={t.home.feedbackPlaceholder}
          />

          <div className={styles.footer}>
            <span className={styles.metaHint} title={user.email}>
              {error ? (
                <span className={styles.errorText} role="alert">{error}</span>
              ) : (
                <span>{t.home.feedbackQuotaHint}</span>
              )}
            </span>

            <button
              type="submit"
              className={`${styles.submitBtn} home-sheen`}
              disabled={!canSubmit}
            >
              <Send size={13} aria-hidden="true" />
              <span>
                {busy
                  ? t.home.feedbackSending
                  : cooldownLeft > 0
                    ? t.home.feedbackCooldownBtn(formatCountdown(cooldownLeft))
                    : t.home.feedbackSend}
              </span>
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
