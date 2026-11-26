"use client";

type UsageBucket = {
  rendersStarted: number;
  rendersCompleted: number;
  dielinesStarted: number;
  dielinesCompleted: number;
  expectedCoins: number;
  domSvgCopies: number;
};

const EMPTY_BUCKET: UsageBucket = {
  rendersStarted: 0,
  rendersCompleted: 0,
  dielinesStarted: 0,
  dielinesCompleted: 0,
  expectedCoins: 0,
  domSvgCopies: 0,
};

let bucket: UsageBucket = { ...EMPTY_BUCKET };
let activeListeners = 0;

function hasPendingData(target: UsageBucket) {
  return (
    target.rendersStarted > 0 ||
    target.rendersCompleted > 0 ||
    target.dielinesStarted > 0 ||
    target.dielinesCompleted > 0 ||
    target.expectedCoins > 0 ||
    target.domSvgCopies > 0
  );
}

export function flushToolUsageSummary() {
  if (typeof window === "undefined" || !hasPendingData(bucket)) return;
  const snapshot = bucket;
  bucket = { ...EMPTY_BUCKET };
  const payload = JSON.stringify({
    kind: "tool_summary",
    rendersStarted: snapshot.rendersStarted,
    rendersCompleted: snapshot.rendersCompleted,
    dielinesStarted: snapshot.dielinesStarted,
    dielinesCompleted: snapshot.dielinesCompleted,
    expectedCoins: snapshot.expectedCoins,
    domSvgCopies: snapshot.domSvgCopies,
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(
        "/api/telemetry/visit",
        new Blob([payload], { type: "application/json" }),
      );
      if (sent) return;
    }
    void fetch("/api/telemetry/visit", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Telemetry must never disrupt Studio workflows.
  }
}

function maybeFlushOnBatchThreshold() {
  const totalOps =
    bucket.rendersStarted +
    bucket.dielinesStarted +
    bucket.domSvgCopies;
  if (totalOps >= 15) {
    flushToolUsageSummary();
  }
}

export function recordRenderStarted() {
  bucket.rendersStarted += 1;
  maybeFlushOnBatchThreshold();
}

export function recordRenderCompleted(expectedCoins: number) {
  bucket.rendersCompleted += 1;
  if (Number.isFinite(expectedCoins) && expectedCoins > 0) {
    bucket.expectedCoins += Math.round(expectedCoins);
  }
  maybeFlushOnBatchThreshold();
}

export function recordDielineStarted() {
  bucket.dielinesStarted += 1;
  maybeFlushOnBatchThreshold();
}

export function recordDielineCompleted(expectedCoins: number) {
  bucket.dielinesCompleted += 1;
  if (Number.isFinite(expectedCoins) && expectedCoins > 0) {
    bucket.expectedCoins += Math.round(expectedCoins);
  }
  maybeFlushOnBatchThreshold();
}

export function recordDomSvgCopy() {
  bucket.domSvgCopies += 1;
  maybeFlushOnBatchThreshold();
}

export function attachUsageTrackerLifecycle(): () => void {
  if (typeof window === "undefined") return () => undefined;
  activeListeners += 1;
  if (activeListeners > 1) {
    return () => {
      activeListeners = Math.max(0, activeListeners - 1);
      if (activeListeners === 0) flushToolUsageSummary();
    };
  }
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushToolUsageSummary();
  };
  const onPageHide = () => {
    flushToolUsageSummary();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    activeListeners = Math.max(0, activeListeners - 1);
    if (activeListeners === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      flushToolUsageSummary();
    }
  };
}
