# Guide dashboard — stats par itinéraire

Document pour l’**agent frontend du dashboard** (`dashbord.afrue.com`).  
**Ce guide prime** sur OpenAPI (`/reference`) si conflit.

Route unique :

```http
GET /v2/stats/iltineraires/:countryId
GET /v2/stats/iltineraires/:countryId?month=09-2026
Authorization: Bearer <adminAccessToken>
```

JWT **admin** obligatoire (`isAdmin: true`). Ne jamais envoyer un JWT client.

Les autres stats agence (solde, flux, camembert) restent dans [`README.stats-frontend.md`](../README.stats-frontend.md).  
Les stats **par personne** restent dans [`FRONTEND_ADMIN_AGENT_STATS.md`](./FRONTEND_ADMIN_AGENT_STATS.md).

Ne pas confondre avec l’ancien endpoint `GET /v2/stats/iltineraire/:countryId` (singulier, sans somme, sans filtre mois).

---

## En une phrase

Pour **une agence** et **un mois** : la liste de ses corridors, avec le **nombre** de transactions `FINISH` et la **somme** des montants (même logique de devise que les flux incoming / outgoing).

Même contrat d’accès et de mois que **`GET /v2/stats/balance/:countryId`**.

---

## Checklist frontend

| # | Action |
|---|--------|
| 1 | Appeler `GET /v2/stats/iltineraires/:countryId` avec le JWT admin |
| 2 | `ADMIN` / `AGENT` : `countryId` = **`countryId` du JWT / `/v2/admin/me`**. Pas de sélecteur d’agence |
| 3 | `SUPER_ADMIN` / `DEV` : sélecteur d’agence + n’importe quel `countryId` (comme le solde) |
| 4 | Filtre mois optionnel `month=mm-yyyy` (même sélecteur que solde / flux) |
| 5 | Afficher `iltineraire` (libellé) ou `code` (corridor) |
| 6 | Afficher `total` = nombre de txs, `totalAmount` = somme du mois |
| 7 | Les lignes à `0` restent dans la réponse : les afficher, ne pas les filtrer côté client |

---

## Accès (identique au solde)

`countryId` = UUID du pays / agence (`Country.id`, même valeur que dans le JWT).

| Rôle | `countryId` autorisé | Résultat |
|------|----------------------|----------|
| `AGENT` / `ADMIN` | uniquement le leur | itinéraires **de leur agence** |
| `SUPER_ADMIN` / `DEV` | n’importe quel UUID pays | itinéraires **de l’agence demandée** (pas toute la plateforme) |

`ADMIN` / `AGENT` qui demandent un autre pays → `403`  
`Vous n'êtes pas autorisé à accéder aux données de ce pays`

JWT manquant, inactif, ou pas admin → `403` `acces denied!`

Il n’y a **pas** d’endpoint « tous les itinéraires du monde ». Pour comparer plusieurs agences, `SUPER_ADMIN` / `DEV` rappellent la route avec un `countryId` différent (comme pour le solde).

---

## Query

| Param | Type | Obligatoire | Notes |
|-------|------|-------------|--------|
| `countryId` | UUID (path) | oui | agence dont on veut les corridors |
| `month` | `mm-yyyy` | non | ex. `09-2026` |

| `month` | Comportement | `period` renvoyé |
|---------|--------------|------------------|
| absent | mois calendaire UTC en cours, calcul live | `"actuel"` |
| mois en cours | calcul live | `"mm-yyyy"` (ex. `"10-2026"`) |
| mois passé | snapshot mensuel s’il contient les montants, sinon recalcul live | `"mm-yyyy"` |

Format invalide (`2026-09`, `9-2026`, `09/2026`) → `400` `Validation Error`.

---

## Réponse 200

```json
{
  "period": "actuel",
  "iltineraires": [
    {
      "code": "civ-ru",
      "iltineraire": "Côte d'Ivoire - Russie",
      "total": 42,
      "totalAmount": 1250000
    },
    {
      "code": "ru-civ",
      "iltineraire": "Russie - Côte d'Ivoire",
      "total": 18,
      "totalAmount": 980000
    }
  ]
}
```

Exemple mois passé :

```json
{
  "period": "09-2026",
  "iltineraires": [
    {
      "code": "civ-ru",
      "iltineraire": "Côte d'Ivoire - Russie",
      "total": 37,
      "totalAmount": 1100000
    }
  ]
}
```

### Champs

| Champ | Type | Sens | UI |
|-------|------|------|----|
| `period` | `"actuel"` ou `"mm-yyyy"` | mois réellement calculé | sous-titre du widget |
| `iltineraires` | array | un objet par corridor **rattaché à l’agence** | tableau / barres |
| `code` | string | corridor `origine-destination` (`civ-ru`) | id technique, pas forcément affiché |
| `iltineraire` | string | libellé (`Côte d'Ivoire - Russie`) | **label principal** |
| `total` | number | nombre de txs `FINISH` du mois | colonne « Transactions » |
| `totalAmount` | number | somme des montants du mois | colonne « Volume » |

