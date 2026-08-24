# Guide app client — refonte du cycle de vie des OTP (24 août 2026)

Document pour l’**agent frontend de l’app client** (afrue.com / app).
**Périmètre : routes `/v3` uniquement.**
**Ce guide prime** sur OpenAPI (`/reference`) si conflit.
Complément de `FRONTEND_CLIENT_SECURITY_UPDATES.md` — ne le remplace pas.

> **Statut : correctif backend écrit et compilé, pas encore déployé.**
> Tant que la migration Prisma n’est pas appliquée en production, l’ancien
> comportement subsiste. Le frontend peut être préparé dès maintenant, mais les
> tests de bout en bout ne seront valables qu’après déploiement.

---

## En une phrase

**Aucun changement de contrat** : pas de nouvel endpoint, pas de nouveau champ
en requête ni en réponse, aucun format modifié. Quatre changements de
**comportement** à absorber, dont un seul introduit un code de statut inédit.

## Pourquoi ce changement

Deux failles de sécurité corrigées côté serveur :

1. **Un seul OTP pour plusieurs usages.** La base ne gardait qu’un code par
   compte, partagé entre connexion, inscription et réinitialisation de mot de
   passe. Conséquence : un code reçu par « mot de passe oublié » était accepté
   à la connexion et ouvrait une session, et un code de connexion pouvait
   changer le mot de passe.
2. **Aucun compteur de tentatives.** Un code erroné n’invalidait rien. Les 6
   chiffres pouvaient être testés indéfiniment, le plafonnement par IP étant
   contournable en changeant d’adresse.

Chaque code porte désormais son usage — connexion ou réinitialisation — et un
compteur de tentatives plafonné à **5**.

---

## Table des routes impactées (checklist agent)

| #   | Méthode | Route                         | Action frontend                                   |
| --- | ------- | ----------------------------- | ------------------------------------------------- |
| 1   | `POST`  | `/v3/auth/login`              | Inchangé                                          |
| 2   | `POST`  | `/v3/auth/verify-otp`         | Gérer l’épuisement des 5 essais → proposer renvoi  |
| 3   | `POST`  | `/v3/auth/resend-otp`         | **Nouveau `429` par email** + compte à rebours    |
| 4   | `POST`  | `/v3/clients/register`        | Inchangé                                          |
| 5   | `POST`  | `/v3/clients/forgot-password` | Inchangé                                          |
| 6   | `PATCH` | `/v3/clients/reset-password`  | Message d’erreur unifié + 5 essais                |

Les routes marquées « inchangé » n’apparaissent ici que parce que le code
qu’elles émettent est désormais typé côté serveur. Leurs payloads, réponses et
messages sont strictement identiques : rien à modifier pour elles.

---

## 1. Cinq essais maximum par code

C’était le cœur de la faille. Désormais, au **cinquième échec le serveur
supprime le code**. L’utilisateur ne peut plus réessayer : il doit en demander
un nouveau.

Propriétés à connaître :

- Le compteur est porté par le code lui-même, **en base de données**. Il est
  donc partagé entre appareils, navigateurs et onglets : cinq essais au total,
  pas cinq par session.
- Il est **remis à zéro dès qu’un nouveau code est émis** (`login`,
  `resend-otp`, ou `forgot-password` selon le parcours).
- Après épuisement, les tentatives suivantes renvoient **exactement la même
  erreur qu’un code faux**. Impossible de distinguer « épuisé », « expiré » et
  « incorrect » : c’est volontaire, distinguer les cas renseignait un attaquant.

**Ce que le frontend doit faire.** L’API ne permet pas de détecter
l’épuisement. Comptez donc les échecs côté client et, après 5 essais, basculez
l’UI sur « demander un nouveau code » au lieu de laisser saisir en boucle. Ce
compteur local est purement cosmétique et peut être désynchronisé (autre
onglet, autre appareil) — ne lui faites porter aucune décision de sécurité, le
serveur est seul juge.

**Durées de validité — inchangées** : 2 minutes pour un code de connexion ou
d’inscription, 10 minutes pour un code de réinitialisation. Un compte à rebours
existant reste correct.

---

## 2. Nouveau `429` sur `POST /v3/auth/resend-otp`

Seul endroit où un code de statut nouveau peut apparaître. Le renvoi de code
est maintenant plafonné à **5 demandes par 15 minutes et par adresse email** :
sans cela, il suffisait de redemander un code pour remettre le compteur
d’essais à zéro et reprendre la force brute.

```http
POST /v3/auth/resend-otp
Content-Type: application/json

{ "email": "user@example.com" }
```

**200** — réponse générique inchangée (identique que le compte existe ou non) :

```json
{ "message": "Si un compte existe pour cet email, un code a été envoyé." }
```

**429** — plafond par email atteint, corps **JSON** :

