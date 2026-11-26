"use client";

import Link from "next/link";
import { Info, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./LocaleProvider";
import { fetchSiteConfigCached } from "@/lib/client/api-cache";
import styles from "./LegalFooter.module.css";

export type PublicLegalInfo = {
  ownerName: string;
  ownerTaxId: string;
  ownerAddress: string;
  ownerPhone: string;
  contactEmail: string;
  domain: string;
  moitStatusUrl: string;
};

const EMPTY_LEGAL: PublicLegalInfo = {
  ownerName: "",
  ownerTaxId: "",
  ownerAddress: "",
  ownerPhone: "",
  contactEmail: "hypermockup@gmail.com",
  domain: "hypermockup.com",
  moitStatusUrl: "",
};

export default function LegalFooter({ initialLegal }: { initialLegal?: Partial<PublicLegalInfo> }) {
  const { locale, t } = useLocale();
  const f = t.footer;
  const [legal, setLegal] = useState<PublicLegalInfo>({ ...EMPTY_LEGAL, ...initialLegal });
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchSiteConfigCached<{ legal?: Partial<PublicLegalInfo> }>()
      .then((payload) => {
        if (!active || !payload?.legal) return;
        setLegal((prev) => ({ ...prev, ...payload.legal }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const ownerSummary = legal.ownerName
    ? f.ownerSummaryNamed(legal.ownerName, legal.ownerTaxId)
    : f.ownerSummaryFallback;

  return (
    <>
      <footer className={styles.footer} aria-label={f.ariaLabel}>
        <div className={styles.identity}>
          <span className={styles.brand}>© 2026 HyperMockup ({legal.domain})</span>
          <span className={styles.meta}>
            {ownerSummary}
            {legal.ownerPhone ? ` · ${legal.ownerPhone}` : ""}
          </span>
          <a
            href={`mailto:${legal.contactEmail}`}
            className={styles.emailPill}
            aria-label={f.emailAria(legal.contactEmail)}
          >
            <Mail size={12} aria-hidden="true" />
            <span>{legal.contactEmail}</span>
          </a>
          <button
            type="button"
            className={styles.ownerButton}
            onClick={() => setModalOpen(true)}
          >
            <Info size={13} aria-hidden="true" />
            <span>{f.ownerInfoButton}</span>
          </button>
        </div>

        <nav className={styles.links} aria-label={f.linksAria}>
          <Link href={`/about?lang=${locale}`}>{f.about}</Link>
          <Link href={`/legal/terms?lang=${locale}`}>{f.terms}</Link>
          <Link href={`/legal/privacy?lang=${locale}`}>{f.privacy}</Link>
          <Link href={`/legal/refund?lang=${locale}`}>{f.refund}</Link>
          <Link href={`/legal/complaints?lang=${locale}`}>{f.complaints}</Link>
          <Link href={`/contact?lang=${locale}`}>{f.contact}</Link>
          {legal.moitStatusUrl && (
            <a
              href={legal.moitStatusUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.moitLink}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              <span>{f.moitBadge}</span>
            </a>
          )}
        </nav>
      </footer>

      {modalOpen && typeof document !== "undefined"
        ? createPortal(
          <div
            className={styles.overlay}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setModalOpen(false);
            }}
          >
            <section
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="legal-owner-dialog-title"
            >
              <button
                type="button"
                className={styles.modalClose}
                aria-label={f.modalCloseAria}
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>
              <h3 id="legal-owner-dialog-title">{f.modalTitle}</h3>
              <p className={styles.modalIntro}>{f.modalIntro}</p>
              <dl className={styles.modalList}>
                <div>
                  <dt>{f.labelOwner}</dt>
                  <dd>{legal.ownerName || f.pendingOwner}</dd>
                </div>
                <div>
                  <dt>{f.labelTaxId}</dt>
                  <dd>{legal.ownerTaxId || f.pendingGeneric}</dd>
                </div>
                <div>
                  <dt>{f.labelAddress}</dt>
                  <dd>{legal.ownerAddress || f.pendingAddress}</dd>
                </div>
                <div>
                  <dt>{f.labelPhone}</dt>
                  <dd>{legal.ownerPhone || f.pendingGeneric}</dd>
                </div>
                <div>
                  <dt>{f.labelEmail}</dt>
                  <dd>
                    <a href={`mailto:${legal.contactEmail}`} style={{ color: "#a12e56", textDecoration: "underline" }}>
                      {legal.contactEmail}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{f.labelDomain}</dt>
                  <dd>https://{legal.domain}</dd>
                </div>
              </dl>
              <div className={styles.modalLinks}>
                <Link href={`/about?lang=${locale}`} onClick={() => setModalOpen(false)}>{f.about}</Link>
                <Link href={`/contact?lang=${locale}`} onClick={() => setModalOpen(false)}>{f.contact}</Link>
                <Link href={`/legal/terms?lang=${locale}`} onClick={() => setModalOpen(false)}>{f.termsFull}</Link>
                <Link href={`/legal/privacy?lang=${locale}`} onClick={() => setModalOpen(false)}>{f.privacy}</Link>
                <Link href={`/legal/refund?lang=${locale}`} onClick={() => setModalOpen(false)}>{f.refund}</Link>
                <Link href={`/legal/complaints?lang=${locale}`} onClick={() => setModalOpen(false)}>{f.complaints}</Link>
              </div>
            </section>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
