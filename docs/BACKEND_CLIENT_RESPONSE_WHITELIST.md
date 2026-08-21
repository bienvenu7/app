# Contrat réponses API — whitelist app client

**Destinataire :** agent / équipe backend  
**Source :** audit du frontend `money-transfer-app` (Août 2026)  
**Objectif :** ne renvoyer au client **que** les champs listés ici. Tout le reste doit être **omis** du JSON (pas `null`, pas `undefined` explicite).

> Ce fichier est le contrat **positif** (ce que l’UI lit vraiment).  
> Pour la liste des champs à retirer et le contexte sécurité, voir aussi `docs/BACKEND_STRIP_CLIENT_RESPONSE_FIELDS.md`.

## Règles

1. **Whitelist stricte** : si un champ n’apparaît pas dans le JSON cible ci-dessous, ne pas le renvoyer.
2. Scope = routes consommées par **cette app client** uniquement. Les payloads admin / ops restent sur les endpoints admin.
3. Ne jamais renvoyer : password / hash, refresh token en body, solde, admins, chemins serveur, flags internes.
4. Les **status HTTP** (200 / 201 / 400 / 401 / 403 / 404 / 429) restent utilisés. Le body d’erreur peut rester `{ "message": "…" }` ; le client mappe surtout le **code HTTP**.

---

## 1. Auth

### `POST /v1/auth/login`

Le client **n’utilise pas le body** de succès. Il ne lit que le statut HTTP (200 = OTP envoyé, 429 = rate limit).

```json
{ "message": "…" }
```

---

### `POST /v1/auth/verify-otp`

Champs lus : `accessToken` (alias accepté : `access_token`), `expiresIn`.

```json
{
  "accessToken": "<jwt>",
  "expiresIn": 900
}
```

**Ne pas renvoyer :** refresh token en body (cookie HttpOnly seulement), profil user, password.

---

### `GET /v1/auth/refresh-token`

```json
{
  "accessToken": "<jwt>",
  "expiresIn": 900
}
```

Cookie `refresh` HttpOnly (rotation). Jamais le refresh en JSON.

---

### `GET /v1/auth/logout`

Body ignoré. Statut HTTP suffit.

```json
{ "message": "…" }
```

---

### `POST /v1/auth/resend-otp`

Body ignoré. Statut HTTP suffit.

```json
{ "message": "…" }
```

---

### `POST /v2/clients/register`

```json
{ "message": "…" }
```

---

### `POST /v2/clients/forgot-password`

Toujours 200 (même si email inconnu).

```json
{ "message": "…" }
```

---

### `PATCH /v2/clients/reset-password`

```json
{ "message": "…" }
```

---

### `GET /v1/auth/get-auth`

Profil courant. **Seuls ces champs sont lus par l’UI.**

```json
{
  "id": "<uuid>",
  "email": "user@example.com",
  "fullName": "Jean Dupont",
  "whatsappNumber": "0612345678",
  "Country": {
    "id": "<uuid>",
    "name": "cg",
    "pubicName": "Congo",
    "shedule": {
      "workingDate": [1, 2, 3, 4, 5],
      "workingFrom": 10,
      "workingTo": 20
    }
  }
}
```

| Champ               | Usage frontend                           |
| ------------------- | ---------------------------------------- |
| `id`                | clé mutation profil                      |
| `email`             | affichage, login PIN, création TX, stats |
| `fullName`          | header, nav, profil, greeting            |
| `whatsappNumber`    | formulaire profil                        |
| `Country.id`        | select pays profil                       |
| `Country.name`      | matching code pays (`cg`, `ru`, …)       |
| `Country.pubicName` | libellé pays (transfert)                 |
| `Country.shedule.*` | horaires d’ouverture (fallback)          |

**Ne pas renvoyer :** `password`, `clientNumber`, `gender`, et sur `Country` : `currency`, `TelIndex`, `TelMaxNumber`, `formatNumber`, `createdAt`, solde, admins, `Fund`, `Cost`. Sur `shedule` : `id`, `countryId`, `CreatedAt`.

---

### `PATCH /v1/auth/update/user`

```json
{
  "message": "…",
  "requireRelogin": false
}
```

Ne pas renvoyer l’objet user complet.

---

## 2. Pays, directions, taux, réseaux, cartes

### `GET /v1/country/get-countries`

Tableau. Chaque item :

```json
{
  "id": "<uuid>",
  "name": "cg",
  "pubicName": "Congo",
  "shedule": {
    "workingDate": [1, 2, 3, 4, 5],
    "workingFrom": 10,
    "workingTo": 20
  }
}
```

| Champ                               | Usage                                 |
| ----------------------------------- | ------------------------------------- |
| `id`                                | select, fetch réseaux / cartes        |
| `name`                              | matching code (`ru`, `cg`, `cam`, …)  |
| `pubicName`                         | libellé + drapeau (register / profil) |
| `shedule.workingDate`               | jours ouverts (0–6)                   |
| `shedule.workingFrom` / `workingTo` | plage horaire locale                  |