```json
{
  "message": "Trop de tentatives pour cette adresse email. Veuillez réessayer dans quelques minutes."
}
```

Les en-têtes standard sont exposés : `RateLimit-Limit`, `RateLimit-Remaining`
et `RateLimit-Reset`. **`RateLimit-Reset` donne le nombre de secondes
restantes** — utilisez-le pour désactiver le bouton et afficher un compte à
rebours plutôt qu’un message figé.

Attention, deux `429` différents coexistent sur ces routes : voir la section 5.

---

## 3. Code de connexion et code de réinitialisation désormais indépendants

Avant, il n’existait qu’un code par compte : demander une réinitialisation
écrasait silencieusement un code de connexion en attente.

Maintenant les deux coexistent. Un utilisateur en cours de connexion qui clique
sur « mot de passe oublié » **garde ses deux codes valides simultanément**.

En revanche ils ne sont plus interchangeables :

| Code reçu pour        | Soumis à                           | Résultat |
| --------------------- | ---------------------------------- | -------- |
| Connexion/inscription | `POST /v3/auth/verify-otp`         | OK       |
| Connexion/inscription | `PATCH /v3/clients/reset-password` | `403`    |
| Réinitialisation      | `PATCH /v3/clients/reset-password` | OK       |
| Réinitialisation      | `POST /v3/auth/verify-otp`         | `401`    |

**Ce que le frontend doit faire.** Si le même composant de saisie de code est
réutilisé pour les deux parcours, vérifiez qu’il pointe bien vers l’endpoint
correspondant au parcours en cours. Un mélange qui « marchait » avant renverra
désormais une erreur.

---

## 4. Un message d’erreur a disparu sur `reset-password`

`PATCH /v3/clients/reset-password` renvoyait deux messages `403` distincts :

- `Code invalide ou expiré. Veuillez en demander un nouveau.` (absent/périmé)
- `Le code de vérification est incorrect.` (ne correspond pas)

**Le second n’existe plus.** Tout est unifié sur le premier.

Si le frontend fait un test sur cette chaîne, il casse. **Basez-vous sur le
code de statut, jamais sur le texte du message** — les messages d’erreur d’auth
sont volontairement génériques et peuvent encore être fusionnés à l’avenir.

---

## 5. Forme des réponses d’erreur

Point non évident : les erreurs applicatives et les erreurs de rate limit
n’ont **pas le même format**.

**Erreurs applicatives** (`400`, `401`, `403`, `404`) — JSON avec un champ
`status` en plus du message :

```json
{
  "status": "failed",
  "message": "Code invalide ou expiré. Veuillez en demander un nouveau."
}
```

**`429` plafond par email** (`resend-otp`, `login`, `register`,
`forgot-password`, `reset-password`) — JSON :

```json
{
  "message": "Trop de tentatives pour cette adresse email. Veuillez réessayer dans quelques minutes."
}
```

**`429` plafond par IP** (20 requêtes / 15 min, sur toutes les routes d’auth) —
**corps en texte brut, pas du JSON** :

```
Trop de tentatives. Veuillez réessayer dans quelques minutes.
```

Un `await response.json()` inconditionnel sur un `429` lèvera donc une
exception de parsing dans ce dernier cas. Parsez défensivement : testez le
`Content-Type`, ou encapsulez le parsing dans un `try/catch` avec repli sur un
message par défaut.

---

## Récapitulatif des statuts

| Route                              | Succès              | 400  | 401           | 403           | 429                      |
| ---------------------------------- | ------------------- | ---- | ------------- | ------------- | ------------------------ |
| `POST /v3/auth/login`              | `200` OTP envoyé    | Zod  | identifiants  | compte bloqué | IP + email               |
| `POST /v3/auth/verify-otp`         | `201` tokens        | Zod  | code invalide | —             | IP                       |
| `POST /v3/auth/resend-otp`         | `200` générique     | Zod  | —             | —             | IP + **email (nouveau)** |
| `POST /v3/clients/register`        | `201` générique     | Zod  | —             | —             | IP + email               |
| `POST /v3/clients/forgot-password` | `200` générique     | Zod  | —             | —             | IP + email               |
| `PATCH /v3/clients/reset-password` | `200` mot de passe changé | Zod | —      | code invalide | IP + email               |

`verify-otp` répond `401`, `reset-password` répond `403` — cette asymétrie
existait déjà, elle n’a pas changé.

Deux cas de `login` à ne pas confondre, inchangés eux aussi mais souvent mal
gérés : le `401` couvre à la fois les mauvais identifiants (message générique
`Email ou mot de passe incorrect.`) **et** le compte dont l’email n’est pas
encore confirmé (`Veillez d'abord confirmer votre addresse email!`). Le second
mérite un écran dédié invitant à confirmer l’adresse, pas un simple « mot de
passe incorrect ». C’est la seule exception à la règle « ne pas se brancher sur
le texte » — si vous devez distinguer ces deux cas, faites-le, mais isolez la
comparaison dans une seule fonction pour la corriger facilement le jour où le
backend expose un code d’erreur propre.

