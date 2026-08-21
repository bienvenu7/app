# Guide app client — migration API **v3** (Août 2026)

**Destinataire :** agent / équipe frontend (`money-transfer-app`)  
**Ce guide prime** sur OpenAPI `/reference` et sur les anciens appels `/v1` et `/v2`.  
**Backend déjà livré.** Ton job : basculer **toute** l’app client sur `/v3` et typer les réponses comme ci-dessous.

---

## Règles (à appliquer partout)

1. **Préfixe unique** : remplacer `/v1/...` et `/v2/...` des routes **client** par `/v3/...`. Les **bodies de requête ne changent pas**.
2. **Whitelist stricte** : ne lire / ne typer **que** les champs listés. Si un champ n’est pas dans le JSON cible, il **n’existe plus** (`adminCheck`, `files`, `Rate`, `password`, solde, etc.).
3. Un champ **omis** ≠ `null`. Tester avec `if (tx.card)` / `if (country.shedule)`, pas `=== null`.
4. Auth inchangée : `Authorization: Bearer <accessToken>` + `credentials: 'include'` (cookie `refresh` HttpOnly). Access TTL = **900 s**.
5. Erreurs : le client mappe surtout le **code HTTP** (400 / 401 / 403 / 404 / 429). Body typique `{ "message": "…" }`.
6. **Ne plus appeler** les routes admin, wipe, ou hooks morts (section 8).

Base URL : même host qu’aujourd’hui, seul le path change.

---

## 0. Table de migration (checklist)

Coche chaque ligne une fois le client HTTP + les types mis à jour.

| # | Ancien path | Nouveau path | Breaking réponse ? |
|---|-------------|--------------|--------------------|
| 1 | `POST /v1/auth/login` | `POST /v3/auth/login` | Non — `{ message }` ; 200 / 429 |
| 2 | `POST /v1/auth/verify-otp` | `POST /v3/auth/verify-otp` | Non — `{ accessToken, expiresIn }` |
| 3 | `GET /v1/auth/refresh-token` | `GET /v3/auth/refresh-token` | Non — `{ accessToken, expiresIn }` |
| 4 | `GET /v1/auth/logout` | `GET /v3/auth/logout` | Non — HTTP suffit |
| 5 | `POST /v1/auth/resend-otp` | `POST /v3/auth/resend-otp` | Non — HTTP suffit |
| 6 | `POST /v2/clients/register` | `POST /v3/clients/register` | Non — `{ message }` |
| 7 | `POST /v2/clients/forgot-password` | `POST /v3/clients/forgot-password` | Non — toujours 200 |
| 8 | `PATCH /v2/clients/reset-password` | `PATCH /v3/clients/reset-password` | Non — `{ message }` |
| 9 | `GET /v1/auth/get-auth` | `GET /v3/auth/get-auth` | **Oui** — profil allégé |
| 10 | `PATCH /v1/auth/update/user` | `PATCH /v3/auth/update/user` | Non — `{ message, requireRelogin }` |
| 11 | `GET /v1/country/get-countries` | `GET /v3/country/get-countries` | **Oui** — plus de currency / TelIndex / solde |
| 12 | `GET /v2/directions/get` | `GET /v3/directions/get` | **Oui** — plus d’`id` / `countryFrom` |
| 13 | `GET /v1/rate/get/rate/:code` | `GET /v3/rate/get/rate/:code` | Non — `{ taux }` |
| 14 | `GET /v1/network/get-networks/:countryId` | `GET /v3/network/get-networks/:id` | Non — `{ id, name, pubicName }` |
| 15 | `GET /v1/country/get/cards/:countryId` | `GET /v3/country/get/cards/:countryId` | **Oui** — cartes allégées |
| 16 | `POST /v2/transactions/create-one` | `POST /v3/transactions/create-one` | **Oui** — objet TX whitelist |
| 17 | `PATCH /v2/transactions/:transactionId` | `PATCH /v3/transactions/:transactionId` | **Oui** — objet TX whitelist |
| 18 | `GET /v1/transaction/get/by-id/:id` | `GET /v3/transaction/get/by-id/:transactionId` | **Oui** |
| 19 | `GET /v1/transaction/get/by-client/:email/:date` | `GET /v3/transaction/get/by-client/:clientEmail/:date` | **Oui** — tableau TX |
| 20 | `GET /v2/transactions/client/transactions` | `GET /v3/transactions/client/transactions` | **Oui — tableau brut, plus `{ transaction: [] }`** |
| 21 | `POST /v1/file/upload/:transactionId` | `POST /v3/file/upload/:transactionId` | Non — `{ ok: true }` ; HTTP suffit |
| 22 | `POST /v1/chatbot/message` | `POST /v3/chatbot/message` | Non — `{ reply }` |

