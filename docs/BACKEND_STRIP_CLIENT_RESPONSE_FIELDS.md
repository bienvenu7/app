# Backend — champs à retirer des réponses API (app client)

**Destinataire :** agent / équipe backend  
**Contexte :** audit app client Next.js (`money-transfer-app`) — Août 2026  
**Objectif :** alléger les payloads renvoyés au **client** et supprimer les fuites PII / flags internes **non utilisés** par l’UI.

> Ce document **prime** pour le scope « réponse client ».  
> Complète `docs/FRONTEND_CLIENT_SECURITY_UPDATES.md` (ownership, auth, routes interdites).

---

## Règles générales

1. **Ne plus renvoyer** au client les champs listés ci-dessous (les omettre du JSON, pas les mettre à `null`).
2. Scope = routes **consommées par l’app client** uniquement (pas forcément les routes admin internes).
3. Si un champ est encore utile côté **admin / ops**, le garder uniquement sur les endpoints admin (jamais sur les réponses client).
4. Après changement : vérifier qu’OpenAPI `/reference` est aligné (ou marqué obsolète au profit de ce guide).

### Priorité

| Priorité | Action |
|----------|--------|
| **P0** | Retirer flags / PII non affichés (`adminCheck`, `agency*`, `complain`, `files` inutiles) |
| **P1** | Alléger objets imbriqués morts (`Rate`, métadonnées réseau/carte) |
| **P2** | Nettoyage mineur (`month`/`year`, profil `clientNumber`, etc.) |

---

## 1. Transactions — réponses à stripper

Les mêmes champs apparaissent sur **plusieurs** méthodes qui renvoient une transaction (objet ou liste).  
Appliquer le strip sur **toutes** les réponses transaction **client** ci-dessous.

### Méthodes concernées

| Méthode | Route | Forme de réponse |
|---------|-------|------------------|
| `POST` | `/v2/transactions/create-one` | 1 transaction |
| `PATCH` | `/v2/transactions/:transactionId` | 1 transaction |
| `GET` | `/v1/transaction/get/by-id/:transactionId` | 1 transaction |
| `GET` | `/v1/transaction/get/by-client/:clientEmail/:date` | liste de transactions |
| `GET` | `/v2/transactions/client/transactions?startDate=&endDate=` | liste de transactions |

> Note : le path `:clientEmail` est déjà **ignoré** pour le scope (JWT). Ne pas s’en servir pour filtrer la réponse.

### Champs à RETIRER de chaque objet transaction (P0)

| Champ | Raison | Risque si conservé |
|-------|--------|-------------------|
| `adminCheck` | Jamais lu par le client | Flag / workflow interne exposé au navigateur |
| `agencyPhone` | Jamais lu / affiché | PII tiers (agence) |
| `agencyFullName` | Jamais lu / affiché | PII tiers (agence) |
| `complain` | Jamais lu / affiché | Contenu sensible / PII |
| `files` | Jamais lu (preuves uploadées côté client, pas lues depuis la TX) | URIs / chemins de documents exposés |

### Champs à RETIRER (P1 — poids mort / surface inutile)

| Champ | Raison |
|-------|--------|
| `Rate` (objet `IFee` complet) | Jamais lu ; les frais utiles sont déjà dans `fees` |
| `month` | Jamais lu (le client utilise `dateTime` / `createdAt`) |
| `year` | Jamais lu |
| `origin` | Écrit à la création, jamais relu en réponse |
| `clientEmail` | Ownership = JWT ; inutile (et PII en echo) dans la réponse client |

### Sous-objets à ALLÉGER (pas supprimer entièrement)

#### `Network` (garder minimal)

**Garder :** `id`, `name`, `pubicName`  
**Retirer :** `createdAt`, `countryId` (et tout autre champ interne)

#### `card` (garder minimal — affiché sur l’écran validate)

**Garder :** `fullName`, `phone`  
**Retirer :** `id`, `createdAt`, `updatedAt`, `networkId`, `countryId`, `network` (objet imbriqué complet)