---

## Détail complet des flux (rappel des contrats, inchangés)

### Connexion

```http
POST /v3/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "secret123" }
```

`200` → un code à 6 chiffres part par email, valable **2 minutes**.

```http
POST /v3/auth/verify-otp
Content-Type: application/json

{ "email": "user@example.com", "otp": "123456" }
```

`201` :

```json
{ "accessToken": "<jwt>", "expiresIn": 900 }
```

Plus le cookie `refresh` en `HttpOnly` (rotation gérée par l’interceptor
existant). `credentials: 'include'` obligatoire.

`401` → code invalide, expiré **ou épuisé** (5 essais).

### Renvoi du code de connexion

```http
POST /v3/auth/resend-otp
Content-Type: application/json

{ "email": "user@example.com" }
```

Nouveau code valable 2 minutes, compteur d’essais remis à zéro. Plafonné à 5
demandes par 15 minutes et par email — cf. section 2.

### Réinitialisation de mot de passe

```http
POST /v3/clients/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

`200` toujours, même si l’email est inconnu (anti-énumération) :

```json
{
  "message": "Si un compte existe pour cet email, un code de réinitialisation a été envoyé."
}
```

Code valable **10 minutes**.

```http
PATCH /v3/clients/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456",
  "password": "nouveauMotDePasse"
}
```

| Champ      | Type   | Contrainte                  |
| ---------- | ------ | --------------------------- |
| `email`    | string | email valide                |
| `otp`      | string | **exactement 6** caractères |
| `password` | string | min **6**                   |

`200` → succès. Les sessions actives sont invalidées côté serveur : nettoyez le
stockage local et redirigez vers la connexion.

`403` → code invalide, expiré ou épuisé (message unifié, cf. section 4).

---

## Bonus : la casse des emails est maintenant normalisée

`verify-otp`, `forgot-password` et `reset-password` passent l’email en
minuscules côté serveur, comme le faisaient déjà `login` et `register`.

Avant ce correctif, un utilisateur qui saisissait `Jean@Exemple.com` sur
l’écran de saisie du code ne retrouvait jamais son code et recevait
« code invalide » sans comprendre pourquoi. Le frontend n’a donc plus besoin de
forcer les minuscules — le faire ne gêne pas pour autant.

---

## Checklist agent frontend

- [ ] Écran de saisie de code : compteur local d’échecs, bascule sur
      « demander un nouveau code » après 5 essais
- [ ] `resend-otp` : gérer le `429`, désactiver le bouton, compte à rebours
      alimenté par l’en-tête `RateLimit-Reset`
- [ ] Vérifier que le composant de saisie de code cible le bon endpoint selon
      le parcours (connexion vs réinitialisation)
- [ ] Supprimer tout test sur la chaîne `Le code de vérification est incorrect.`
- [ ] Ne plus faire aucun branchement sur le **texte** des messages d’auth :
      uniquement sur les codes de statut (seule exception documentée : les deux
      cas de `401` sur `login`)
- [ ] Parsing défensif des `429` (texte brut possible sur le plafond par IP)
- [ ] Message utilisateur clair pour « code épuisé » sans prétendre distinguer
      épuisé / expiré / faux

## QA (après déploiement de la migration uniquement)

1. Connexion → 5 codes faux → le 6e essai échoue même avec le **bon** code →
   renvoi → le bon code passe
2. Connexion en cours, puis « mot de passe oublié » → les deux codes arrivent →
   chacun ne fonctionne que sur son propre écran
3. Code de réinitialisation soumis à `verify-otp` → `401`, aucune session créée
4. 6 appels d’affilée à `resend-otp` pour le même email → `429` au 6e, avec
   `RateLimit-Reset` renseigné
5. Saisie de l’email en majuscules à l’étape du code → fonctionne
6. Attendre l’expiration (2 min connexion, 10 min réinitialisation) → `401` /
   `403`

## Dépannage

1. « Code invalide » alors que le code vient d’arriver → un code plus récent a
   été émis entre-temps (chaque émission écrase le précédent du même usage)
2. Exception de parsing JSON sur un `429` → c’est le plafond par IP, corps en
   texte brut, cf. section 5
3. `403` sur `reset-password` avec un code qui « marchait » → code de connexion
   soumis au mauvais endpoint, cf. section 3
4. Comportement conforme à l’ancien modèle en production → la migration Prisma
   n’a pas encore été appliquée
5. OpenAPI en désaccord → **ce guide prime**