Si tu as une constante `API_PREFIX` / `basePath`, la plus simple est :

```ts
const CLIENT_API = '/v3'; // plus de mix v1 + v2 pour l’app client
```

---

## 1. Auth

Bodies **identiques**. Cookie `refresh` : HttpOnly, ne pas lire en JS.

### Login

```http
POST /v3/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "secret123" }
```

- **200** → OTP envoyé (ignorer le body, afficher l’écran OTP)
- **429** → rate limit

### Verify OTP / refresh

```http
POST /v3/auth/verify-otp
{ "email": "user@example.com", "otp": "123456" }
```

```http
GET /v3/auth/refresh-token
```

```ts
type TokenResponse = {
  accessToken: string;
  expiresIn: number; // 900
};
```

Stocker `accessToken` + `Date.now() + expiresIn * 1000`. Interceptor : refresh avant expiration, retry 401 une fois.

### Logout / resend OTP

HTTP suffit. Bodies inchangés (`resend-otp` : `{ email }`).

### Register / forgot / reset

```http
POST /v3/clients/register
POST /v3/clients/forgot-password   // toujours 200 (anti-énumération)
PATCH /v3/clients/reset-password   // { email, otp, password }
```

Bodies inchangés. Succès = `{ message: string }`.

### Profil courant — **breaking**

```http
GET /v3/auth/get-auth
Authorization: Bearer <accessToken>
```

```ts
type AuthCountry = {
  id: string;
  name: string;       // code: "cg" | "ru" | "cam" | …
  pubicName: string;
  shedule?: {
    workingDate: number[]; // 0–6
    workingFrom: number;
    workingTo: number;
  };
};

type AuthProfile = {
  id: string;
  email: string;
  fullName: string;
  whatsappNumber: string;
  Country?: AuthCountry;
};
```

**Supprimé — ne plus lire :** `password`, `pin`, `clientNumber`, `gender`, `Country.currency`, `TelIndex`, `TelMaxNumber`, `formatNumber`, `createdAt`, solde, `Fund`, `Cost`, `shedule.id`.

### Update profil

```http
PATCH /v3/auth/update/user
```

Body inchangé (`username`, `phone`, `password?`, `countryId?`). **Ignorer `userID`.**

```ts
type UpdateUserResponse = {
  message: string;
  requireRelogin: boolean; // true si password changé → clear token + redirect login
};
```

---

## 2. Pays, directions, taux, réseaux, cartes

### Pays

```http
GET /v3/country/get-countries
```

Tableau de `AuthCountry` (mêmes champs). Plus de `currency` / `TelIndex` / `createdAt` / solde.

`GET /v3/country/get-country/:id` existe (même contrat) mais n’est **pas requis** si tu ne l’utilisais pas.

### Directions — **breaking**

```http
GET /v3/directions/get
```

```ts
type Direction = {
  code: string; // "ru-cg"
  fee: number;
  min: number;
  max: number;
  countryTo: {
    name: string;
    formatNumber: string;
    TelMaxNumber: number;
  };
};
```

**Supprimé :** `id`, `createdAt`, `updatedAt`, `constant`, `nameFrom`, `nameTo`, **tout** `countryFrom`, et sur `countryTo` : `pubicName`, `currency`, `TelIndex`.

Matching UI : `direction.code === `${from}-${to}``. Placeholder téléphone = `countryTo.formatNumber`. Longueur = `countryTo.TelMaxNumber`.

### Taux

```http
GET /v3/rate/get/rate/:code   // ex. ru-cg
```

```ts
type RateResponse = { taux: string }; // "650"
```

### Réseaux

```http
GET /v3/network/get-networks/:countryId
```

(`:id` dans le path = **countryId** UUID, comme avant.)