### Contrat réponse transaction client (cible)

Champs **autorisés** (utilisés par l’app) :

```json
{
  "id": "<uuid>",
  "txid": "…",
  "code": "ru-cg",
  "type": "SEND",
  "status": "WAITING",
  "amountToSend": 100,
  "amountToPayOut": 50000,
  "fees": 5,
  "senderName": "Jean",
  "receiverName": "Marie",
  "receiverPhone": "06…",
  "networkId": "<uuid>",
  "dateTime": "10-08-2026",
  "hour": "14h30",
  "createdAt": "…",
  "Network": {
    "id": "<uuid>",
    "name": "…",
    "pubicName": "…"
  },
  "card": {
    "fullName": "…",
    "phone": "…"
  }
}
```

`card` peut être omis si absent. Ne **pas** inclure : `adminCheck`, `agency*`, `complain`, `files`, `Rate`, `month`, `year`, `origin`, `clientEmail`.

---

## 2. Upload fichier — réponse

| Méthode | Route |
|---------|-------|
| `POST` | `/v1/file/upload/:transactionId` |

L’app client **ignore** entièrement le body de succès (elle ne lit pas `id`, `filepath`, etc.).

### À faire (P1)

- Réponse minimale OK, par ex. :

```json
{ "ok": true }
```

ou

```json
{ "message": "uploaded", "count": 1 }
```

### À RETIRER si encore renvoyés

| Champ | Risque |
|-------|--------|
| `filepath` | Chemin serveur |
| `uri` / URL absolue non nécessaire | Fuite d’accès fichier |
| Métadonnées internes inutiles | Surface inutile |

---

## 3. Reçu (receipt) — si endpoint encore exposé au client

| Méthode | Route |
|---------|-------|
| `GET` | `/v2/files/receipt?txid=&page=&limit=` |

L’app client **n’appelle plus** cet endpoint (code mort).  
Si tu le laisses pour plus tard : **owner-only** déjà requis ; ne pas renvoyer de chemins serveur bruts.

Pas d’action urgente de strip UI, mais **ne pas élargir** le payload.

---

## 4. Profil / auth — réponses

### `GET /v1/auth/get-auth`

| Champ | Action |
|-------|--------|
| `password` / hash | **Ne jamais renvoyer** (déjà le cas normalement — confirmer) |
| `clientNumber` | **Retirer** de la réponse client (jamais affiché) — P2 |
| `gender` | Optionnel : garder si besoin produit ; **non relu** actuellement par l’UI post-login |

**Garder :** `id`, `email`, `fullName`, `whatsappNumber`, `Country` (public only), éventuellement `gender` si tu veux le réafficher plus tard.

### `PATCH /v1/auth/update/user`

Réponse actuelle utile :

```json
{
  "message": "…",
  "requireRelogin": true
}
```

Ne pas renvoyer l’objet user complet avec champs internes.

### `POST /v1/auth/verify-otp`

**Garder uniquement :**

```json
{
  "accessToken": "<jwt>",
  "expiresIn": 900
}
```

**Ne pas renvoyer :** refresh token en body (cookie HttpOnly seulement), password, profil complet inutile.

---

## 5. Pays publics (rappel — déjà partiellement fait)

| Méthode | Route |
|---------|-------|
| `GET` | `/v1/country/get-countries` |
| `GET` | `/v1/country/get-country/:id` |

### Ne plus renvoyer (si encore présents)

- `adimin` / admins  
- `Fund` / `Cost`  
- `total` (solde)

### Contrat public (garder)

`id`, `pubicName`, `name`, `currency`, `TelIndex`, `TelMaxNumber`, `formatNumber`, `createdAt`, `shedule`

---

## 6. Directions & taux

### `GET /v2/directions/get`

**Utilisé par le client :** `code`, `fee`, `min`, `max`, `countryTo.name`, `countryTo.formatNumber`, `countryTo.TelMaxNumber`

**Peuvent être retirés / allégés (P2) :**

