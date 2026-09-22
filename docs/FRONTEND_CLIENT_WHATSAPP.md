# Guide app client — intégration WhatsApp (OTP + profil)

Document **unique** pour l’agent frontend de l’app client (web / mobile).
**Périmètre : API v3** (référence principale). Comportement identique sur les
routes legacy `/v2/clients/*` et `/v1/auth/*` sauf mention contraire.

**Ce guide prime** sur OpenAPI (`/reference`) en cas de conflit.

---

## En une phrase

À l’**inscription**, l’email est **obligatoire** et le numéro WhatsApp
**facultatif**. Si le numéro est saisi, l’OTP part sur **WhatsApp** ; sinon sur
**email**. À la **connexion**, l’utilisateur s’identifie avec **email OU
téléphone** ; l’OTP suit ce choix.

---

## 1. Format du numéro

### Regex serveur

```
^\d{9,15}$
```

| Valide         | Invalide                          |
| -------------- | --------------------------------- |
| `79025227326`  | `+79025227326`, `7 902 522 73 26` |
| `237612345678` | `9025227326` (sans indicatif)     |

Pas de normalisation côté serveur — valider avant envoi.

### Unicité

**Un même numéro ne peut être lié qu’à un seul compte** (inscription avec
`whatsappNumber` ou mise à jour profil `phone`).

| HTTP | Message |
| ---- | ------- |
| `409` | `Ce numéro est déjà associé à un autre compte.` |

Le frontend doit afficher cette erreur si l’utilisateur tente d’utiliser un
numéro déjà enregistré sur un autre compte.

### Noms de champs

| Contexte                                 | Champ                                |
| ---------------------------------------- | ------------------------------------ |
| Inscription (email, obligatoire)         | `email`                              |
| Inscription (numéro, facultatif)         | `whatsappNumber`                     |
| Connexion par téléphone                  | `phone`                              |
| Connexion par email                      | `email`                              |
| Verify / resend après OTP **email**      | `email`                              |
| Verify / resend après OTP **WhatsApp**   | `whatsappNumber` (ou `phone`)        |
| Mise à jour profil                       | `phone` → stocké en `whatsappNumber` |

---

## 2. Règle « email OU téléphone »

Sur **login**, **verify-otp**, **resend-otp**, **forgot-password** et
**reset-password** : envoyer **exactement un** des deux identifiants, jamais
les deux, jamais aucun.

```json
// Connexion par email
{ "email": "user@example.com", "password": "secret12" }

// Connexion par téléphone
{ "phone": "79025227326", "password": "secret12" }
```

### Canal OTP (automatique)

| Identifiant de connexion | OTP envoyé sur                 |
| ------------------------ | ------------------------------ |
| `email`                  | **Email**                      |
| `phone`                  | **WhatsApp** (au numéro saisi) |

Le frontend **ne choisit pas** le canal OTP : il découle du mode de connexion.

### Durées OTP

| Usage                            | TTL        |
| -------------------------------- | ---------- |
| Inscription / connexion / renvoi | **2 min**  |
| Mot de passe oublié              | **10 min** |

---

## 3. Inscription — `POST /v3/clients/register`

Email **obligatoire**, numéro **facultatif**. Un seul formulaire.

```http
POST /v3/clients/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secret12",
  "countryId": "550e8400-e29b-41d4-a716-446655440000",
  "fullName": "Jean Dupont",
  "gender": "M",
  "whatsappNumber": "79025227326"
}
```

| Champ                                                  | Obligatoire |
| ------------------------------------------------------ | ----------- |
| `email`, `password`, `countryId`, `fullName`, `gender` | oui         |
| `whatsappNumber`                                       | **non**     |

| Si `whatsappNumber`… | OTP via  | Réponse `otpChannel` |
| -------------------- | -------- | -------------------- |
| fourni et valide     | WhatsApp | `"whatsapp"`         |
| absent               | Email    | `"email"`            |

Numéro déjà utilisé par un autre compte → **`409`**.

**201 :**

```json
{
  "message": "Un code de vérification a été envoyé sur votre numéro WhatsApp.",
  "otpChannel": "whatsapp"
}
```

ou

```json
{
  "message": "Un code de vérification a été envoyé à votre adresse email.",
  "otpChannel": "email"
}
```

