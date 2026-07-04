import { jsPDF } from "jspdf"
import { getCountry, getPaymentMethod, formatMoney, RUSSIA } from "./data"
import type { Transaction } from "./storage"

// Afrue palette
const NAVY = "#0e1522"
const GOLD = "#e8c064"
const CARD = "#16202f"
const TEXT = "#e9edf3"
const MUTED = "#93a1b5"
const LINE = "#26344a"

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso))
}

export function generateReceipt(tx: Transaction) {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const margin = 48

  // Background
  doc.setFillColor(NAVY)
  doc.rect(0, 0, W, doc.internal.pageSize.getHeight(), "F")

  // Header band
  doc.setFillColor(CARD)
  doc.rect(0, 0, W, 96, "F")
  doc.setTextColor(GOLD)
  doc.setFont("times", "bolditalic")
  doc.setFontSize(30)
  doc.text("Afrue", margin, 58)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.setTextColor(MUTED)
  doc.text("Reçu de transfert d'argent", margin, 76)

  doc.setTextColor(TEXT)
  doc.setFontSize(10)
  doc.text(tx.txid, W - margin, 58, { align: "right" })
  doc.setTextColor(MUTED)
  doc.text(formatDate(tx.createdAt), W - margin, 74, { align: "right" })

  const from = getCountry(tx.fromCode) ?? RUSSIA
  const to = getCountry(tx.toCode) ?? RUSSIA
  const pm = getPaymentMethod(tx.paymentMethod)

  let y = 150

  // Status badge
  doc.setFillColor(GOLD)
  doc.roundedRect(margin, y - 22, 132, 26, 13, 13, "F")
  doc.setTextColor(NAVY)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("PAIEMENT VALIDÉ", margin + 66, y - 5, { align: "center" })

  y += 34

  // Amount summary card
  const cardH = 118
  doc.setFillColor(CARD)
  doc.roundedRect(margin, y, W - margin * 2, cardH, 12, 12, "F")

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(MUTED)
  doc.text("Montant envoyé", margin + 20, y + 30)
  doc.text("Montant reçu", W - margin - 20, y + 30, { align: "right" })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(TEXT)
  doc.text(formatMoney(tx.amountSource, from), margin + 20, y + 56)
  doc.setTextColor(GOLD)
  doc.text(formatMoney(tx.received, to), W - margin - 20, y + 56, { align: "right" })

  doc.setDrawColor(LINE)
  doc.line(margin + 20, y + 76, W - margin - 20, y + 76)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(MUTED)
  doc.text(`Frais de transfert : ${formatMoney(tx.fee, from)}`, margin + 20, y + 98)
  doc.text(`${from.name}  ->  ${to.name}`, W - margin - 20, y + 98, { align: "right" })

  y += cardH + 36

  // Details
  const rows: [string, string][] = [
    ["Expéditeur", `${tx.senderFirstName} ${tx.senderLastName}`],
    ["Destinataire", `${tx.recipientFirstName} ${tx.recipientLastName}`],
    ["Téléphone destinataire", tx.recipientPhone],
    ["Moyen de paiement", pm ? `${pm.label} (${pm.hint})` : tx.paymentMethod],
    ["Pays d'envoi", from.name],
    ["Pays de réception", to.name],
    ["Type", tx.type === "send" ? "Envoi" : "Réception"],
    ["Identifiant transaction", tx.txid],
  ]

  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(TEXT)
  doc.text("Détails du transfert", margin, y)
  y += 18

  doc.setFontSize(10.5)
  rows.forEach(([label, value]) => {
    doc.setDrawColor(LINE)
    doc.line(margin, y + 14, W - margin, y + 14)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(MUTED)
    doc.text(label, margin, y + 6)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(TEXT)
    doc.text(value, W - margin, y + 6, { align: "right" })
    y += 30
  })

  y += 20
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(MUTED)
  doc.text(
    "Ce reçu confirme que le transfert a été traité par Afrue. Conservez-le comme preuve de paiement.",
    margin,
    y,
    { maxWidth: W - margin * 2 },
  )

  // Footer
  const fy = doc.internal.pageSize.getHeight() - 40
  doc.setDrawColor(LINE)
  doc.line(margin, fy - 14, W - margin, fy - 14)
  doc.setTextColor(GOLD)
  doc.setFont("times", "italic")
  doc.setFontSize(11)
  doc.text("Afrue — Transferts Russie <-> Afrique", margin, fy)

  doc.save(`recu-afrue-${tx.txid}.pdf`)
}
