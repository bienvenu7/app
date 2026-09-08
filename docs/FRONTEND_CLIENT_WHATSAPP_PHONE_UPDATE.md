# Guide app client — confirmation WhatsApp du numéro de téléphone (3 septembre 2026)

Document pour l’**agent frontend de l’app client**.
**Périmètre : `PATCH /v3/auth/update/user`** (et son équivalent legacy
`PATCH /v1/auth/update/user`, même comportement).
**Ce guide prime** sur OpenAPI (`/reference`) si conflit.

> **Statut : backend écrit et compilé, pas encore déployé.**
> L’instance WhatsApp du serveur doit également être liée avant que la
> fonctionnalité soit exploitable en production.

---

## En une phrase

**Aucun changement de contrat** : même route, même payload, même réponse de
succès. Le champ `phone` peut désormais faire **échouer** la requête avec deux
nouveaux codes de statut, `400` et `503`, à traiter dans l’écran de profil.

## Pourquoi ce changement

Le numéro WhatsApp était enregistré tel quel, sans aucune vérification. Un
client pouvait donc sauvegarder une faute de frappe, ou un numéro sans compte
WhatsApp, et ne jamais recevoir les notifications qui y sont adressées.

Désormais, le serveur envoie une confirmation WhatsApp au **nouveau** numéro et
**n’enregistre le numéro que si ce message est réellement parti**. L’envoi
réussi fait office de preuve de joignabilité.

---

## Ce que reçoit le client sur WhatsApp

```
Bonjour <prénom nom>,

Ce numéro WhatsApp vient d’être enregistré avec succès sur votre compte AfruE.

Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement notre
service client.
```

---

## Comportement de `PATCH /v3/auth/update/user`

Requête **inchangée** (tous les champs restent optionnels) :

```http
PATCH /v3/auth/update/user
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "username": "Jean Dupont",
  "phone": "+7 912 345-67-89",
  "countryId": "…",
  "password": "…"
}
```

Règles côté serveur :

- La vérification WhatsApp ne se déclenche **que si `phone` est présent et
  différent du numéro actuel**. La comparaison ignore les espaces, tirets et le
  `+`, donc renvoyer le numéro existant sous une autre présentation ne provoque
  aucun envoi.
- En cas d’échec de l’envoi, **rien n’est enregistré** — ni le numéro, ni les
  autres champs de la même requête (`username`, `countryId`, `password`). La
  requête est rejetée en bloc.
- Les formats libres sont acceptés (`+7 912 345-67-89`, `8 912 345 67 89`,
  `00237 6XX XX XX XX`). Inutile de normaliser côté frontend.

### Réponses

| Statut | Quand | Action frontend |
| --- | --- | --- |
| `200` | Confirmation envoyée, profil enregistré | Succès, comportement actuel inchangé |
| `400` | Numéro mal formé ou sans compte WhatsApp actif | L’utilisateur doit corriger sa saisie |
| `503` | Service WhatsApp indisponible côté serveur | Rien à corriger, proposer de réessayer |

**200** — corps strictement identique à l’existant :

```json
{
  "message": "Vos identifiants ont été mises à jour correctement, vous serez déconnecter dans un instant pour assurer que vos données ont été mise à jour correctement",
  "requireRelogin": false
}
```

**400** — numéro à corriger :

```json
{
  "status": "failed",
  "message": "Ce numéro WhatsApp est injoignable. Vérifiez qu'il est correct et associé à un compte WhatsApp actif."
}
```

**503** — panne temporaire du côté serveur :

```json
{
  "status": "error",
  "message": "Impossible d'envoyer la confirmation WhatsApp pour le moment. Votre numéro n'a pas été modifié, réessayez plus tard."
}
```

Les messages sont rédigés pour être affichés tels quels à l’utilisateur.

---

## Ce que le frontend doit faire

- **Afficher les deux erreurs différemment.** Sur `400`, le champ numéro est en
  faute : marquez-le en erreur et gardez le focus dessus. Sur `503`, la saisie
  est probablement correcte : affichez un message global avec un bouton
  « Réessayer », sans invalider le champ.
- **Ne pas mettre à jour l’état local avant la réponse.** Un update optimiste
  afficherait un numéro que la base n’a pas enregistré. Attendez le `200`.
- **Prévoir un temps de réponse plus long.** La requête déclenche jusqu’à trois
  appels au fournisseur WhatsApp. Comptez jusqu’à ~15 s dans le pire cas :
  gardez le bouton en état de chargement et désactivé, et vérifiez que le
  timeout du client HTTP est suffisant.
- **Prévenir l’utilisateur avant l’envoi.** Un texte du type « un message de
  confirmation sera envoyé sur ce numéro WhatsApp » sous le champ évite
  l’incompréhension à la réception du message.

## Points de test

- [ ] Numéro valide avec WhatsApp → `200`, message reçu, profil à jour
- [ ] Numéro valide **sans** compte WhatsApp → `400`, profil inchangé
- [ ] Numéro incomplet (`123`) → `400`
- [ ] Même numéro renvoyé sous un autre format → `200`, aucun message reçu
- [ ] Modification de `username` seul, sans `phone` → `200`, aucun message reçu
- [ ] `phone` invalide **et** `username` valide dans la même requête → `400`, le
      `username` n’est pas enregistré non plus
