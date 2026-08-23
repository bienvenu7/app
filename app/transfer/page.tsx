"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  Lock,
  ArrowDown,
} from "lucide-react";
import ui from "@/components/ui.module.scss";
import styles from "./transfer.module.scss";
import {
  AFRICAN_COUNTRIES,
  RUSSIA,
  getCountry,
  computeQuote,
  formatMoney,
  computeTransferAmounts,
  PAYMENT_METHODS,
  type Country,
  getCountryWithId,
} from "@/lib/data";
import { type TransferType } from "@/lib/storage";
import { Auth } from "@/providers/AuthContext";
import {
  useGetCountries,
  useGetDirections,
  useGetRate,
} from "@/hooks/useCountry";
import TypeStep from "@/components/transfert/TypeStep";
import AmountStep from "@/components/transfert/AmountStep";
import { ICountry, IDirection, IRate } from "@/types/country";
import { useGetNetworksById } from "@/hooks/useNetwork";
import FormStep from "@/components/transfert/FormStep";
import { INetworkResponse } from "@/types/networks";
import TermsStep from "@/components/transfert/TermsStep";
import { ITrasanctionData } from "@/types/transaction";
import moment from "moment";
import { useCreateTransaction } from "@/hooks/useTransaction";
import { toast } from "sonner";
import { ScheduleUnavailableModal } from "@/components/schedule-unavailable-modal";
import {
  isOutsideWorkingSchedule,
  timeZoneForCountryCode,
} from "@/lib/working-hours";
import { isForbiddenAuth } from "@/lib/auth-errors";
import type { IShedule } from "@/types/country";
import { useT } from "@/lib/i18n";

const TOTAL_STEPS = 4;

