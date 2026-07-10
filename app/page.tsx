"use client";

import Link from "next/link";
import { useMemo } from "react";
import moment from "moment";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Inbox } from "lucide-react";
import { TransactionHistoryCard } from "@/components/transaction-history-card";
import styles from "./home.module.scss";
import { Auth } from "@/providers/AuthContext";
import { useGetTransactonByEmail } from "@/hooks/useTransaction";
import { actualDate } from "@/utils/moment";
import Loading from "@/components/Loading";
import { ITrasanctionResponse } from "@/types/transaction";

function sortKey(tx: ITrasanctionResponse) {
  const raw = tx.createdAt ?? tx.dateTime;
  const parsed = moment(raw, ["DD-MM-YYYY", moment.ISO_8601], true);
  return parsed.isValid() ? parsed.valueOf() : moment(raw).valueOf();
}

export default function HomePage() {
  const {
    state: { user, isLoading },
  } = Auth();

  const { transactions, isGettingTransaction } = useGetTransactonByEmail(
    user?.email,
    actualDate,
  );

  const sendCount = useMemo(() => {
    if (!transactions) {
      return 0;
    }
    return (transactions as ITrasanctionResponse[])?.filter(
      (t) => t.type === "SEND",
    ).length;
  }, [transactions]);

  const receiveCount = useMemo(() => {
    if (!transactions) {
      return 0;
    }
    return (transactions as ITrasanctionResponse[])?.filter(
      (t) => t.type === "RECEIVE",
    ).length;
  }, [transactions]);

  const totalCount = useMemo(() => {
    if (!transactions) {
      return 0;
    }
    return (transactions as ITrasanctionResponse[])?.length;
  }, [transactions]);

  const recentTransactions = useMemo(() => {
    return [...((transactions as ITrasanctionResponse[]) ?? [])]
      .sort((a, b) => sortKey(b) - sortKey(a))
      .slice(0, 4);
  }, [transactions]);

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
          Fiabilité · Rapidité · Sécurité
        </span>
        <h1 className={styles.heroTitle}>
          Transferts d&apos;argent entre <br />
          <span className={styles.ru}>la Russie</span> et{" "}
          <span className={`${styles.af} serif`}>l&apos;Afrique.</span>
        </h1>
        <p className={styles.heroSub}>
          Envoyez ou recevez de l&apos;argent en quelques secondes, au meilleur
          taux.
        </p>
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
            <div className={styles.label}>Envoyer</div>
            <div className={styles.desc}>Vers l&apos;Afrique</div>
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
            <div className={styles.label}>Recevoir</div>
            <div className={styles.desc}>Depuis la Russie</div>
          </div>
        </Link>
      </motion.div>

      <motion.div
        variants={item}
        className={`${styles.stats} ${styles.pageStats}`}
      >
        <div className={styles.stat}>
          {isGettingTransaction ? (
            <Loading />
          ) : (
            <>
              <div className={styles.value}>{totalCount}</div>
              <div className={styles.caption}>Transferts ce mois</div>
            </>
          )}
        </div>
        <div className={styles.stat}>
          {isGettingTransaction ? (
            <Loading />
          ) : (
            <>
              <div className={styles.value}>{sendCount}</div>
              <div className={styles.caption}>Envois ce mois</div>
            </>
          )}
        </div>
        <div className={styles.stat}>
          {isGettingTransaction ? (
            <Loading />
          ) : (
            <>
              <div className={styles.value}>{receiveCount}</div>
              <div className={styles.caption}>Réceptions ce mois</div>
            </>
          )}
        </div>
      </motion.div>

      <motion.section variants={item} className={styles.pageRecent}>
        <div className={styles.sectionHead}>
          <h2>Transactions récentes</h2>
          {totalCount > 0 && <Link href="/transactions">Tout voir</Link>}
        </div>

        <div className={styles.recentPanel}>
          {isGettingTransaction ? (
            <div className={styles.recentLoading}>
              <Loading />
            </div>
          ) : totalCount === 0 ? (
            <div className={styles.empty}>
              <Inbox aria-hidden="true" />
              <div>Aucune transaction pour l&apos;instant.</div>
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
