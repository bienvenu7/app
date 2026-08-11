# Guide app client — mises à jour sécurité API (Août 2026)

Document pour l’**agent frontend de l’app client** (afrue.com / app).  
**Ce guide prime** sur OpenAPI (`/reference`) si conflit.

Convention :
- `credentials: 'include'` / `withCredentials: true` partout (cookie refresh)
- Header auth : `Authorization: Bearer <accessToken>`
- Access TTL = **900 s (15 min)** — refresh avant expiration

---

## Table des routes à mettre à jour (checklist agent)

| # | Méthode | Route | Action frontend |
|---|---------|-------|-----------------|
| 1 | `POST` | `/v1/auth/login` | Gérer `429` ; inchangé sinon |
| 2 | `POST` | `/v1/auth/verify-otp` | Lire `expiresIn` ; cookie refresh auto |
| 3 | `GET` | `/v1/auth/refresh-token` | **Nouveau flux obligatoire** (interceptor) |
| 4 | `POST` | `/v2/clients/forgot-password` | **Nouveau** écran étape 1 |
| 5 | `PATCH` | `/v2/clients/reset-password` | **Nouveau** body avec `otp` |
| 6 | `PATCH` | `/v1/auth/update/user` | Ne plus compter sur `userID` ; lire `requireRelogin` |
| 7 | `POST` | `/v2/transactions/create-one` | `clientEmail` ignoré (forcer soi) |
| 8 | `PATCH` | `/v2/transactions/:transactionId` | 404 si pas owner |
| 9 | `GET` | `/v2/files/receipt` | Owner only |
| 10 | `POST` | `/v1/file/upload/:transactionId` | Bearer + MIME strict |
| 11 | `POST` | `/v1/chatbot/message` | **Bearer obligatoire** |
| 12 | `GET` | `/v1/country/get-countries` | Champs publics seulement |
| — | *retirer* | routes wipe / `get-all/files` | Voir section « Ne plus appeler » |

Aliases v1 reset : `/v1/auth/forgot-password`, `/v1/auth/update-password` (mêmes bodies que v2).

---

## 1. Auth — login / OTP / refresh

### 1.1 Login (inchangé + rate limit)

```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secret123"
}
```

**Réponse 200** : message OTP envoyé (contrat existant).  
**429** : trop de tentatives (20 / 15 min / IP) → message UI.

### 1.2 Verify OTP (breaking réponse)

```http
POST /v1/auth/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Réponse 201** :
```json
{
  "accessToken": "<jwt>",
  "expiresIn": 900
}
```

**Cookie Set-Cookie** (ne pas lire en JS) :
- `refresh=<jwt>` ; `HttpOnly` ; `SameSite=Lax` ; maxAge 7 jours

**À faire** :
- Stocker `accessToken` + `expiresIn` (timestamp `Date.now() + expiresIn * 1000`)
- Ne **pas** stocker de refresh en `localStorage`

### 1.3 Refresh access (breaking — à brancher)

```http
GET /v1/auth/refresh-token
Cookie: refresh=<cookie>
```

Pas de body. `credentials: include` **obligatoire**.

**Réponse 200** :
```json
{
  "accessToken": "<nouveau-jwt>",
  "expiresIn": 900
}
```
+ nouveau cookie `refresh` (rotation).

**401** → logout + redirect `/login`.

**Interceptor recommandé** :
1. Si access expire dans < 60 s **ou** réponse 401
2. Appeler `GET /v1/auth/refresh-token`
3. Retry la requête d’origine avec le nouvel access
4. Si refresh échoue → logout

### 1.4 Logout

```http
GET /v1/auth/logout
Authorization: Bearer <accessToken>
```

Clear storage local + cookie côté serveur.

### 1.5 Profil courant

```http
GET /v1/auth/get-auth
Authorization: Bearer <accessToken>
```

**Réponse** : client **sans** champ `password`.

---

## 2. Mot de passe oublié (breaking)

### Ancien (SUPPRIMÉ — ne plus envoyer)

```json
{ "email": "...", "password": "nouveau" }
```

### Étape A — demander OTP

```http
POST /v2/clients/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

Alias : `POST /v1/auth/forgot-password`

**Réponse 200** (toujours, même si email inconnu) :
```json
{
  "message": "Si un compte existe pour cet email, un code de réinitialisation a été envoyé."
}
```

OTP email, validité **10 min**. UI : écran « entrez le code ».

### Étape B — reset avec OTP

```http
PATCH /v2/clients/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456",
  "password": "nouveauMotDePasse"
}
```

Alias : `PATCH /v1/auth/update-password` (même body).

| Champ | Type | Contrainte |
|-------|------|------------|
| `email` | string | email valide |
| `otp` | string | **exactement 6** caractères |
| `password` | string | min **6** |

**Réponse 200** :
```json
{
  "message": "Le mot de passe a été réinitialisé avec succès. Veuillez vous reconnecter."
}
```

| Status | Cas |
|--------|-----|
| 400 | validation Zod |
| 403 | OTP invalide / expiré |
| 429 | rate limit |

Après succès : clear auth + redirect login.

```ts
await api.post('/v2/clients/forgot-password', { email });
await api.patch('/v2/clients/reset-password', { email, otp, password: newPassword });
clearAuthStorage();
router.push('/login');
```

---

## 3. Update profil (breaking soft)

```http
PATCH /v1/auth/update/user
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "username": "Jean Dupont",
  "phone": "0612345678",
  "countryId": "<uuid-optionnel>",
  "password": "nouveauSiChangement",
  "userID": "<ignoré-optionnel>"
}
```