Puis vérification **alignée sur le canal OTP** (`otpChannel` de la réponse) :

**OTP email** (`otpChannel: "email"`) :

```json
{ "email": "user@example.com", "otp": "123456" }
```

**OTP WhatsApp** (`otpChannel: "whatsapp"`) — même numéro que `whatsappNumber` :

```json
{ "whatsappNumber": "79025227326", "otp": "123456" }
```

`phone` est aussi accepté (même valeur). Ne pas envoyer `email` si l’OTP est
parti sur WhatsApp.

---

## 4. Connexion — `POST /v3/auth/login`

### UI frontend (breaking)

Proposer **deux modes** (onglets ou toggle) :

1. **Par email** — champs `email` + `password`
2. **Par téléphone** — champs `phone` + `password`

Ne pas envoyer `email` et `phone` ensemble.

### Requêtes

**Mode email :**

```http
POST /v3/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secret12"
}
```

**Mode téléphone :**

```http
POST /v3/auth/login
Content-Type: application/json

{
  "phone": "79025227326",
  "password": "secret12"
}
```

### Réponses

| Statut | Sens                    |
| ------ | ----------------------- |
| `200`  | OTP envoyé              |
| `401`  | Identifiants incorrects |
| `405`  | Échec envoi OTP         |

**200 (login email) :**

```json
{
  "message": "done",
  "loginMethod": "email",
  "otpChannel": "email"
}
```

**200 (login téléphone) :**

```json
{
  "message": "done",
  "loginMethod": "phone",
  "otpChannel": "whatsapp"
}
```

Utiliser `loginMethod` et `otpChannel` pour l’écran OTP et pour le **resend**.

**Conserver en state local** le même identifiant (`email` ou `phone`) utilisé au login.

---

## 5. Vérification OTP — `POST /v3/auth/verify-otp`

Envoyer **le même identifiant que le canal OTP** :

| Contexte                         | Body                                      |
| -------------------------------- | ----------------------------------------- |
| Login / register → OTP email     | `{ "email", "otp" }`                      |
| Login téléphone                  | `{ "phone", "otp" }`                      |
| Register avec `whatsappNumber`   | `{ "whatsappNumber", "otp" }`             |

**Après login/register email :**

```json
{ "email": "user@example.com", "otp": "123456" }
```

**Après login téléphone :**

```json
{ "phone": "79025227326", "otp": "123456" }
```

**Après inscription avec numéro :**

```json
{ "whatsappNumber": "79025227326", "otp": "123456" }
```

→ `201` `{ "accessToken", "expiresIn" }` + cookie refresh.

Erreur OTP : `401` (message générique).

---

## 6. Renvoi OTP — `POST /v3/auth/resend-otp`

Même identifiant que le verify (pas le mot de passe) :

```json
{ "email": "user@example.com" }
```

```json
{ "phone": "79025227326" }
```

```json
{ "whatsappNumber": "79025227326" }
```

| Statut | Corps                                                         |
| ------ | ------------------------------------------------------------- |
| `200`  | `{ "message": "Si un compte existe, un code a été envoyé." }` |
| `429`  | Plafond par email (voir `FRONTEND_CLIENT_OTP_UPDATE.md`)      |

---

## 7. Mot de passe oublié

### `POST /v3/clients/forgot-password`

Même règle XOR :

```json
{ "email": "user@example.com" }
```

```json
{ "phone": "79025227326" }
```

| Identifiant | OTP |
| ----------- | --- |
| `email`     | Email |
| `phone`     | WhatsApp |

### `PATCH /v3/clients/reset-password`

Même identifiant + `otp` + `password` :

```json
{ "email": "user@example.com", "otp": "123456", "password": "newpass12" }
```

```json
{ "phone": "79025227326", "otp": "123456", "password": "newpass12" }
```

---

## 8. Mise à jour profil — `PATCH /v3/auth/update/user`

```json
{ "phone": "79025227326" }
```

- Format strict `^\d{9,15}$`
- **Un numéro = un seul compte** (`409` si déjà pris)
- Confirmation WhatsApp obligatoire si le numéro **change**
- Échec → rien enregistré (`400` / `503`)
- Timeout HTTP ≥ **15 s**

---

## 9. Notifications transaction (backend, aucun appel frontend)

