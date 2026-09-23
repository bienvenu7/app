# Chat client — brief pour l’agent IA de la web app

**Destinataire :** agent IA qui implémente le widget chat dans `money-transfer-app`.  
**API :** préfixe `/v3` — JWT client uniquement (`isAdmin: false`).  
**Backend déjà livré.** Tu n’inventes ni taux, ni statut, ni `txid`, ni motif d’erreur.

Docs liées :

- [`FRONTEND_CLIENT_API_V3.md`](./FRONTEND_CLIENT_API_V3.md) — reste de l’app
- [`SOCKET_TRANSACTIONS.md`](./SOCKET_TRANSACTIONS.md) — events transaction (même socket)
- [`SOCKET_SUPPORT.md`](./SOCKET_SUPPORT.md) — events support

---

## 0. Contrat produit (à respecter à la lettre)

### Bouton fixe « Transactions échouées »

Sur chaque `POST /v3/chatbot/message` et `GET /v3/chatbot/thread`, même sans fil :

```json
"pinned": { "id": "failed_tx", "label": "Transactions échouées", "action": "tx_error" }
```

`suggestions` contient ce seul bouton. Il reste collé au chat. Un message libre ne l’enlève pas et ne le remplace pas par la liste.

Clic : `{ "action": "tx_error" }`.

### La liste n’apparaît qu’après ce clic

Tout `{ "message": "…" }` sans `action` est une FAQ. « bonjour », délai, frais, pays, comment envoyer : bulle = `reply`. **Pas** de `choices`. Ne pas ouvrir le parcours erreur parce que le texte parle d’un envoi. Pas de bouton « parler à un agent ».

Après `tx_error` seulement, `choices` = une transaction **en erreur** du jour par bouton. `label` tel quel. Clic = `{ "action": "select_tx", "txid" }`.

Si `choices` est **omis** : retire la liste. Garde le bouton fixe.

Liste vide : « Aucune transaction en erreur aujourd’hui. »

Un agent n’arrive que si la réponse a `waiting: true`.

Dire « j’ai payé », « j’ai envoyé la preuve » ou coller un numéro dans le champ de chat **ne change pas** le statut. Ne pas en déduire « en cours ». Seuls `fix` et `proof_done` remettent la transaction en cours.

### Parcours = 2 temps (seulement après `tx_error`)

| Temps | Déclencheur                                     | `reply`                                             | Boutons   |
| ----- | ----------------------------------------------- | --------------------------------------------------- | --------- |
| 1     | Clic `{ action: "tx_error" }`                   | « Veuillez choisir la transaction pour continuer. » | `choices` |
| 2     | Clic `{ action: "select_tx", txid }`            | Motif en langage courant + ce qu’il faut corriger   | `input`   |

L’IA **ne choisit jamais** une TX toute seule.  
Interdit : « J’ai trouvé votre transfert b5d5264ed3… » ou « indiquez-moi sa référence » sur un simple bonjour.

Un « d’accord », « ok », « merci », ou une TX déjà en cours, n’est **pas** une phrase toute faite. L’IA rédige une réponse courte et humaine (ex. « Parfait, je reste disponible si besoin. »). Ne pas renvoyer « Cette transaction est déjà en cours. » tel quel.

### Ce qui ne doit **jamais** apparaître dans une bulle

- Lien `/v3/file/upload/…` ou UUID
- Code `ERREUR_CAPTURE`, `MAUVAIS_NUMERO`, `MONTANT_INCORRECT`, `SEUIL_ATTEINT`
- Bloc « Transferts en erreur aujourd’hui » si `choices` est absent
- Bouton générique « Problème avec une transaction »

Garde les **espaces** du `reply` (ne pas coller les mots).  
`input.endpoint` est interne : file picker, pas un lien affiché.

---

## 1. Ce que l’utilisateur voit

Trois modes, un seul widget :

| Mode           | `thread.status`        | Comportement UI                                                                                                    |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Bot            | `BOT`                  | Bulles. Boutons **uniquement** si `choices` est dans la dernière réponse. Si `input` : champ ou file picker. |
| File d’attente | `WAITING`              | « Un agent va vous répondre ». Socket. Un clic de transaction envoie `{ action: "select_tx", txid }`.        |
| Agent          | `LIVE`                 | Chat temps réel. Pièces jointes. Typing. Un clic de transaction envoie `{ action: "select_tx", txid }`, jamais le label. |
| Fermé          | `CLOSED` ou pas de fil | Le prochain message crée un fil `BOT`.                                                                             |