**Ne pas renvoyer :** `currency`, `TelIndex`, `TelMaxNumber`, `formatNumber`, `createdAt`, `adimin`, `Fund`, `Cost`, `total` (solde).

> `GET /v1/country/get-country/:id` n’est **pas appelé** par l’UI actuelle. Si tu le gardes : même contrat.

---

### `GET /v2/directions/get`

Tableau. Chaque item :

```json
{
  "code": "ru-cg",
  "fee": 1.5,
  "min": 1000,
  "max": 500000,
  "countryTo": {
    "name": "cg",
    "formatNumber": "00000000",
    "TelMaxNumber": 9
  }
}
```

| Champ                    | Usage                                       |
| ------------------------ | ------------------------------------------- |
| `code`                   | matching `{from}-{to}`, fetch taux, body TX |
| `fee`                    | % frais                                     |
| `min` / `max`            | bornes montant                              |
| `countryTo.name`         | auto-détection réseau (cg / cam)            |
| `countryTo.formatNumber` | placeholder téléphone                       |
| `countryTo.TelMaxNumber` | longueur téléphone                          |

**Ne pas renvoyer :** `id`, `createdAt`, `updatedAt`, `constant`, `nameFrom`, `nameTo`, objet `countryFrom` entier, et sur `countryTo` : `pubicName`, `currency`, `TelIndex`.

---

### `GET /v1/rate/get/rate/:code`

Seul champ lu : `taux`.

```json
{ "taux": "650" }
```

**Ne pas renvoyer :** `id`, `iltineraire`, `code`, `Total`, `frais`, `intervalMin`, `intervalMax`.

---

### `GET /v1/network/get-networks/:countryId`

Tableau. Chaque item :

```json
{
  "id": "<uuid>",
  "name": "MTN",
  "pubicName": "MTN MoMo"
}
```

| Champ       | Usage                                        |
| ----------- | -------------------------------------------- |
| `id`        | sélection moyen de paiement → `networkId` TX |
| `name`      | libellé + matching opérateur (téléphone)     |
| `pubicName` | sous-libellé                                 |

**Ne pas renvoyer :** `createdAt`, `countryId`.

---

### `GET /v1/country/get/cards/:countryId`

Tableau. Filtré côté client par `isActive`. Chaque item :

```json
{
  "id": "<uuid>",
  "content": "https://… ou numéro / IBAN",
  "isLink": true,
  "isActive": true,
  "network": {
    "name": "SBP",
    "pubicName": "Système de paiement rapide"
  }
}
```

| Champ                        | Usage                                  |
| ---------------------------- | -------------------------------------- |
| `id`                         | key React                              |
| `content`                    | URL de paiement **ou** numéro à copier |
| `isLink`                     | `<a href>` vs texte + copy             |
| `isActive`                   | filtre affichage                       |
| `network.name` / `pubicName` | logo / libellé                         |

**Ne pas renvoyer :** `countryId`, `networkId`, `createdAt`, `updatedAt`, et sous `network` : `id`, `createdAt`, `countryId`.

---

## 3. Transactions

Même objet (item unique **ou** élément de liste) pour :

| Méthode | Route                                                      |
| ------- | ---------------------------------------------------------- |
| `POST`  | `/v2/transactions/create-one`                              |
| `PATCH` | `/v2/transactions/:transactionId`                          |
| `GET`   | `/v1/transaction/get/by-id/:transactionId`                 |
| `GET`   | `/v1/transaction/get/by-client/:clientEmail/:date`         |
| `GET`   | `/v2/transactions/client/transactions?startDate=&endDate=` |

```json
{
  "id": "<uuid>",
  "txid": "AF-123456",
  "code": "ru-cg",
  "type": "SEND",
  "status": "WAITING",
  "amountToSend": 10000,
  "amountToPayOut": 50000,
  "fees": 150,
  "senderName": "Jean Dupont",
  "receiverName": "Marie Martin",
  "receiverPhone": "061234567",
  "networkId": "<uuid>",
  "dateTime": "10-08-2026",
  "hour": "14h30",
  "createdAt": "2026-08-10T11:30:00.000Z",
  "Network": {
    "name": "MTN",
    "pubicName": "MTN MoMo"
  },
  "card": {
    "fullName": "Titulaire",
    "phone": "06…"
  }
}
```

`card` peut être **omis** s’il n’existe pas. `hour` peut être omis si `createdAt` est un ISO datetime (le client fallback dessus).