| Champ | Obligatoire | Notes |
|-------|-------------|-------|
| `username` | non | → `fullName` |
| `phone` | non | → `whatsappNumber` |
| `countryId` | non | uuid |
| `password` | non | min 6 ; hashé serveur |
| `userID` | non | **ignoré** — toujours le JWT |

**Réponse 200** :
```json
{
  "message": "Vos identifiants ont été mises à jour correctement, ...",
  "requireRelogin": true
}
```

- `requireRelogin: true` si password changé → clear storage + login  
- `requireRelogin: false` sinon

---

## 4. Transactions & fichiers (ownership)

### 4.1 Créer une transaction

```http
POST /v2/transactions/create-one
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "code": "ru-cg",
  "clientEmail": "ignored@example.com",
  "type": "SEND",
  "amountToSend": 100,
  "amountToPayOut": 50000,
  "fees": 5,
  "receiverName": "Marie",
  "senderName": "Jean",
  "receiverPhone": "06...",
  "networkId": "<uuid>",
  "status": "WAITING",
  "dateTime": "10-08-2026"
}
```

**Important** : `clientEmail` du body est **ignoré** — l’API force l’email du JWT.  
Montants : encore acceptés tels quels (pas de recalcul serveur dans ce lot).

### 4.2 Update transaction client

```http
PATCH /v2/transactions/:transactionId
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "status": "INPROGRESS",
  "senderNumber": "123456",
  "hour": "14h30"
}
```

`status` ∈ `WAITING | INPROGRESS | CONFIRMED | ERROR`  
**404** si la tx n’appartient pas au client.

### 4.3 Liste / détail

| Méthode | Route | Notes |
|---------|-------|-------|
| `GET` | `/v2/transactions/client/transactions?startDate=dd-mm-yyyy&endDate=dd-mm-yyyy` | Scoped owner OK |
| `GET` | `/v1/transaction/get/by-id/:transactionId` | **404** si pas owner |
| `GET` | `/v1/transaction/get/by-client/:clientEmail/:date` | Path `clientEmail` **ignoré** — email JWT |

### 4.4 Upload preuve

```http
POST /v1/file/upload/:transactionId
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file: <fichier>
comment: "preuve paiement"
```

| Règle | Valeur |
|-------|--------|
| Auth | **avant** upload |
| MIME | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| Taille | max 10 Mo / fichier, max 10 fichiers |
| Owner | **404** si tx d’un autre |

**400** si type non autorisé.

### 4.5 Autres fichiers

| Méthode | Route | Attendu |
|---------|-------|---------|
| `POST` | `/v1/file/upload/delete/:id` | Bearer ; delete file **owner** only |
| `GET` | `/v2/files/receipt?txid=<transactionUuid>&page=1&limit=10` | Bearer ; receipt owner only (sinon null) |
| `GET` | `/v1/file/get-by-country/files/:transactionId` | Bearer ; **uniquement** fichiers du client (param pays ignoré pour le scope) |

---

## 5. Chatbot (breaking)

```http
POST /v1/chatbot/message
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "message": "Comment faire un transfert ?"
}
```

| Champ | Contrainte |
|-------|------------|
| `message` | string non vide, **max 2000** caractères |

**Réponse 200** :
```json
{ "reply": "..." }
```

| Status | Cas |
|--------|-----|
| 401/403 | pas de token |
| 400 | message vide / trop long |
| 429 | rate limit chatbot |

**Avant** : public. **Maintenant** : JWT client obligatoire.

---

## 6. Pays publics (réponse allégée)

```http
GET /v1/country/get-countries
GET /v1/country/get-country/:id
```

**Réponse** — champs publics seulement, **plus** de :
- `adimin` / admins  
- `Fund` / `Cost`  
- `total` (solde)

Exemple :
```json
{
  "id": "...",
  "pubicName": "Congo",
  "name": "cg",
  "currency": "XAF",
  "TelIndex": "+242",
  "TelMaxNumber": 9,
  "formatNumber": "00000000",
  "createdAt": "...",
  "shedule": { }
}
```

Mettre à jour les types TS / sélecteurs UI qui lisaient `total` ou `adimin`.

---

## 7. Ne plus appeler

| Méthode | Path |
|---------|------|
| `DELETE` | `/delete-all-data` |
| `DELETE` | `/v1/auth/delete-clients` |
| `DELETE` | `/v1/auth/admin/delete` |
| `DELETE` | `/v1/transaction/delete` |
| `GET` | `/v1/test-compression` |
| `GET` | `/v1/file/get-all/files` |
| * | `/v2/admin/*`, `/v2/stats/*`, `/v2/setting/*`, … |

→ **410** ou **403**.

---

## 8. Checklist agent frontend client

- [ ] Interceptor refresh (`GET /v1/auth/refresh-token` + credentials)
- [ ] Écran forgot → OTP → reset (`email` + `otp` + `password`)
- [ ] Profil : ignorer `userID` ; si `requireRelogin` → logout
- [ ] Création tx : ne pas dépendre de `clientEmail` body
- [ ] Upload : Bearer + JPEG/PNG/WebP/PDF
- [ ] Chatbot : Bearer
- [ ] Pays : adapter types (plus de solde/admins)
- [ ] Gérer 401 / 403 / 404 / 429

### QA
1. Login → access 15 min → refresh → nouvelle requête OK  
2. Forgot → OTP mail → reset → login nouveau mdp  
3. Token A + txid de B → 404  
4. Chatbot sans token → 401/403  
5. Upload `.exe` → 400  

---

## Dépannage

1. Cookie refresh absent → credentials / CORS  
2. Reset sans `otp` → 400  
3. 404 tx → ownership  
4. OpenAPI obsolète → **ce guide prime**
