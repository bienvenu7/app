"use client";

import Link from "next/link";
import { useMemo } from "react";
import moment from "moment";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Inbox } from "lucide-react";
import { TransactionHistoryCard } from "@/components/transaction-history-card";
import styles from "./home.module.scss";
import { Auth } from "@/providers/AuthContext";
import { useGetTransactionStatsMonthly } from "@/hooks/useTransaction";
import Loading from "@/components/Loading";
import { ITrasanctionResponse } from "@/types/transaction";
import { useT } from "@/lib/i18n";

function sortKey(tx: ITrasanctionResponse) {
  const raw = tx.createdAt ?? tx.dateTime;
  const parsed = moment(raw, ["DD-MM-YYYY", moment.ISO_8601], true);
  return parsed.isValid() ? parsed.valueOf() : moment(raw).valueOf();
}

export default function HomePage() {
  const t = useT();
  const {
    state: { user, isLoading },
  } = Auth();

  const { stats, isGettingStats } = useGetTransactionStatsMonthly(user?.email);

  const recentTransactions = useMemo(() => {
    return [...((stats?.transactions ?? []) as ITrasanctionResponse[])]
      .sort((a, b) => sortKey(b) - sortKey(a))
      .slice(0, 4);
  }, [stats?.transactions]);

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07 } },
  };
  const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0 },
  };

  if (isLoading) {
    return (
      <div
        className={styles.hero}
        style={{ padding: "48px 0", textAlign: "center" }}
      >
        <Loading />
      </div>
    );
  }

  return (
    <motion.div
      className={styles.page}
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.section
        variants={item}
        className={`${styles.hero} ${styles.pageIntro}`}
      >
        <span className={styles.badge}>
          <span className={styles.pulse} aria-hidden="true" />
          {t("home.badge")}
        </span>
        <h1 className={styles.heroTitle}>
          {t("home.titleBefore")} <br />
          <span className={styles.ru}>{t("home.russia")}</span> {t("home.and")}{" "}
          <span className={`${styles.af} serif`}>{t("home.africa")}</span>
        </h1>
        <p className={styles.heroSub}>{t("home.subtitle")}</p>
      </motion.section>

      <motion.div
        variants={item}
        className={`${styles.actions} ${styles.pageActions}`}
      >
        <Link href="/transfer?type=send" className={styles.action}>
          <span className={styles.icon}>
            <ArrowUpRight aria-hidden="true" />
          </span>
          <div>
            <div className={styles.label}>{t("common.send")}</div>
            <div className={styles.desc}>{t("home.sendDesc")}</div>
          </div>
        </Link>
        <Link
          href="/transfer?type=receive"
          className={`${styles.action} ${styles.receive}`}
        >
          <span className={styles.icon}>
            <ArrowDownLeft aria-hidden="true" />
          </span>
          <div>
            <div className={styles.label}>{t("common.receive")}</div>
            <div className={styles.desc}>{t("home.receiveDesc")}</div>
          </div>
        </Link>
      </motion.div>

      <motion.div
        variants={item}
        className={`${styles.stats} ${styles.pageStats}`}
      >
        <div className={styles.stat}>
          {isGettingStats ? (
            <Loading />
          ) : (
            <>
              <div className={styles.value}>{stats?.total ?? 0}</div>
              <div className={styles.caption}>{t("home.transfersThisMonth")}</div>
            </>
          )}
        </div>
        <div className={styles.stat}>
          {isGettingStats ? (
            <Loading />
          ) : (
            <>
              <div className={styles.value}>{stats?.send ?? 0}</div>
              <div className={styles.caption}>{t("home.sendsThisMonth")}</div>
            </>
          )}
        </div>
        <div className={styles.stat}>
          {isGettingStats ? (
            <Loading />
          ) : (
            <>
              <div className={styles.value}>{stats?.receive ?? 0}</div>
              <div className={styles.caption}>{t("home.receivesThisMonth")}</div>
            </>
          )}
        </div>
      </motion.div>

      <motion.section variants={item} className={styles.pageRecent}>
        <div className={styles.sectionHead}>
          <h2>{t("home.recentTransactions")}</h2>
          {stats?.total > 0 && (
            <Link href="/transactions">{t("home.seeAll")}</Link>
          )}
        </div>

        <div className={styles.recentPanel}>
          {isGettingStats ? (
            <div className={styles.recentLoading}>
              <Loading />
            </div>
          ) : stats?.total === 0 ? (
            <div className={styles.empty}>
              <Inbox aria-hidden="true" />
              <div>{t("home.noTransactions")}</div>
            </div>
          ) : (
            <div className={styles.recentList}>
              {recentTransactions.map((tx) => (
                <TransactionHistoryCard key={tx.id ?? tx.txid} tx={tx} />
              ))}
            </div>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}
