# Calculs d’une transaction SEND

Ce document décrit **tous les calculs** utilisés côté frontend pour créer une
transaction de type **SEND** (envoi), ainsi que le **formatage automatique du
numéro destinataire** et la **détection automatique du réseau**. Source de
vérité du code :

| Rôle | Fichier |
| ---- | ------- |
| Formules | `lib/data.ts` (`computeTransferAmounts`, `computeSendAmountFromPayout`) |
| Saisie montants / frais | `components/transfert/AmountStep.tsx` |
| Téléphone + auto-réseau | `components/transfert/FormStep.tsx`, `lib/detect-network.ts` |
| Payload API | `app/transfer/page.tsx` |
| Affichage contrat | `components/transfert/TermsStep.tsx` |

`computeQuote` (`lib/data.ts`) **n’est pas utilisé** pour le montant réel d’un
SEND : c’est un stub à 1,5 % et taux 1:1.

---

## 1. Sens du flux SEND

- **Origine (`from`)** : pays de l’utilisateur connecté.
- **Destination (`to`)** : pays africain choisi.
- **Itinéraire** : direction dont le `code` vaut `{from.code}-{to.code}`
  (ex. `ru-cam`).
- **Taux** : `GET /rate/get/rate/{code}` → `{ taux: string }`.
- **Frais %** : `iltineraire.fee` (déjà en pourcentage, ex. `5` = 5 %).

Le montant saisi est un **entier** (chiffres uniquement). Le taux est un
`float`.

```
amountNum     = parseInt(amount, 10) || 0
rate          = parseFloat(rateData.taux ?? "0")
feePercent    = iltineraire.fee || 0
feeRate       = feePercent / 100
feesIncluded  = true par défaut
```

Bornes de l’itinéraire (sur le montant **saisi** `amountNum`, pas sur le total
payé ni sur le payout) :

```
iltineraire.min  ≤  amountNum  ≤  iltineraire.max
```

À la sélection d’un itinéraire, le champ envoi est initialisé à `iltineraire.min`.

---

## 2. Grandeurs calculées

| Symbole | Champ code | Unité | Signification |
| ------- | ---------- | ----- | ------------- |
| \(A\) | `amount` / `amountNum` | devise `from` | Montant saisi côté envoi |
| \(P\) | `receiveAmount` / `amountToPayOut` | devise `to` | Montant reçu par le destinataire |
| \(f\) | `fee` | devise `from` | Frais de service |
| \(T\) | `totalToPay` | devise `from` | Ce que le client paie (`amountToSend` API) |
| \(C\) | `convertAmount` | devise `from` | Montant net converti |
| \(r\) | `rate` (`taux`) | `to / from` | Taux de change de l’itinéraire |
| \(p\) | `feePercent` | % | Frais de l’itinéraire |
| \(\tau\) | `feeRate` | fraction | \(p / 100\) |

Payload envoyé à `POST transactions/create-one` :

```
amountToSend    = T     (totalToPay)
amountToPayOut  = P     (entier saisi / affiché côté réception)
fees            = f
type            = "SEND"
code            = iltineraire.code
origin          = from.code
```

---

## 3. Mode « frais inclus » (`feesIncluded = true`)

C’est le **mode par défaut**. Le montant saisi \(A\) **est** le total à payer.
Les frais sont extraits de \(A\) (formule type TTC → HT), puis le net est
converti.

### 3.1 Direct : saisie du montant envoyé \(A\)

```
feeRate        = feePercent / 100
fee            = (A × feeRate) / (1 + feeRate)
convertAmount  = A − fee
totalToPay     = A
amountToPayOut = round(convertAmount × rate)
```

Équivalent compact :

\[
f = \frac{A \cdot \tau}{1 + \tau},\quad
C = \frac{A}{1 + \tau},\quad
T = A,\quad
P = \mathrm{round}(C \cdot r)
\]

Le `fee` **n’est pas arrondi** dans ce mode (seul \(P\) l’est via `Math.round`).
L’affichage `formatMoney` arrondit ensuite à l’entier.

### 3.2 Inverse : saisie du montant reçu \(P\)

Dès que l’utilisateur édite le champ « destinataire reçoit », le mode frais
inclus est **forcé** (`setFeesIncluded(true)`).

```
si P ≤ 0 ou rate ≤ 0  →  A = 0
si feeRate ≥ 1        →  A = 0
sinon A = round( (P × (1 + feeRate)) / rate )
```

\[
A = \mathrm{round}\left(\frac{P \cdot (1 + \tau)}{r}\right)
\]

C’est l’inverse de \(P = C \cdot r\) avec \(C = A / (1 + \tau)\), aux arrondis
près.

---