- `constant`, `nameFrom`, `nameTo`
- `id`, `createdAt`, `updatedAt` (si non nécessaires)
- Objet `countryFrom` entier (non lu)
- Sur `countryTo` : `pubicName`, `currency`, `TelIndex` (non lus aujourd’hui)

### `GET /v1/rate/get/rate/:code`

**Seul champ lu par le client :** `taux`

**Peuvent être retirés (P2) :** `id`, `iltineraire`, `code`, `Total`, `frais`, `intervalMin`, `intervalMax`

Exemple cible :

```json
{ "taux": "650" }
```

(ou garder un wrapper minimal compatible)

---

## 7. Cartes / réseaux (écrans paiement)

### `GET /v1/country/get/cards/:countryId`

**Utilisé :** `id`, `content`, `isLink`, `isActive`, `network.name`, `network.pubicName`

**Retirer (P2) :** `countryId`, `networkId`, `createdAt`, `updatedAt`, et sous-champs réseau inutiles (`createdAt`, `countryId`)

### `GET /v1/network/get-networks/:id`

**Utilisé :** `id`, `name`, `pubicName`  
**Retirer :** `createdAt`, `countryId`

### `GET /v1/fee/get-fee/:networkId/:amount`

**Non consommé** par l’UI actuelle (hook mort).  
Option backend : déprécier / 410 pour le client, ou laisser sans élargir le payload. **Pas prioritaire** pour le strip P0.

---

## 8. Routes déjà interdites au client (ne pas réactiver)

Ne **pas** exposer / répondre utilement au client :

| Méthode | Path |
|---------|------|
| `DELETE` | `/delete-all-data` |
| `DELETE` | `/v1/auth/delete-clients` |
| `DELETE` | `/v1/auth/admin/delete` |
| `DELETE` | `/v1/transaction/delete` |
| `GET` | `/v1/test-compression` |
| `GET` | `/v1/file/get-all/files` |
| `*` | `/v2/admin/*`, `/v2/stats/*`, `/v2/setting/*` |

L’app client a **arrêté** d’appeler `/v2/stats/clients-monthly-stats` et `/v2/setting/shedule` — confirmer qu’elles restent 403/410 hors admin.

---

## Checklist agent backend

- [ ] **P0** Strip TX sur les 5 routes §1 : `adminCheck`, `agencyPhone`, `agencyFullName`, `complain`, `files`
- [ ] **P1** Strip TX : `Rate`, `month`, `year`, `origin`, `clientEmail` (réponse)
- [ ] **P1** Alléger `Network` + `card` imbriqués
- [ ] **P1** Upload : réponse minimale sans `filepath`
- [ ] **P2** `get-auth` : retirer `clientNumber` (et password si présent)
- [ ] **P2** `rate/get/rate/:code` : ne garder que `taux` (ou équivalent)
- [ ] **P2** Directions / cards / networks : alléger métadonnées
- [ ] Confirmer pays publics sans solde/admins
- [ ] Tests : login → create TX → get-by-id → liste période → upload → profil : payloads sans champs P0

### Test rapide (curl / Postman)

1. Créer une TX client → body **sans** `adminCheck` / `agency*` / `complain` / `files`
2. `GET .../get/by-id/:id` du owner → même strip
3. `GET .../client/transactions?...` → chaque item stripé
4. Upload preuve → pas de `filepath` serveur
5. `GET get-auth` → pas de password / pas de `clientNumber` (si P2 fait)

---

## Référence frontend (pourquoi on strip)

Audit app client : ces champs sont **typés parfois** mais **jamais lus** pour l’UI.  
Les garder dans la réponse = exposition navigateur (DevTools / mémoire), pas un affichage.

Fausse sécurité : retirer un champ du type TypeScript client **ne le retire pas** du JSON — le strip doit être **côté API**.

---

## Contact / conflit

Si conflit avec OpenAPI `/reference` → **ce fichier + `FRONTEND_CLIENT_SECURITY_UPDATES.md` priment** pour l’app client.