```ts
type Network = {
  id: string;
  name: string;
  pubicName: string;
};
```

### Cartes de paiement — **breaking**

```http
GET /v3/country/get/cards/:countryId
Authorization: Bearer <accessToken>
```

```ts
type PaymentCard = {
  id: string;
  content: string;    // URL ou numéro / IBAN à copier
  isLink: boolean;    // true → <a href>, false → texte + copy
  isActive: boolean;  // filtre encore côté UI
  network?: {
    name: string;
    pubicName: string;
  };
};
```

**Supprimé :** `countryId`, `networkId`, `createdAt`, `updatedAt`, `network.id`.

---

## 3. Transactions — **breaking (le plus important)**

Même type pour **create**, **patch**, **get-by-id**, **get-by-client**, **liste période**.

```ts
type TxStatus = 'WAITING' | 'INPROGRESS' | 'CONFIRMED' | 'ERROR' | 'FINISH';
type TxType = 'SEND' | 'RECEIVE';

type ClientTransaction = {
  id: string;
  txid: string;
  code: string;
  type: TxType;
  status: TxStatus;
  amountToSend: number;
  amountToPayOut: number;
  fees: number;
  senderName: string;
  receiverName: string;
  receiverPhone: string;
  networkId: string;
  dateTime: string;          // "10-08-2026"
  hour?: string;             // "14h30" — peut être omis
  createdAt: string;         // ISO — tri / groupement jour
  Network?: {
    name: string;
    pubicName: string;
  };
  card?: {
    fullName?: string;       // souvent omis (pas en DB)
    phone?: string;          // n° / IBAN de paiement (= Card.content)
  };
};
```

**Supprimé — casser les types / mappers qui les lisent :**

- `adminCheck`, `agencyPhone`, `agencyFullName`, `complain`
- `files` (preuves : tu les uploades, tu ne les relis pas)
- `Rate` (frais = `fees`)
- `clientEmail`, `origin`, `month`, `year`
- `Network.id`, `Network.createdAt`, `Network.countryId`
- `card.id`, `card.content`, `card.isLink`, `card.network`, …

Après `POST create-one` : lire `id` (et `txid` pour le toast).

### Create / patch — bodies inchangés

```http
POST /v3/transactions/create-one
Authorization: Bearer <accessToken>
```

Body = l’actuel `TransactionCreate` (`code`, `clientEmail`, `type`, montants, `networkId`, `fees`, `dateTime`, …).  
`clientEmail` est **ignoré** côté API (JWT). Tu peux continuer à l’envoyer.

```http
PATCH /v3/transactions/:transactionId
{ "status": "INPROGRESS", "senderNumber": "…", "hour": "14h30" }
```

Réponse **201** = `ClientTransaction`.

### Get by id

```http
GET /v3/transaction/get/by-id/:transactionId
```

**200** = un `ClientTransaction`. **404** si pas owner.

### Get by date (path email ignoré)

```http
GET /v3/transaction/get/by-client/:clientEmail/:date
```

`:date` = `DD-MM-YYYY`. `:clientEmail` peut rester (compat) : l’API scope au JWT.  
**200** = `ClientTransaction[]`.

### Liste période — **breaking forme**

```http
GET /v3/transactions/client/transactions?startDate=01-08-2026&endDate=31-08-2026
```

**Avant (v2) :**

```ts
{ transaction: ClientTransaction[] }
```

**Maintenant (v3) :**

```ts
ClientTransaction[]
```

À changer dans le hook / parser :

```ts
// avant
const list = data.transaction ?? [];

// après
const list = Array.isArray(data) ? data : [];
```

---

## 4. Fichiers & chatbot

```http
POST /v3/file/upload/:transactionId
Content-Type: multipart/form-data
```

Champ fichier = `file` (comme avant) + `comment` en body.  
Succès **201** `{ ok: true }` — **ne plus attendre** `filepath` / `uri` / `filename`.

```http
POST /v3/chatbot/message
Authorization: Bearer <accessToken>
{ "message": "…" }
```

```ts
type ChatbotResponse = { reply: string };
```

Bearer **obligatoire**. Plus de fallback `response` / `content` : v3 n’envoie que `reply`.

---

## 5. Types à coller (référence unique)

