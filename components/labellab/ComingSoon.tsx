import Image from "next/image";
import styles from "./ComingSoon.module.css";

export default function ComingSoon() {
  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.content}>
        <Image
          src="/branding/hypermockup-icon.svg"
          alt="HyperMockup"
          width={88}
          height={88}
          priority
          unoptimized
          className={styles.icon}
        />
        <p className={styles.brand}>HyperMockup</p>
        <h1 className={styles.title}>Coming Soon</h1>
      </div>
    </main>
  );
}