function TransferFlow() {
  const t = useT();
  const {
    state: { user, isLoading },
  } = Auth();

  const { countries } = useGetCountries();
  const { data: directions } = useGetDirections();

  const router = useRouter();
  const params = useSearchParams();
  const initialType = (params.get("type") as TransferType) || "send";

  const [step, setStep] = useState(0);
  const [type, setType] = useState<TransferType>(initialType);

  const [dir, setDir] = useState(1);
  const [africanCode, setAfricanCode] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [receiveAmount, setReceiveAmount] = useState<string>("");
  const [senderName, setSenderName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [payment, setPayment] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [feesIncluded, setFeesIncluded] = useState(true);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  // send: Russia -> Africa ; receive: Africa -> Russia
  const userCountry = useMemo(() => {
    return AFRICAN_COUNTRIES.find((e) => e.code === user?.Country?.name);
  }, [user]);

  const from: Country = useMemo(() => {
    return type === "send"
      ? userCountry!
      : (AFRICAN_COUNTRIES.find((e) => e.code === africanCode) ?? userCountry!);
  }, [userCountry, type, africanCode]);

  const to: Country = useMemo(() => {
    return type === "send"
      ? (AFRICAN_COUNTRIES.find((e) => e.code === africanCode) ?? userCountry!)
      : userCountry!;
  }, [userCountry, type, africanCode]);

  const countryTo = useMemo(() => {
    return (countries as ICountry[])?.find((e) => e.name === to?.code);
  }, [countries, to]);

  const countryFrom = useMemo(() => {
    return (countries as ICountry[])?.find((e) => e.name === from?.code);
  }, [countries, from]);

  const activeShedule = useMemo((): IShedule | undefined => {
    const list = (countries as ICountry[]) ?? [];
    return (
      countryFrom?.shedule ??
      countryTo?.shedule ??
      list.find((c) => c.name === "ru")?.shedule ??
      user?.Country?.shedule
    );
  }, [countries, countryFrom, countryTo, user]);

  const iltineraire = useMemo(() => {
    if (!directions) {
      return undefined;
    }
    return (directions as IDirection[]).find(
      (el) => el.code === `${from?.code}-${to?.code}`,
    );
  }, [directions, from, to]);

  useEffect(() => {
    if (!iltineraire) {
      setAmount("");
      return;
    }
    setAmount(iltineraire.min.toString());
  }, [iltineraire]);

  const { data: rateData } = useGetRate(iltineraire?.code);
  const { network: networks } = useGetNetworksById(countryTo?.id);

  const selectedNetwork = useMemo(() => {
    return (networks as INetworkResponse[])?.find((el) => el.id === payment);
  }, [networks, payment]);

  const amountNum = parseInt(amount, 10) || 0;
  const rate = parseFloat(rateData?.taux ?? "0");
  const transferAmounts = useMemo(
    () =>
      computeTransferAmounts(
        amountNum,
        iltineraire?.fee ?? 0,
        rate,
        feesIncluded,
      ),
    [amountNum, iltineraire, rate, feesIncluded],
  );
  const quote = useMemo(
    () => computeQuote(amountNum, from, to),
    [amountNum, from, to],
  );

  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const canNext = () => {
    if (step === 0) return !!type;
    if (step === 1)
      return (
        !!africanCode &&
        amountNum > 0 &&
        !!iltineraire &&
        amountNum >= iltineraire.min &&
        amountNum <= iltineraire.max
      );
    if (step === 2) {
      const expectedDigits = Number(iltineraire?.countryTo?.TelMaxNumber);
      const phoneDigits = recipientPhone.replace(/\D/g, "");
      return (
        !!senderName.trim() &&
        !!recipientName.trim() &&
        Number.isFinite(expectedDigits) &&
        expectedDigits > 0 &&
        phoneDigits.length === expectedDigits &&
        !!payment
      );
    }
    if (step === 3) return accepted;
    return false;
  };

  const handleBack = () => {
    if (step === 0) {
      router.push("/");
      return;
    }
    go(step - 1);
  };

  const stepTitles = [
    t("transfer.stepType"),
    t("transfer.stepAmount"),
    t("transfer.stepDetails"),
    t("transfer.stepTerms"),
  ];

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
  };

  const showRecap = step >= 1;

  const effectiveAmountToPayOut = parseInt(receiveAmount, 10) || 0;

  const transactionData: ITrasanctionData = {
    amountToSend: transferAmounts.totalToPay,
    amountToPayOut: effectiveAmountToPayOut,
    fees: transferAmounts.fee,
    networkId: payment,
    type: type === "send" ? "SEND" : "RECEIVE",
    receiverPhone: recipientPhone,
    senderName: senderName,
    receiverName: recipientName,
    code: iltineraire?.code!,
    clientEmail: user?.email ?? "",
    status: "WAITING" as any,
    origin: from?.code,
    dateTime: moment().format("DD-MM-YYYY"),
  };

  const { isCreatingTransaction, mutateAsync } =
    useCreateTransaction(transactionData);

  const handleNext = async () => {
    if (!canNext()) return;

    // Étape 2 (index 1) : vérifier les horaires de travail (heure locale)
    if (
      step === 1 &&
      isOutsideWorkingSchedule(
        activeShedule,
        timeZoneForCountryCode(from?.code) ??
          timeZoneForCountryCode(to?.code),
      )
    ) {
      setScheduleModalOpen(true);
      return;
    }

    if (step < TOTAL_STEPS - 1) {
      go(step + 1);
      return;
    }
    // last step -> save draft, go to validation
    await mutateAsync()
      .then((e) => {
        toast.success(t("transfer.successToast", { txid: e.txid }));
        const txId = e.id ?? e.txid;
        router.push(`/transfer/validate?id=${encodeURIComponent(txId)}`);
      })
      .catch((error) => {
        if (isForbiddenAuth(error)) {
          setScheduleModalOpen(true);
          return;
        }
        toast.error(t("transfer.errorToast"));
      });
  };

  // const createTransaction = async (
  //   event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  // ) => {
  //   event.preventDefault();

  //   await mutateAsync()
  //     .then((e) =>
  //       toast.success(`transfert ${e.txid} enregistré avec succèss!`),
  //     )
  //     .catch(() => {
  //       toast.error("Une erreur s'est produit, veuillez ressayer plkutard!");
  //     });
  // };

  return (
    <div className={styles.page}>
      <header className={ui.pageHeader}>
        <button
          className={ui.back}
          onClick={handleBack}
          aria-label={t("common.back")}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <div className={ui.title}>{t("transfer.newTransfer")}</div>
          <div className={ui.subtitle}>
            {t("transfer.stepOf", {
              current: step + 1,
              total: TOTAL_STEPS,
              title: stepTitles[step],
            })}
          </div>
        </div>
      </header>

      <div className={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={styles.progressStep}>
            <motion.span
              initial={false}
              animate={{ width: i <= step ? "100%" : "0%" }}
              transition={{ duration: 0.3 }}
            />
          </div>
        ))}
      </div>

      <div className={styles.stepArea}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {step === 0 && (
              <TypeStep
                type={type}
                setType={setType}
                userCountryName={
                  user?.Country?.pubicName || userCountry?.name || ""
                }
              />
            )}

            {step === 1 && (
              <AmountStep
                type={type}
                africanCode={africanCode}
                setAfricanCode={setAfricanCode}
                amount={amount}
                setAmount={setAmount}
                from={from}
                to={to}
                quote={quote}
                amountNum={amountNum}
                user={user!}
                rateData={rateData as IRate}
                iltineraire={iltineraire as IDirection}
                feesIncluded={feesIncluded}
                setFeesIncluded={setFeesIncluded}
                receiveAmount={receiveAmount}
                setReceiveAmount={setReceiveAmount}
              />
            )}

            {step === 2 && (
              <FormStep
                recipientPhone={recipientPhone}
                setRecipientPhone={setRecipientPhone}
                payment={payment}
                setPayment={setPayment}
                recipientName={recipientName}
                senderName={senderName}
                setRecipientName={setRecipientName}
                setSenderName={setSenderName}
                networks={networks as INetworkResponse[]}
                iltineraire={iltineraire as IDirection}
              />
            )}

            {step === 3 && (
              <TermsStep
                accepted={accepted}
                setAccepted={setAccepted}
                from={from}
                to={to}
                amountNum={amountNum}
                quote={quote}
                amount={amount}
                iltineraire={iltineraire!}
                rateData={rateData}
                feesIncluded={feesIncluded}
                recipientName={recipientName}
                recipientPhone={recipientPhone}
                selectedNetwork={selectedNetwork!}
                receiveAmount={receiveAmount}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {showRecap && (
          <motion.aside
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`${styles.recap} ${styles.recapAside}`}
          >
            <div className={styles.recapTop}>
              <span className={styles.tag}>
                {type === "send" ? (
                  <ArrowUpRight size={13} aria-hidden="true" />
                ) : (
                  <ArrowDownLeft size={13} aria-hidden="true" />
                )}
                {type === "send" ? t("transfer.send") : t("transfer.receive")}
              </span>
              <span>{t("transfer.recap")}</span>
            </div>
            <div className={styles.route}>
              <div className={styles.routeCountry}>
                <span className={styles.flag}>{from.flag}</span>
                <div className={styles.info}>
                  <div className={styles.cName}>{from.name}</div>
                  <div className={styles.cAmt}>
                    {amountNum > 0
                      ? formatMoney(transferAmounts.totalToPay, from)
                      : "—"}
                  </div>
                </div>
              </div>
              <span className={styles.arrow}>
                <ArrowRight aria-hidden="true" />
              </span>
              <div className={styles.routeCountry}>
                <span className={styles.flag}>{to.flag}</span>
                <div className={styles.info}>
                  <div className={styles.cName}>{to.name}</div>
                  <div className={styles.cAmt}>
                    {amountNum > 0 ? effectiveAmountToPayOut : "—"}
                  </div>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className={styles.footer}>
        {step > 0 && (
          <button className={`${ui.btn} ${ui.btnGhost}`} onClick={handleBack}>
            {t("common.back")}
          </button>
        )}
        <button
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={handleNext}
          disabled={!canNext() || isCreatingTransaction}
        >
          {step === TOTAL_STEPS - 1 ? t("common.save") : t("common.next")}
          <ArrowRight aria-hidden="true" />
        </button>
      </div>

      <ScheduleUnavailableModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        workingFrom={activeShedule?.workingFrom ?? 10}
        workingTo={activeShedule?.workingTo ?? 20}
      />
    </div>
  );
}

export default function TransferPage() {
  return (
    <Suspense fallback={null}>
      <TransferFlow />
    </Suspense>
  );
}
