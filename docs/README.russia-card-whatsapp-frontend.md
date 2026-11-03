# Envoi carte Russie / Sénégal par WhatsApp — app client

**Destinataire :** agent IA frontend de `money-transfer-app`.  
**API :** préfixe `/v3/transactions`  
**Auth :** JWT **client** uniquement (même token que create / patch / get-by-id).  
**Backend déjà livré.** Ce fichier est la source de vérité pour cet endpoint.

```http
Authorization: Bearer <accessToken>
```

Cookie `refresh` HttpOnly : `credentials: 'include'` comme les autres appels client.  
Access TTL = **900 s**. En `403`, refresh puis retry une fois.

Tu n’inventes ni carte, ni réseau, ni montant. L’API choisit la carte et envoie le message WhatsApp. La réponse HTTP **ne contient pas** les coordonnées.

---

## À quoi ça sert

Pour une **transaction entrante en Russie** (`code` = `ru-…`) **ou au Sénégal** (`code` = `sen-…`), l’app ne montre plus un sélecteur de cartes.

À la place, tu appelles l’endpoint du pays. Le backend :

1. Vérifie que la transaction appartient au JWT.
2. Vérifie que l’origine du corridor est `ru` ou `sen` (selon la route).
3. Choisit une `Card` **active** de ce pays, **sans resservir** au même client une carte déjà utilisée tant qu’il en reste une autre.
4. Envoie les coordonnées sur le **WhatsApp du client AfruE** (numéro du profil).
5. Lie cette carte à la transaction (`cardId`).

Les autres corridors (ex. `cg-ru`, `cam-sen`, `civ-cg`) **ne changent pas**. Ils gardent `GET /v3/country/get/cards/:countryId`.

---

## Route

```http
POST /v3/transactions/{transactionId}/send-russia-card
POST /v3/transactions/{transactionId}/send-senegal-card
Authorization: Bearer <accessToken>
```

Aussi valides via `/v3/transaction/...` (même router).

**Préfixe à utiliser dans l’app : `/v3`.** Ne pas appeler `/v1` ni `/v2`.

| Origine | Route |
| --- | --- |
| `ru-…` | `POST .../send-russia-card` |
| `sen-…` | `POST .../send-senegal-card` |

| | |
| --- | --- |
| Méthode | `POST` |
| Body | **aucun** — pas de JSON |
| Query | **aucune** |
| Path | `transactionId` UUID de la transaction créée |

Pas de `Content-Type: application/json`. Rien dans le body.

---

## Quand l’appeler

Après un `POST /v3/transactions/create-one` **réussi**, si la transaction part de Russie **ou** du Sénégal.

```ts
const origin = (code: string) => code.split('-')[0];
const isWhatsappCardOrigin = ['ru', 'sen'].includes(origin(code));
```

| `code` | Appeler ? | Route |
| --- | --- | --- |
| `ru-cg`, `ru-cam`, `ru-sen`, `ru-civ` | **oui** | `send-russia-card` |
| `sen-cg`, `sen-cam`, `sen-civ`, `sen-ru` | **oui** | `send-senegal-card` |
| `cg-ru`, `cam-ru`, `civ-sen` | non — destination, pas une entrée | — |
| `cam-cg`, `civ-cg`, … | non | — |

Le `transactionId` est le champ `id` de la réponse de `create-one` (UUID), **pas** le `txid` affiché au client.

---

## Réponse 200

```json
{ "ok": true }
```

C’est tout. Pas de `card` dans le JSON. Le message WhatsApp (3 lignes) : `card.content`, `network.pubicName`, `amountToSend` + devise (`rub` ou `xof`).

---

## UI — écran `/transfer/validate` (mobile)

Bloc **Moyen de paiement**, sous « Total à payer ».

**Attendu** pour `ru` et `sen` : un **seul bouton** pleine largeur. Aucune carte, aucun numéro, aucun copy.

Ne pas appeler `GET /v3/country/get/cards/:countryId` quand l’origine est `ru` ou `sen`.  
La preuve obligatoire et le bouton Confirmer **restent** en dessous.

Les autres corridors : liste de cartes inchangée.

---

## Checklist

- [ ] Après `create-one`, si `code` commence par `ru-` → `send-russia-card` ; si `sen-` → `send-senegal-card`
- [ ] Path = UUID `id`, pas `txid`
- [ ] Pas de liste de cartes sur les écrans entrée `ru` et `sen` — **un bouton**
- [ ] Autres corridors inchangés (`GET .../cards/:countryId`)