```ts
export type TokenResponse = { accessToken: string; expiresIn: number };

export type AuthProfile = {
  id: string;
  email: string;
  fullName: string;
  whatsappNumber: string;
  Country?: {
    id: string;
    name: string;
    pubicName: string;
    shedule?: {
      workingDate: number[];
      workingFrom: number;
      workingTo: number;
    };
  };
};

export type Direction = {
  code: string;
  fee: number;
  min: number;
  max: number;
  countryTo: { name: string; formatNumber: string; TelMaxNumber: number };
};

export type Network = { id: string; name: string; pubicName: string };

export type PaymentCard = {
  id: string;
  content: string;
  isLink: boolean;
  isActive: boolean;
  network?: { name: string; pubicName: string };
};

export type ClientTransaction = {
  id: string;
  txid: string;
  code: string;
  type: 'SEND' | 'RECEIVE';
  status: 'WAITING' | 'INPROGRESS' | 'CONFIRMED' | 'ERROR' | 'FINISH';
  amountToSend: number;
  amountToPayOut: number;
  fees: number;
  senderName: string;
  receiverName: string;
  receiverPhone: string;
  networkId: string;
  dateTime: string;
  hour?: string;
  createdAt: string;
  Network?: { name: string; pubicName: string };
  card?: { fullName?: string; phone?: string };
};
```

---

## 6. Où chercher dans le code frontend (hints)

À grep / remplacer en priorité :

- `'/v1/auth` → `'/v3/auth`
- `'/v2/clients` → `'/v3/clients`
- `'/v1/country` → `'/v3/country`
- `'/v2/directions` → `'/v3/directions`
- `'/v1/rate` → `'/v3/rate`
- `'/v1/network` → `'/v3/network`
- `'/v2/transactions` → `'/v3/transactions`
- `'/v1/transaction` → `'/v3/transaction`
- `'/v1/file` → `'/v3/file`
- `'/v1/chatbot` → `'/v3/chatbot`

Puis :

- types `get-auth` / `Country` trop larges
- types `Direction` qui lisent `countryFrom` / `id`
- types TX qui lisent `adminCheck` | `files` | `Rate` | `clientEmail` | `Network.id`
- hook liste période : `data.transaction`
- affichage carte validate : `tx.card?.phone` (plus `tx.card?.content`)
- chatbot : `data.reply` seulement

---

## 7. Parcours de test (obligatoire)

1. Register → OTP → login → `get-auth` (header = `fullName`, pays = `Country.name` / `pubicName`, horaires = `shedule`)
2. Directions + taux + réseaux + cartes paiement (`isLink` / copy `content`)
3. Create TX → toast `txid` → page validate (`id`)
4. Upload preuve → 201, pas besoin du body
5. Get-by-id + liste période (tableau) + historique groupé par `createdAt`
6. Patch profil → `requireRelogin === false` ; changement password → `true` + redirect login
7. Refresh interceptor (laisser expirer l’access, navigation continue)
8. Logout
9. 429 sur login (spam) affiché

---

## 8. Ne plus appeler (app client)

| Méthode | Path | Pourquoi |
|---------|------|----------|
| `GET` | `/v1/country/get-country/:id` | hook jamais branché (v3 existe mais inutile) |
| `GET` | `/v1/fee/get-fee/:networkId/:amount` | hook mort |
| `GET` | `/v1/country/get/cards/:networkId` (carte random) | action morte — utiliser `/v3/country/get/cards/:countryId` |
| `GET` | `/v2/files/receipt` ou `/v3/files/receipt` | **410** — hook mort |
| `POST` | `/v1/auth/confirm-email` / `resend-email` | actions mortes |
| `DELETE` | `/delete-all-data`, `/v1/auth/delete-clients`, `/v1/transaction/delete`, … | interdits |
| `*` | `/v2/admin/*`, `/v2/stats/*`, `/v2/setting/*` | admin only |

---

## 9. Ce qui ne change **pas**

- Formes des **bodies** (login, register, create TX, patch TX, upload multipart, chatbot `message`)
- Cookie refresh + Bearer
- Codes HTTP
- Ownership : l’API ignore l’email path / `clientEmail` body et scope au JWT
- `credentials: 'include'`

Le backend v1/v2 reste en ligne pour l’admin. L’**app client ne doit plus les consommer**.