`GET /v3/chatbot/thread` au montage et après refresh décide le mode.

---

## 2. Auth

```http
Authorization: Bearer <accessToken>
```

Même JWT que le reste de l’app v3. TTL access **900 s**. Cookie `refresh` HttpOnly.

```ts
const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
  auth: { token: accessToken },
  transports: ["websocket", "polling"],
});
```

Le client rejoint automatiquement la room `{userId}`. Ne pas inventer d’autres rooms.

---

## 3. Types à coller

```ts
type ThreadStatus = "BOT" | "WAITING" | "LIVE" | "CLOSED";
type SupportAuthor = "CLIENT" | "BOT" | "ADMIN";

/** Une transaction du jour — un bouton. `label` tel quel. */
type ChatSuggestion = {
  id: string; // "select_tx:{txid}"
  label: string; // "AE12 · 14:32 · Russie - Mali · envoi 15 000 · Ali Koné · 79001234567 · en erreur · numéro destinataire invalide"
  action: "select_tx";
  txid: string;
};

type ChatInput =
  | { type: "text"; name: "receiverPhone"; placeholder: string }
  | { type: "file"; transactionId: string; endpoint: string };

type ChatbotRequest = {
  message?: string;
  action?: "select_tx" | "fix" | "proof_done" | "handoff";
  txid?: string;
  value?: string;
};

type ChatbotReply = {
  reply: string;
  threadId: string;
  suggestions: ChatSuggestion[];
  waiting?: boolean;
  live?: boolean; // un agent a pris le fil
  status?: ThreadStatus;
  echo?: SupportMessage; // ton message déjà stocké (WAITING / LIVE)
  choices?: ChatSuggestion[];
  input?: ChatInput;
};

type SupportMessage = {
  id: string;
  threadId: string;
  author: SupportAuthor;
  text: string;
  createdAt: string;
  filename?: string;
  uri?: string;
  mime?: string;
};

type ClientThreadResponse = {
  thread: {
    id: string;
    status: ThreadStatus;
    createdAt: string;
    updatedAt: string;
  } | null;
  messages: SupportMessage[];
  suggestions: ChatSuggestion[];
  input?: ChatInput;
};
```

Un champ **omis** ≠ `null`. Tester `if (data.choices)`, `if (data.input)`, `if (msg.uri)`.

---

## 4. HTTP

### 4.1 Ouvrir / reprendre le fil

```http
GET /v3/chatbot/thread
Authorization: Bearer <accessToken>
```

**200**

```json
{
  "thread": { "id": "…", "status": "BOT", "createdAt": "…", "updatedAt": "…" },
  "messages": [],
  "suggestions": []
}
```

Si `thread` est `null` : widget vide, **sans** boutons de transaction. Le premier `POST /message` crée le fil.

Si un parcours erreur est en cours, `input` peut déjà être présent (après refresh).

| `status`          | Au chargement                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `BOT`             | Afficher `messages`. Zone de saisie. **Pas** de boutons (sauf si tu viens d’un POST qui a renvoyé `choices`). |
| `WAITING`         | Afficher `messages`. `socket.emit('support:join', { threadId })`.                                                   |
| `LIVE`            | Idem + saisie live + pièces jointes.                                                                                |
| absent / `CLOSED` | Nouveau chat bot.                                                                                                   |

### 4.2 Envoyer un message