| Champ                                           | Usage                                                           |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `id`                                            | navigation validate, upload preuve, key liste                   |
| `txid`                                          | affichage, toast, fallback id, reçu                             |
| `code`                                          | route pays `from-to`                                            |
| `type`                                          | `SEND` / `RECEIVE` — stats, cartes, détails                     |
| `status`                                        | `WAITING` \| `INPROGRESS` \| `CONFIRMED` \| `ERROR` \| `FINISH` |
| `amountToSend` / `amountToPayOut` / `fees`      | montants UI + reçu                                              |
| `senderName` / `receiverName` / `receiverPhone` | détails + reçu                                                  |
| `networkId`                                     | fallback libellé si `Network` absent                            |
| `dateTime`                                      | fallback date si pas de `createdAt`                             |
| `hour`                                          | heure sur la carte historique                                   |
| `createdAt`                                     | tri, groupement par jour, date détails / reçu                   |
| `Network.name` / `pubicName`                    | moyen de paiement affiché                                       |
| `card.fullName` / `card.phone`                  | compte de paiement (écran validate)                             |

**Ne pas renvoyer :**

- `adminCheck`, `agencyPhone`, `agencyFullName`, `complain` (PII / flags internes)
- `files` (URIs documents)
- `Rate` (objet frais — déjà dans `fees`)
- `clientEmail`, `origin`
- `month`, `year`
- sur `Network` : `id`, `createdAt`, `countryId`
- sur `card` : `id`, `createdAt`, `updatedAt`, `networkId`, `countryId`, `network`

Après `POST create-one`, le client lit immédiatement `id` (ou `txid`) + `txid` (toast).

---

## 4. Fichiers

### `POST /v1/file/upload/:transactionId`

Le client **ignore le body** de succès (statut HTTP seulement).

```json
{ "ok": true }
```

**Ne pas renvoyer :** `filepath`, `uri`, `filename`, `mimetype`, `id`, `createdAt`, `transactionId`.

---

### `GET /v2/files/receipt?txid=&page=&limit=`

**Non consommé** par l’UI (hook mort). Ne pas élargir le payload. Préférable : 410 / ne plus exposer au client.

---

## 5. Chatbot

### `POST /v1/chatbot/message`

Le client lit, dans l’ordre : `reply` → `response` → `content` → `message` (string brute aussi acceptée).

Cible unique :

```json
{ "reply": "…" }
```

---

## 6. Endpoints **non consommés** par l’UI (ne pas enrichir / option 410)

| Méthode | Route                                                     | Note                |
| ------- | --------------------------------------------------------- | ------------------- |
| `GET`   | `/v1/country/get-country/:id`                             | hook jamais branché |
| `GET`   | `/v1/fee/get-fee/:networkId/:amount`                      | hook mort           |
| `GET`   | `/v1/country/get/cards/:networkId` (variante random card) | action morte        |
| `GET`   | `/v2/files/receipt`                                       | hook mort           |
| `POST`  | `/v1/auth/confirm-email`                                  | action morte        |
| `POST`  | `/v1/auth/resend-email`                                   | action morte        |

---

## 7. Routes déjà interdites au client

Ne **pas** exposer / répondre utilement :

| Méthode  | Path                                          |
| -------- | --------------------------------------------- |
| `DELETE` | `/delete-all-data`                            |
| `DELETE` | `/v1/auth/delete-clients`                     |
| `DELETE` | `/v1/auth/admin/delete`                       |
| `DELETE` | `/v1/transaction/delete`                      |
| `GET`    | `/v1/test-compression`                        |
| `GET`    | `/v1/file/get-all/files`                      |
| `*`      | `/v2/admin/*`, `/v2/stats/*`, `/v2/setting/*` |

---

## Checklist agent backend

- [ ] `get-auth` : uniquement `id`, `email`, `fullName`, `whatsappNumber`, `Country.{id,name,pubicName,shedule.{workingDate,workingFrom,workingTo}}`
- [ ] Pays publics : uniquement `id`, `name`, `pubicName`, `shedule` (3 champs)
- [ ] Directions : uniquement `code`, `fee`, `min`, `max`, `countryTo.{name,formatNumber,TelMaxNumber}`
- [ ] Taux : uniquement `taux`
- [ ] Réseaux : uniquement `id`, `name`, `pubicName`
- [ ] Cartes paiement : uniquement `id`, `content`, `isLink`, `isActive`, `network.{name,pubicName}`
- [ ] Transactions (5 routes) : contrat §3 — **sans** `adminCheck` / `agency*` / `complain` / `files` / `Rate` / `clientEmail`
- [ ] Upload : `{ ok: true }` sans `filepath`
- [ ] Chatbot : `{ reply }`
- [ ] Auth tokens : `accessToken` + `expiresIn` seulement
- [ ] Tests : login → get-auth → create TX → get-by-id → liste période → cards → upload → profil

Fausse sécurité : retirer un champ du type TypeScript **ne le retire pas** du JSON. Le strip doit être **côté API**.
