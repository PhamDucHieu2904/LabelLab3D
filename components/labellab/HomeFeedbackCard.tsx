"use client";

import { CheckCircle2, MessageSquareHeart, RotateCcw, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocale } from "./LocaleProvider";
import styles from "./HomeFeedbackCard.module.css";

type FeedbackCategory = "suggestion" | "bug" | "model_request";

type HomeFeedbackCardProps = {
  user: { name: string; email: string } | null;
};

export default function HomeFeedbackCard({ user }: HomeFeedbackCardProps) {
  const { locale, t } = useLocale();
  const [category, setCategory] = useState<FeedbackCategory>("suggestion");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const trimmed = message.trim();
  const canSubmit = !busy && trimmed.length >= 3;

  const categories: { id: FeedbackCategory; label: string }[] = [
    { id: "suggestion", label: t.home.feedbackCatIdea },
    { id: "bug", label: t.home.feedbackCatBug },
    { id: "model_request", label: t.home.feedbackCatModel },
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (trimmed.length < 3) {
      setError(t.home.feedbackTooShort);
      return;
    }
    const emailValue = contactEmail.trim();
    if (!user && emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setError(t.home.feedbackInvalidEmail);
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
          contactEmail: user ? undefined : emailValue || undefined,
          pagePath: "/",
          locale,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        if (response.status === 429 || payload?.error === "AUTH_RATE_LIMIT") {
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
      </div>

      {sent ? (
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
            <span>{t.home.feedbackSendAnother}</span>
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
            {user ? (
              <span className={styles.metaHint} title={user.email}>
                {error ? (
                  <span className={styles.errorText} role="alert">{error}</span>
                ) : (
                  <span>{t.home.feedbackAsUser(user.name || user.email)}</span>
                )}
              </span>
            ) : (
              <div className={styles.guestInputWrap}>
                <input
                  type="email"
                  className={styles.emailInput}
                  value={contactEmail}
                  onChange={(e) => {
                    setContactEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder={t.home.feedbackEmailPlaceholder}
                  aria-label={t.home.feedbackEmailPlaceholder}
                  maxLength={160}
                />
                {error && <span className={styles.errorFloat} role="alert">{error}</span>}
              </div>
            )}

            <button
              type="submit"
              className={`${styles.submitBtn} home-sheen`}
              disabled={!canSubmit}
            >
              <Send size={13} aria-hidden="true" />
              <span>{busy ? t.home.feedbackSending : t.home.feedbackSend}</span>
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