```http
POST /v3/chatbot/message
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Body : **au moins** `message` **ou** `action`.

```json
{ "message": "Combien de temps prend un transfert ?" }
```

**200** — toujours `{ reply, threadId, suggestions }`.  
`choices` = temps 1 (liste à choisir).  
`input` = temps 2 (champ / file picker).  
`waiting: true` = un agent est demandé.

Rate limit : **10 / minute** → **429**.

| HTTP      | Sens                                        |
| --------- | ------------------------------------------- |
| 400       | Ni `message` ni `action`, ou message > 2000 |
| 403       | Pas de JWT client                           |
| 429       | Trop de messages                            |
| 502 / 503 | IA indisponible (mode bot libre uniquement) |

### 4.3 Pièce jointe vers l’agent (WAITING / LIVE seulement)

```http
POST /v3/chatbot/thread/:threadId/file
```

`multipart/form-data` : `file` (JPEG, PNG, WebP, PDF, max **10 Mo**) + `comment` optionnel.

**201** `{ threadId, status, message }` avec `uri` / `filename` / `mime`.  
**409** si le fil est encore `BOT` ou déjà `CLOSED`.

Ce n’est **pas** la preuve de paiement d’une transaction (voir §5.4).

---

## 5. Transactions en erreur

### 5.1 Temps 1 — après `{ "action": "tx_error" }`

Un message libre ne déclenche pas cette liste. Seulement le clic du bouton fixe.

**Réponse à afficher telle quelle :**

```json
{
  "reply": "Veuillez choisir la transaction pour continuer.",
  "pinned": { "id": "failed_tx", "label": "Transactions échouées", "action": "tx_error" },
  "choices": [
    {
      "id": "select_tx:AE12",
      "label": "AE12 · 14:32 · Russie - Mali · envoi 15 000 · Ali Koné · 79001234567 · en erreur · numéro destinataire invalide",
      "action": "select_tx",
      "txid": "AE12"
    }
  ],
  "suggestions": [
    { "id": "failed_tx", "label": "Transactions échouées", "action": "tx_error" }
  ]
}
```

Rendu :

1. Bulle bot = `reply` uniquement.
2. Le bouton fixe reste. Sous la bulle : **un bouton par** `choices[]`. `label` tel quel, sans le découper ni le réécrire.
3. Clic = `{ "action": "select_tx", "txid": item.txid }`. **Jamais** le `label` en `message`.

Ordre des morceaux du `label` (ceux qui manquent sont absents) : `txid · heure · corridor · envoi|réception + montant · destinataire · téléphone · statut · motif`.

Statuts possibles dans le label : `en attente`, `en cours`, `confirmée`, `en erreur`, `terminée`. Le motif (`numéro destinataire invalide`, `limite du numéro atteinte`, `preuve de paiement refusée`, `montant payé incorrect`) n’est présent que si le statut est `en erreur`.

Liste vide : pas de bouton. `reply` = « Aucune transaction aujourd’hui. »

### 5.2 Temps 2 — après le clic

```json
{ "action": "select_tx", "txid": "AE12" }
```

**Alors seulement** l’IA backend :

1. Charge **cette** transaction du jour si elle appartient au client.
2. Explique le motif en langage naturel. Jamais `(ERREUR_CAPTURE)`.
3. Demande **uniquement** la donnée manquante.
4. Renvoie `input` pour le contrôle.

Exemple de `reply` correct : « La photo du paiement n’a pas été acceptée. Envoyez un justificatif plus net. »  
Exemple interdit : « … (ERREUR_CAPTURE). Téléversez via /v3/file/upload/e7c2d590-… »

### 5.3 Ce que l’IA corrige (tu n’appelles pas les tools)

| Motif (interne, jamais affiché) | L’IA demande                             | Contrôle `input`         | Mise à jour                            |
| ------------------------------- | ---------------------------------------- | ------------------------ | -------------------------------------- |
| Mauvais numéro                  | Nouveau n° destinataire                  | `text` / `receiverPhone` | `fix` seulement                        |
| Seuil atteint                   | Autre n° **ou** agent                    | `text` / `receiverPhone` | `fix`, ou `handoff`                    |
| Preuve illisible                | Nouveau reçu                             | `file` (file picker)     | upload (statut inchangé) puis `proof_done` |
| Montant incorrect               | Renvoyer le **montant déclaré** + preuve | `file`                   | idem. **Ne jamais changer le montant** |

### 5.4 L’utilisateur donne un numéro

Si `input.type === "text"` et `input.name === "receiverPhone"` :

```json
{ "action": "fix", "txid": "AE12", "value": "79001234567" }
```

Chiffres seuls, indicatif, **9 à 15** digits, **sans** `+`.

Le submit du champ **est** cette action. Un `{ "message": "79001234567" }` ne reprend pas la transaction. Un texte du type « j’ai payé » non plus : afficher seulement le `reply`, sans en déduire « en cours ».

Succès : le `reply` renvoyé confirme ou non la reprise. Ne pas inventer le statut.

### 5.5 L’utilisateur envoie une preuve

Quand `input.type === "file"` : bouton **Joindre le justificatif** (file picker).  
Pas de lien dans la bulle.

`input.endpoint` = `/v3/file/upload/{transactionId}` (`id` UUID, **pas** le txid) — usage interne.

```http
POST /v3/file/upload/:transactionId
Content-Type: multipart/form-data
```

Champ `file`. **201** `{ ok: true }`.

Sur une transaction **en erreur**, cet upload enregistre le fichier et **laisse le statut inchangé**. Enchaîner tout de suite :

```json
{ "action": "proof_done", "txid": "AE12" }
```

C’est seulement `fix` ou `proof_done` qui peut remettre la transaction en cours. Dire « j’ai envoyé la preuve » dans le champ de chat ne le fait pas.

Si aucun fichier n’est arrivé, `reply` redemande le justificatif — toujours sans URL.

### 5.6 Agent humain

```json
{ "action": "handoff" }
```

ou un message du type « parler à un agent ».

Dès que `waiting === true` : mode file (§7).

---

## 6. Mode bot libre (FAQ / statut)

`{ "message": "…" }` sans `action`.

L’IA peut citer **les** TX du client (statut, txid) mais n’invente pas.  
Dès que le texte parle d’une **erreur de transfert** : bascule automatique au **temps 1** (§5.1). Ne pas afficher une TX « trouvée » par l’IA.

Dès que `waiting === true` : file d’attente. Ne plus attendre une nouvelle phrase DeepSeek.  
Si `live === true` ou `status === "LIVE"` : un agent est là. **`reply` est vide** — n’affiche pas une ancienne phrase bot.

Tu peux encore `POST /message` en `WAITING` / `LIVE` : le texte est stocké et poussé en socket. La réponse HTTP est `{ reply: "", waiting: true, live?, echo }`. Affiche `echo` comme ta bulle, pas `reply`.

---

## 7. File d’attente et agent (socket) — obligatoire pour le live

Connecter le socket **dès le login**, pas seulement à l’ouverture du widget.  
`auth.token` = access JWT. Origines autorisées : `app.afrue.com` / `www.app.afrue.com` (même liste que l’API HTTP).

Au `connection`, si un fil `WAITING` / `LIVE` existe, le serveur **rattache tout seul** le client à `support:{threadId}` et renvoie `support:waiting` ou `support:accepted`.

### Events à écouter (dès la connexion)

| Event              | Payload                                                            | UI                                                                                                    |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `support:waiting`  | `{ threadId, status: "WAITING" }`                                  | Mode file. Banner « un agent va vous répondre ». `support:join`.                                      |
| `support:accepted` | `{ threadId, adminId, status: "LIVE", agentReady: true, message }` | Mode LIVE. Banner + bulle avec `message` (« Un agent est connecté et prêt à vous répondre. »).        |
| `support:message`  | `SupportMessage`                                                   | **Ajouter la bulle**. `author === "ADMIN"` = agent. `author === "BOT"` peut être l’annonce d’arrivée. |
| `support:typing`   | `{ threadId, userId, isAdmin, isTyping }`                          | Si `isAdmin && isTyping` : « L’agent écrit… ». Sinon cacher.                                          |
| `support:closed`   | `{ threadId, status: "CLOSED" }`                                   | Revenir au bot. `GET /thread`.                                                                        |
| `support:history`  | `{ threadId, status, messages }`                                   | Remplacer les bulles (après `join`).                                                                  |
| `support:error`    | `{ message }`                                                      | Toast.                                                                                                |

Sans ces listeners, **aucune interaction live** : le POST chatbot ne renvoie plus de phrase IA.

### Events à émettre

```ts
socket.emit("support:join", { threadId });
socket.emit("support:message", { threadId, text }); // préféré en WAITING / LIVE
socket.emit("support:typing", { threadId, isTyping: true });
// debounce : isTyping false 1–2 s après la dernière touche
```

Le client **ne peut pas** `accept` ni `close`.

### Refresh

1. `GET /v3/chatbot/thread`
2. Si `WAITING` ou `LIVE` → socket déjà rattaché au connect, plus `support:join` pour l’historique
3. Afficher `messages` (l’annonce agent est une bulle `BOT`)

### Pièce jointe live

`POST /v3/chatbot/thread/:id/file` puis socket `support:message` avec `uri`.  
Image si `mime` commence par `image/`, sinon lien `filename`.

---

## 8. États UI

```
montage → GET /thread
             │
             ├─ null / BOT ──────────► mode BOT
             │                            │
             │   texte « erreur TX » ─────┤ reply + choices (boutons)
             │   clic bouton ERROR ───────┤ { action: select_tx, txid }
             │   saisie texte ────────────┤ POST message
             │   input text ──────────────┤ { action: fix, txid, value }
             │   input file ──────────────┤ POST endpoint + proof_done
             │   waiting:true ────────────┤
             ▼                            ▼
          mode WAITING ◄──── support:waiting
             │
             │  support:accepted
             ▼
          mode LIVE
             │
             │  support:closed
             ▼
          mode BOT (nouveau fil) + GET /thread