`iltineraires` est trié par `code` croissant.  
Les corridors sans transaction du mois sont inclus (`total: 0`, `totalAmount: 0`). Ne pas les cacher : ça montre les directions inactives.

---

## Comment lire `totalAmount`

Même règle que `GET /v2/stats/flows/:countryId`, **découpée par corridor**.

Pour l’agence du `countryId` :

| Rôle de l’agence sur le corridor | Exemple (agence `civ`) | Montant sommé |
|----------------------------------|------------------------|---------------|
| **Origine** (`code` commence par l’agence) | `civ-ru` | `amountToSend` |
| **Destination** (`code` finit par l’agence) | `ru-civ` | `amountToPayOut` |

### Agences redirigées

Les pays gardent leur nom dans les `code` / libellés, mais certains sont **traités par une autre agence** :

| Pays | Entrant (l’agence encaisse, origine) | Sortant (l’agence paie, destination) |
|------|--------------------------------------|--------------------------------------|
| `rca` | `cam` | `cg` |
| `mali`, `nr`, `gib`, `buf` | `sen` | `sen` |

Les corridors de ces pays apparaissent donc dans les itinéraires de l’agence qui les traite (ex. `rca-gab` dans `cam`, `gab-rca` dans `cg`, `mali-ru` dans `sen`), pas dans ceux de `rca` / `mali` / etc. Les devises restent cohérentes (XAF ↔ XAF, XOF ↔ XOF).

Ainsi `totalAmount` est toujours dans **la devise de l’agence consultée** (pas un mélange XAF + RUB sur la même ligne).

Ne pas additionner les `totalAmount` de plusieurs agences : devises différentes.

Ne pas additionner `totalAmount` avec `incomingAmount` / `outgoingAmount` des flux : ce sont deux vues du même volume (global vs par corridor).

---

## UX recommandée

1. **Widget « Par itinéraire »** à côté du solde et des flux, **même sélecteur de mois**.
2. **ADMIN / AGENT** : `countryId` de la session. Pas de dropdown agence.
3. **SUPER_ADMIN / DEV** : même dropdown agence que pour le solde / les flux. Un changement d’agence relance les 3 endpoints (`balance`, `flows`, `iltineraires`) avec le même `countryId` + `month`.
4. Tableau : libellé · nombre · volume. Optionnel : barres horizontales sur `totalAmount`.
5. État vide : liste avec des `0` (pas une erreur). Message type « Aucune transaction FINISH sur ce mois » seulement si **tous** les `total` sont à `0`.
6. Formater `totalAmount` avec la **devise de l’agence affichée** (`Country.currency` / `pubicName`), pas une devise globale.

---

## Erreurs

| HTTP | Message | UI |
|------|---------|-----|
| `400` | `Validation Error` | `countryId` pas UUID, ou `month` pas `mm-yyyy` |
| `403` | `acces denied!` | JWT manquant / pas admin / compte inactif |
| `403` | `Vous n'êtes pas autorisé à accéder aux données de ce pays` | `ADMIN` / `AGENT` a demandé un autre `countryId` |
| `404` | `Aucun pays trouvé!` | UUID pays inconnu |

Pas de `404` « snapshot manquant » sur cette route : un mois passé sans snapshot (ou snapshot trop ancien) est **recalculé**.  
Le solde (`/v2/stats/balance/:countryId`) peut lui renvoyer `404` pour un mois sans snapshot : gérer les deux widgets séparément.

---

## Types TypeScript

```ts
type Period = 'actuel' | `${string}-${string}`; // "actuel" | "mm-yyyy"

type AgencyItineraryRow = {
  code: string;
  iltineraire: string;
  total: number;
  totalAmount: number;
};

type AgencyIltineraires = {
  period: Period;
  iltineraires: AgencyItineraryRow[];
};
```

Exemple d’appel :

```ts
const qs = month ? `?month=${month}` : '';
const res = await fetch(
  `${API}/v2/stats/iltineraires/${countryId}${qs}`,
  { headers: { Authorization: `Bearer ${adminAccessToken}` } }
);
```

---

## Hors périmètre

- `GET /v2/stats/balance/:countryId` — solde, pas de détail par corridor
- `GET /v2/stats/flows/:countryId` — incoming / outgoing **globaux** de l’agence
- `GET /v2/stats/transactions-by-agency` — camembert de **comptes** de txs, pas des montants
- `GET /v2/stats/iltineraire/:countryId` — ancien endpoint, ne pas l’utiliser
- `GET /v2/stats/admins/:adminId` — performance **d’une personne**, pas de l’agence