## 4. Mode « frais en plus » (`feesIncluded = false`)

Le montant saisi \(A\) est le **montant converti**. Les frais s’ajoutent au
total à payer.

Disponible uniquement tant que l’utilisateur saisit le montant **envoyé**
(les options de frais sont masquées en saisie côté réception).

### 4.1 Direct : saisie du montant envoyé \(A\)

```
fee            = round(A × feeRate)
convertAmount  = A
totalToPay     = A + fee
amountToPayOut = round(A × rate)
```

\[
f = \mathrm{round}(A \cdot \tau),\quad
C = A,\quad
T = A + f,\quad
P = \mathrm{round}(A \cdot r)
\]

Ici le `fee` **est arrondi** (`Math.round`).

### 4.2 Inverse (non exposé dans l’UI actuelle)

La fonction `computeSendAmountFromPayout(..., feesIncluded = false)` existe
mais n’est **pas appelée** : la saisie du payout force toujours `feesIncluded = true`.

```
A = round(P / rate)
```

---

## 5. Arrondis et formatage

| Opération | Règle |
| --------- | ----- |
| Saisie | uniquement des chiffres (`replace(/\D/g, "")`) |
| Affichage champ | `Math.round(value)` en chaîne ; vide si `≤ 0` |
| `amountToPayOut` (frais inclus) | `Math.round(convertAmount * rate)` |
| `amountToPayOut` (frais en plus) | `Math.round(amount * rate)` |
| `fee` (frais inclus) | **pas** d’arrondi dans le calcul |
| `fee` (frais en plus) | `Math.round(amount * feeRate)` |
| Inverse payout → send | `Math.round(...)` |
| `formatMoney` | `Math.round` + `Intl.NumberFormat("fr-FR")` sans décimales |

Si \(A \le 0\), tout est à zéro :

```
{ fee: 0, totalToPay: 0, convertAmount: 0, amountToPayOut: 0 }
```

---

## 6. Exemples numériques

Hypothèses : \(p = 5\) % donc \(\tau = 0{,}05\), \(r = 6{,}5\), \(A = 10\,000\).

### 6.1 Frais inclus

```
fee            = (10000 × 0.05) / 1.05  = 476.190476…
convertAmount  = 10000 − 476.190476…    = 9523.809523…
totalToPay     = 10000
amountToPayOut = round(9523.809523… × 6.5) = round(61904.7619…) = 61905
```

Vérification inverse :

```
A = round( (61905 × 1.05) / 6.5 ) = round(10000.038…) = 10000
```

### 6.2 Frais en plus

```
fee            = round(10000 × 0.05) = 500
convertAmount  = 10000
totalToPay     = 10500
amountToPayOut = round(10000 × 6.5)  = 65000
```

API correspondante :

| Champ | Frais inclus | Frais en plus |
| ----- | ------------ | ------------- |
| `amountToSend` | 10 000 | 10 500 |
| `fees` | 476.190… | 500 |
| `amountToPayOut` | 61 905 | 65 000 |

---

## 7. Chaîne UI → calcul → API

1. L’utilisateur choisit **SEND**, puis le pays destinataire.
2. L’app charge l’itinéraire (`fee`, `min`, `max`) et le taux `taux`.
3. Saisie **envoi** \(A\) → `computeTransferAmounts` → \(f, T, C, P\).
4. Saisie **réception** \(P\) → frais inclus forcé → `computeSendAmountFromPayout`
   → \(A\), puis recalcul du détail via `computeTransferAmounts`.
5. Contrôle : `min ≤ A ≤ max`.
6. Création :

```
amountToSend   = totalToPay
amountToPayOut = parseInt(receiveAmount, 10) || 0
fees           = fee
type           = "SEND"
```

Le payout envoyé à l’API est l’entier **affiché** (`receiveAmount`), pas un
recalcul flottant au moment du POST. En mode saisie envoi, cet entier est
maintenu égal à `Math.round(amountToPayOut)`.

---

## 8. Lecture d’une transaction déjà créée

Pour l’affichage / reçu (`lib/transaction-utils.ts`) :

```
baseAmount  = amountToSend − fees     // équivalent de convertAmount
totalAmount = amountToSend            // total payé
received    = amountToPayOut
```

Cela reste cohérent avec les deux modes : \(T - f = C\).

---

## 9. Numéro du destinataire (automatisé)

Le numéro n’est **pas prérempli**. Il est **contraint et normalisé** à partir
de l’itinéraire (`iltineraire.countryTo`), à l’étape « Détails ».

Sources API (direction `GET /directions/get`) :

