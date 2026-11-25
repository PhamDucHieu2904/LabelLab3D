import styles from "./ComingSoon.module.css";

export default function ComingSoon() {
  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.content}>
        <p className={styles.brand}>HyperMockup</p>
        <h1 className={styles.title}>Coming Soon</h1>
      </div>
    </main>
  );
}
