import styles from "./brand.module.scss"

type BrandSize = "md" | "lg" | "auth"

export function Brand({ size = "md" }: { size?: BrandSize }) {
  return (
    <div className={`${styles.brand} ${styles[size]}`}>
      <span className={styles.mark} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" />
      </span>
      <span className={styles.word}>
        AFRU<span className={styles.accent}>-E</span>
      </span>
    </div>
  )
}
