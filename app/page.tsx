"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Inbox } from "lucide-react";
import { TransactionRow } from "@/components/transaction-row";
import {
  getTransactions,
  type Transaction,
} from "@/lib/storage";
import styles from "./home.module.scss";
import { Auth } from "@/providers/AuthContext";
import { useGetTransactonByEmail } from "@/hooks/useTransaction";
import { actualDate } from "@/utils/moment";
import Loading from "@/components/Loading";
import { ITrasanctionResponse } from "@/types/transaction";

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

  const [txs, setTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    setTxs(getTransactions());
  }, []);

  // const sendCount = txs.filter((t) => t.type === "send").length;
  // const receiveCount = txs.filter((t) => t.type === "receive").length;

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
      <div className={styles.hero} style={{ padding: "48px 0", textAlign: "center" }}>
        <Loading />
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.section variants={item} className={styles.hero}>
        <span className={styles.badge}>
          <span className={styles.pulse} aria-hidden="true" />
          Rapidité · Sécurité · Fiabilité
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

      <motion.div variants={item} className={styles.actions}>
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

      <motion.div variants={item} className={styles.stats}>
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

      <motion.section variants={item}>
        <div className={styles.sectionHead}>
          <h2>Transactions récentes</h2>
          {totalCount > 0 && <Link href="/transactions">Tout voir</Link>}
        </div>

        {totalCount === 0 ? (
          <div className={styles.empty}>
            <Inbox aria-hidden="true" />
            <div>Aucune transaction pour l&apos;instant.</div>
          </div>
        ) : (
          <div className="serif-none">
            {txs.slice(0, 4).map((tx) => (
              <TransactionRow key={tx.txid} tx={tx} />
            ))}
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}
