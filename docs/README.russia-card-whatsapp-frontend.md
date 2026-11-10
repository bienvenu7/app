# Envoi carte Russie / Sénégal par WhatsApp — app client

**Destinataire :** agent IA frontend de `money-transfer-app`.  
**API :** préfixe `/v3/transactions`  
**Auth :** JWT **client** uniquement (même token que create / patch / get-by-id).  
**Backend déjà livré.** Version complète : `money-transfert-api/README.russia-card-whatsapp-frontend.md`.

Cookie `refresh` HttpOnly : `credentials: 'include'`. Access TTL = **900 s**. En `403`, refresh puis retry une fois.

> **Breaking :** `send-russia-card` / `send-senegal-card` exigent `{ "networkId": "<uuid>" }`. Déployer API et app ensemble.

---

## Flux (origine `ru-…` ou `sen-…` uniquement)

1. `GET /v3/transactions/{transactionId}/payment-networks` → `[{ id, name, pubicName }]` (réseaux ayant au moins une carte active).
2. Le client **choisit** un réseau (chips texte `pubicName`, pas de logos : les banques SBP partagent le même logo).
3. `POST /v3/transactions/{transactionId}/send-russia-card` (`ru-`) ou `send-senegal-card` (`sen-`) avec body `{ "networkId": "<uuid>" }`.

Le backend tire une carte **active au hasard parmi celles du réseau choisi** (sans resservir la même au même client tant qu’il en reste une autre sur ce réseau), envoie 3 lignes sur WhatsApp (`card.content`, `network.pubicName`, `amountToSend` + devise) et lie la carte à la transaction.

**Une transaction = une seule carte.** Au premier envoi réussi la carte est liée à la transaction ; tout renvoi (« Renvoyer les coordonnées », retry, rechargement) renvoie **la même carte**, sans nouveau tirage. Le `networkId` des appels suivants est ignoré (toujours obligatoire dans le body). Si le **premier** envoi échoue (`502`), la carte est déliée et le client peut encore choisir un autre réseau.

Réponse `200` : `{ "ok": true }` — pas de `card` dans le JSON.

`transactionId` = `id` (UUID) de `create-one`, **pas** le `txid`.

Autres corridors (`cg-ru`, `cam-sen`, `civ-cg`, …) : inchangés (`GET /v3/country/get/cards/:countryId`).

---

## UI — `/transfer/validate`

- Bloc **Moyen de paiement** : chips de réseaux + **un seul bouton** pleine largeur. Aucune carte, aucun numéro, aucun copy.
- Bouton **disabled** tant qu’aucun réseau n’est choisi.
- 1 seul réseau → présélectionné, chips masqués.
- Liste vide / erreur → message « aucun réseau disponible », bouton inactif.
- Après succès (ou si `tx.card` est déjà présent après rechargement) : « envoyées sur WhatsApp » + bouton « Renvoyer les coordonnées », **chips masqués** (la carte est figée, changer de réseau n’a plus d’effet).
- Ne pas appeler `GET /v3/country/get/cards/:countryId` pour `ru` / `sen`.
- Preuve obligatoire + bouton Confirmer **restent** en dessous.

---

## Erreurs

| HTTP | Cas | UI |
| --- | --- | --- |
| `400` | `networkId` absent / pas UUID | Bug : réseau non sélectionné |
| `400` | Pas une entrée `ru` / `sen` | Mauvaise route, ne pas réessayer |
| `400` | WhatsApp manquant / invalide | Écran profil |
| `403` | Token expiré / JWT admin | Refresh client, retry |
| `404` | `Transaction non trouvée` | Ne pas réessayer |
| `404` | `Aucune carte active disponible pour ce réseau …` | Recharger les réseaux, choisir un autre |
| `502` | `L'envoi WhatsApp a échoué` | Bouton renvoyer |

---

## Checklist

- [ ] `ru-` / `sen-` → `GET payment-networks` au montage
- [ ] Chips + bouton disabled tant que rien n’est choisi
- [ ] `POST send-*` avec `{ networkId }` (`ru-` → russia, `sen-` → senegal)
- [ ] Path = UUID `id`, pas `txid`
- [ ] Pas de liste de cartes pour `ru` / `sen`
- [ ] `404` « pour ce réseau » → recharger les réseaux
- [ ] Autres corridors inchangés