Si le client a un `whatsappNumber` valide, AfruE envoie **WhatsApp** à la
place de l’email. Sinon, l’email reste le canal. Si WhatsApp échoue, **repli
email**.

| Événement                         | WhatsApp                         | Email (si pas de numéro / repli) |
| --------------------------------- | -------------------------------- | -------------------------------- |
| Transaction en cours              | message texte                    | `inprogress`                     |
| Transaction validée (reçu)        | PDF via `sendFileByUrl`          | PDF en pièce jointe              |
| Transaction échouée               | motif + consigne                 | `erreur`                         |
| Relance paiement (WAITING 15 min) | texte                            | `relance`                        |
| Transaction expirée (30 min)      | texte                            | `expire`                         |

Aucun changement d’API pour le frontend.

---

## 10. Parcours UI recommandés

### Connexion

```
[Toggle]  Email  |  Téléphone
     ↓
Si Email    → POST /login { email, password }
Si Tél.     → POST /login { phone, password }
     ↓
Stocker loginMethod + identifiant (email ou phone)
     ↓
Écran OTP :
  loginMethod=email  → « Consultez votre email »
  loginMethod=phone  → « Consultez votre WhatsApp »
     ↓
POST /verify-otp { email|phone, otp }  (même identifiant)
     ↓
POST /resend-otp { email|phone }       (si besoin)
```

### Inscription

```
[Formulaire] email (obligatoire), whatsappNumber (facultatif), password, …
     ↓
POST /register
     ↓
Si numéro saisi → OTP WhatsApp → POST /verify-otp { whatsappNumber, otp }
Sinon           → OTP email    → POST /verify-otp { email, otp }
```

---

## 11. Checklist frontend

- [ ] Login : toggle Email / Téléphone (un seul identifiant + password)
- [ ] Login : ne jamais envoyer `email` et `phone` ensemble
- [ ] OTP : réutiliser le **même identifiant** (email ou phone) pour verify et resend
- [ ] OTP : libellé selon `loginMethod` ou `otpChannel`
- [ ] Inscription : `email` obligatoire, `whatsappNumber` facultatif
- [ ] Inscription / profil : gérer `409` numéro déjà associé à un autre compte
- [ ] Inscription verify : `{ email, otp }` **ou** `{ whatsappNumber, otp }` selon `otpChannel`
- [ ] Mot de passe oublié : email **ou** phone, OTP sur le même canal
- [ ] Profil : format `phone` strict + confirmation WhatsApp

---

## 12. Plan de test

| #   | Scénario                                  | Attendu                              |
| --- | ----------------------------------------- | ------------------------------------ |
| 1   | Login `{ email, password }`               | `loginMethod: "email"`, OTP email    |
| 2   | Login `{ phone, password }`               | `loginMethod: "phone"`, OTP WhatsApp |
| 3   | Verify `{ phone, otp }` après login tel.  | `201` tokens                         |
| 4   | Verify `{ email, otp }` après login email | `201` tokens                         |
| 5   | Resend `{ phone }` après login tel.       | `200`                                |
| 6   | Login phone inconnu                       | `401`                                |
| 7   | Register sans `whatsappNumber`            | OTP email                            |
| 8   | Register avec `whatsappNumber`            | OTP WhatsApp                         |
| 8b  | Verify `{ whatsappNumber, otp }` ensuite  | `201` tokens                         |
| 9   | Body login avec email **et** phone        | `400` validation                     |

---

## 13. Breaking changes (résumé)

| Route                        | Changement                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- |
| `POST /v3/clients/register`  | `whatsappNumber` **optionnel** ; OTP WhatsApp si saisi, sinon email ; `+ otpChannel` |
| `POST /v3/auth/login`        | **`email` XOR `phone`** + password ; réponse `+ loginMethod`, `otpChannel` |
| `POST /v3/auth/verify-otp`   | **`email` XOR `phone` XOR `whatsappNumber`** + otp                         |
| `POST /v3/auth/resend-otp`   | **`email` XOR `phone` XOR `whatsappNumber`**                               |
| `PATCH /v3/auth/update/user` | format `phone` strict + confirmation WhatsApp                              |

**Documents complémentaires :**

- `FRONTEND_CLIENT_OTP_UPDATE.md` — 5 essais, `429` resend
- `FRONTEND_CLIENT_SECURITY_UPDATES.md` — tokens, cookies
