# Envoi carte Russie par WhatsApp — app client

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

Pour une **transaction entrante en Russie** (le client envoie **depuis** la Russie : `code` = `ru-…`), l’app ne montre plus un sélecteur de cartes.

À la place, tu appelles cet endpoint. Le backend :

1. Vérifie que la transaction appartient au JWT.
2. Vérifie que l’origine du corridor est `ru`.
3. Tire **au hasard** une `Card` **active** du pays `ru`.
4. Envoie les coordonnées sur le **WhatsApp du client AfruE** (numéro du profil).
5. Lie cette carte à la transaction (`cardId`).

Les autres corridors (ex. `cg-ru`, `cam-sen`) **ne changent pas**. Ils gardent `GET /v3/country/get/cards/:countryId`.

---

## Route

```http
POST /v3/transactions/{transactionId}/send-russia-card
Authorization: Bearer <accessToken>
```

Aussi valide (même handler) :

```http
POST /v3/transaction/{transactionId}/send-russia-card
```

**Préfixe à utiliser dans l’app : `/v3`.** Ne pas appeler `/v1` ni `/v2`.

| | |
| --- | --- |
| Méthode | `POST` |
| Body | **aucun** — pas de JSON |
| Query | **aucune** |
| Path | `transactionId` UUID de la transaction créée |

```ts
// POST /v3/transactions/:transactionId/send-russia-card
// 200 → { ok: true }
```

Exemple :

```http
POST /v3/transactions/3fa85f64-5717-4562-b3fc-2c963f66afa6/send-russia-card
Authorization: Bearer <accessToken>
```

Pas de `Content-Type: application/json`. Rien dans le body.

---

## Quand l’appeler

Après un `POST /v3/transactions/create-one` **réussi**, si la transaction part de Russie.

```ts
const isRussiaIncoming = (code: string) => code.split('-')[0] === 'ru';
```

| `code` | Appeler ? |
| --- | --- |
| `ru-cg`, `ru-cam`, `ru-sen`, `ru-civ` | **oui** |
| `cg-ru`, `cam-ru`, `sen-ru` | non — destination Russie, pas une entrée |
| `cam-cg`, `civ-sen`, … | non |

Le `transactionId` est le champ `id` de la réponse de `create-one` (UUID), **pas** le `txid` affiché au client.

N’appelle **pas** :

- avant que `create-one` ait renvoyé `201` ;
- sur une transaction d’un autre utilisateur (l’API répondra `404`) ;
- en boucle / au montage d’une page de détail sans action utilisateur, sauf le **premier** envoi juste après la création ;
- pour afficher une liste de cartes Russie — ce n’est pas un GET.

Retry : uniquement si l’utilisateur retape (bouton « Renvoyer les coordonnées ») après un `502` / réseau. Chaque appel peut envoyer **une autre** carte (tirage au hasard).

---

## Réponse 200

```json
{ "ok": true }
```

```ts
type SendRussiaCardResponse = {
  ok: true;
};
```

C’est tout. Pas de `card`, `content`, `network`, `message`, `amount`.  
HTTP `200` + `ok === true` = le WhatsApp est **parti**. Afficher un toast / écran de confirmation, pas les coordonnées.

Le message WhatsApp (côté téléphone du client, pas dans l’API) :

```
Beni Fok +24299999999
Mtn cg
9000 rub
```

| Ligne | Source |
| --- | --- |
| 1 | `card.content` |
| 2 | `card.network.pubicName` (orthographe API : `pubicName`, pas `publicName`) |
| 3 | `amountToSend` + devise du pays `ru` (minuscule, ex. `rub`) |

Ne pas reconstruire ce texte dans l’UI. Le client le reçoit sur WhatsApp.

Après succès, un `GET /v3/transaction/get/by-id/:transactionId` peut exposer `card.phone` (= `content` envoyé). Optionnel. Ne pas s’en servir pour recréer le message (le réseau n’est pas dans `tx.card`).

---

## UI — écran `/transfer/validate` (mobile)

Bloc **Moyen de paiement**, sous « Total à payer ».

**Interdit** : liste des cartes SBP / numéros / bouton copier.