```

---

## 9. Exemple Next.js

```ts
"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

type Suggestion = {
  id: string;
  label: string;
  action: "select_tx";
  txid: string;
};

export function useClientSupport(accessToken: string | null) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    const socket: Socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      auth: { token: accessToken },
    });

    socket.on("support:waiting", (data: { threadId: string }) => {
      setThreadId(data.threadId);
      setWaiting(true);
      socket.emit("support:join", { threadId: data.threadId });
    });

    socket.on("support:accepted", (data: { threadId: string }) => {
      setThreadId(data.threadId);
      setWaiting(false);
      socket.emit("support:join", { threadId: data.threadId });
    });

    socket.on("support:closed", () => {
      setWaiting(false);
      setThreadId(null);
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken]);

  return { threadId, waiting };
}

export async function sendSelectedError(txid: string) {
  return api.post("/v3/chatbot/message", {
    action: "select_tx",
    txid,
  });
}

export function renderErrorButtons(items: Suggestion[]) {
  return items.map((item) => ({
    key: item.id,
    label: item.label,
    onClick: () => sendSelectedError(item.txid),
  }));
}

/** Préférer `choices` au temps 1 ; sinon `suggestions`. */
export function buttonsFromReply(data: {
  choices?: Suggestion[];
  suggestions: Suggestion[];
}) {
  return renderErrorButtons(data.choices ?? data.suggestions);
}
```

---

## 10. Checklist agent web app

- [ ] Bouton « Transactions échouées » toujours visible (`pinned`, sinon `suggestions[0]`)
- [ ] Clic de ce bouton = `{ action: "tx_error" }`
- [ ] `choices` seulement après ce clic : un bouton par transaction en erreur du jour, `label` tel quel
- [ ] Clic d’une transaction = `{ action: "select_tx", txid }` — jamais le `label` en `message`
- [ ] Retirer `choices` dès qu’il est omis, sans retirer le bouton fixe
- [ ] Message libre : bulle `reply` seulement, pas de liste, pas de bouton « parler à un agent »
- [ ] « bonjour » / FAQ : pas de liste, pas de « indiquez la référence »
- [ ] `waiting: true` → file agent
- [ ] Ne pas inventer « J’ai trouvé votre transfert… » ni un titre « Transferts en erreur aujourd’hui » en permanence
- [ ] Conserver les espaces de `reply` (ne pas coller les mots)
- [ ] Champ téléphone → `{ action: "fix", txid, value }` uniquement (9 à 15 chiffres, sans `+`)
- [ ] Fichier → `POST input.endpoint` puis `{ action: "proof_done", txid }`
- [ ] Ne pas traiter « j’ai payé » / « j’ai envoyé » / un numéro collé dans le chat comme une mise à jour de statut
- [ ] Ne jamais afficher `input.endpoint`, un UUID, ou un code `ERREUR_CAPTURE` / `MAUVAIS_NUMERO` / `MONTANT_INCORRECT` / `SEUIL_ATTEINT`
- [ ] Socket connecté au login (pas seulement dans le widget)
- [ ] `support:accepted` → banner + `payload.message` (agent prêt)
- [ ] `support:typing` si `isAdmin` → « L’agent écrit… »
- [ ] `support:message` → append bulle (`ADMIN` / `CLIENT` / `BOT`)
- [ ] `waiting` / `live` : ne pas afficher `reply` comme une nouvelle phrase bot ; utiliser `echo` + socket
- [ ] `waiting: true` → UI file + `support:join`
- [ ] Bulles `author` : CLIENT / BOT / ADMIN
- [ ] Fichier live : afficher `uri` si présent
- [ ] Lire `reply` uniquement (plus de `response` / `content`)
- [ ] Ne pas appeler `/v2/support/*` (admin)

---

## 11. Ce que tu ne fais pas

- Afficher un bloc permanent « Transferts en erreur aujourd’hui »
- Inventer un bouton « Problème avec une transaction » si `choices` est omis
- Choisir une TX à la place de l’utilisateur
- Demander une référence de transfert sur un simple bonjour
- Afficher un lien d’upload ou un code `complain`
- Changer le montant déclaré d’une TX
- Traiter un message (« j’ai envoyé », un numéro collé) comme une reprise de statut
- Rejoindre `admins-*` ou `support:{id}` d’un autre fil
- Fermer le fil (l’agent dashboard le fait)
