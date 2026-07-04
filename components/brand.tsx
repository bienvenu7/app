import styles from "./brand.module.scss"

export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <div className={`${styles.brand} ${size === "lg" ? styles.lg : ""}`}>
      <span className={styles.mark} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 4L20 19H4L12 4Z" fill="currentColor" />
        </svg>
      </span>
      <span className={styles.word}>
        AFRU<span className={styles.accent}>-E</span>
      </span>
    </div>
  )
}