**Attendu** : un **seul bouton** pleine largeur. Aucune carte, aucun numéro, aucun copy.

| État | Contenu du bloc |
| --- | --- |
| Avant envoi | 1 bouton « Recevoir les coordonnées sur WhatsApp » |
| En cours | 1 bouton disabled + loader |
| Succès | texte « envoyées sur votre WhatsApp » + le même bouton devient « Renvoyer les coordonnées » |
| Échec 502 / WhatsApp | le même bouton « Renvoyer les coordonnées » |

Ne pas appeler `GET /v3/country/get/cards/:countryId` quand l’origine est `ru`.  
La preuve obligatoire et le bouton Confirmer **restent** en dessous.

Les autres corridors : liste de cartes inchangée.

---

## Erreurs

Body typique :

```json
{ "status": "failed", "message": "…" }
```

Mapper le **code HTTP**. Afficher `message` tel quel si tu as une bannière générique.

| HTTP | `message` (typique) | UI |
| --- | --- | --- |
| `200` | `{ ok: true }` | Toast succès |
| `400` | `Cette action est réservée aux transactions entrantes en Russie` | Bug de garde côté app : tu as appelé hors `ru-…`. Ne pas réessayer. |
| `400` | `Numéro WhatsApp du client introuvable` | Demander d’ajouter un WhatsApp au profil, puis retry. |
| `400` | `Le numéro WhatsApp du client est invalide` | Corriger le numéro (chiffres, indicatif, sans `+`). |
| `400` | Validation (`transactionId` pas UUID) | Bug : tu as passé `txid` ou un id vide. |
| `403` | `acces denied!` | Token manquant, expiré, ou JWT admin. Refresh client, puis retry. |
| `404` | `Transaction non trouvée` | Pas owner / id inconnu / brouillon. Ne pas réessayer avec le même id. |
| `404` | `Aucune carte active disponible pour la Russie` | Message support : pas de carte active. Pas de picker de secours. |
| `502` | `L'envoi WhatsApp a échoué` | Retry manuel. Ne pas afficher de fausse carte. |

Pas de `201`. Succès = **`200`**.

---

## Hook / client HTTP

```ts
export async function sendRussiaPaymentCard(
  transactionId: string
): Promise<{ ok: true }> {
  const res = await fetch(
    `${CLIENT_API}/transactions/${transactionId}/send-russia-card`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    // lire { message } si besoin, throw selon res.status
    throw new Error(String(res.status));
  }

  return res.json();
}
```

`CLIENT_API` = `/v3` (même constante que create-one).

Garde après create :

```ts
const tx = await createTransaction(body); // 201, tx.id + tx.code

if (tx.code.split('-')[0] === 'ru') {
  await sendRussiaPaymentCard(tx.id);
}
```

Ne pas envoyer `tx.txid` dans l’URL.

---

## À ne pas faire

- Appeler `GET /v3/country/get/cards/:countryId` pour ce parcours Russie entrant, puis afficher / copier une carte à l’écran.
- Tirer une carte au hasard dans l’app : le backend le fait.
- Attendre un objet `card` dans le JSON de cet endpoint.
- Utiliser un JWT admin.
- PUT / PATCH / GET sur cette URL — **POST** seulement.
- Envoyer un body `{ transactionId }` : l’id est **uniquement** dans le path.
- Traiter `cg-ru` comme une entrée Russie.
- Afficher un mock « Beni Fok… / Mtn cg / 9000 rub » : c’est un exemple de SMS, pas une donnée API.

---

## Checklist

- [ ] Après `create-one`, si `code` commence par `ru-`, un seul `POST /v3/transactions/:id/send-russia-card`
- [ ] Path = UUID `id`, pas `txid`
- [ ] Header `Authorization: Bearer <accessToken>` + `credentials: 'include'`
- [ ] Aucun body
- [ ] `200` `{ ok: true }` → message « envoyé sur WhatsApp »
- [ ] Pas de liste de cartes Russie sur cet écran
- [ ] `400` WhatsApp manquant → écran profil
- [ ] `502` → bouton renvoyer
- [ ] Autres corridors inchangés (`GET .../cards/:countryId`)
- [ ] Suite du flow (preuve, patch, upload) inchangée