| Champ | Usage UI |
| ----- | -------- |
| `countryTo.name` | pays destinataire (`cg`, `cam`, …) → détection réseau |
| `countryTo.formatNumber` | placeholder du champ (ex. `00000000`) |
| `countryTo.TelMaxNumber` | longueur exacte attendue (ex. `9`) |

### 9.1 Normalisation à la saisie

À chaque frappe / collage (`FormStep`) :

```
recipientPhone = value.replace(/\D/g, "")
maxLength      = Number(countryTo.TelMaxNumber)
```

- uniquement des **chiffres** ;
- longueur plafonnée par `TelMaxNumber` (`maxLength` HTML) ;
- pas d’indicatif pays ajouté automatiquement (`TelIndex` n’est plus renvoyé
  sur la direction).

Le champ est marqué invalide (`aria-invalid`) dès qu’il est non vide et que
sa longueur **diffère** de `TelMaxNumber`.

### 9.2 Validation pour passer à l’étape suivante

Dans `canNext()` (étape 2) :

```
expectedDigits = Number(iltineraire.countryTo.TelMaxNumber)
phoneDigits    = recipientPhone.replace(/\D/g, "")

ok ⇔  expectedDigits fini et > 0
      et phoneDigits.length === expectedDigits
      et senderName / recipientName non vides
      et payment (networkId) renseigné
```

Le body API envoie ce numéro **tel quel** (chiffres déjà nettoyés) :

```
receiverPhone = recipientPhone
```

---

## 10. Choix automatique du réseau

Les réseaux affichés viennent de `GET /network/get-networks/:countryId`, où
`countryId` est l’id du pays **destinataire**. Chaque réseau a `id`, `name`,
`pubicName`.

### 10.1 Pays concernés

L’auto-détection n’est active que si `countryTo.name` est **Congo** ou
**Cameroun** (`lib/detect-network.ts`) :

| Code API | Alias acceptés | Pays |
| -------- | -------------- | ---- |
| `cg` | `congo`, `cog` | Congo |
| `cam` | `cm`, `cmr`, `cameroon`, `cameroun` | Cameroun |

Sinon (`civ`, `sen`, `ru`, …) : l’utilisateur **choisit manuellement** le
chip réseau. Les boutons restent cliquables.

Si le pays est `cg` / `cam` :

- les chips sont **verrouillés** (`disabled`) ;
- un hint explique que le réseau est détecté d’après le numéro ;
- un `useEffect` recalcule le réseau à chaque changement de numéro.

### 10.2 Algorithme

```
digits   = phone.replace(/\D/g, "")
country  = normalizeCountryCode(countryTo.name)     // "cg" | "cam" | null
operator = premier préfixe qui matche digits        // "mtn" | "airtel" | "orange"
network  = networks.find(n =>
             `${n.name} ${n.pubicName}`.toLowerCase().includes(operator)
           )
payment  = network.id   // sinon ""
```

Règles de matching :

1. extraire les chiffres du numéro ;
2. identifier l’opérateur par **préfixe** (le premier qui `startsWith`) ;
3. retrouver le réseau API dont `name` ou `pubicName` **contient** cet
   opérateur (`mtn`, `airtel`, `orange`) ;
4. poser `payment = network.id`.

Si le préfixe est inconnu ou le numéro trop court pour matcher : `payment`
est **vidé**. Tant que `payment` est vide, `canNext()` bloque.

### 10.3 Préfixes Congo (`cg`)

| Opérateur | Préfixes |
| --------- | -------- |
| MTN | `06` |
| Airtel | `05`, `04` |

Exemples (`TelMaxNumber` typique = 9) :

| Numéro | Opérateur | Réseau |
| ------ | --------- | ------ |
| `061234567` | mtn | réseau dont le nom contient « mtn » |
| `051234567` | airtel | réseau dont le nom contient « airtel » |
| `041234567` | airtel | idem |
| `031234567` | — | aucun, sélection vidée |

### 10.4 Préfixes Cameroun (`cam`)

| Opérateur | Préfixes |
| --------- | -------- |
| MTN | `650`–`654`, `671`–`679`, `681`–`684` |
| Orange | `655`–`659`, `690`–`699`, `640`–`641`, `686`–`689` |

Les plages Orange sont expansées en préfixes à 3 chiffres
(`[655,659] → "655"…"659"`). Le matching se fait dès que le numéro **commence**
par l’un de ces préfixes (pas besoin d’attendre les 9 chiffres).

Exemples :

| Numéro | Opérateur |
| ------ | --------- |
| `677123456` | mtn |
| `655123456` | orange |
| `690000000` | orange |
| `612123456` | — (préfixe inconnu) |

### 10.5 Payload

```
networkId     = payment          // id du réseau détecté ou choisi
receiverPhone = recipientPhone   // chiffres, longueur = TelMaxNumber
```
