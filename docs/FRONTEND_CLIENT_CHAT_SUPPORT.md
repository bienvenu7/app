# Chat client — brief pour l’agent IA de la web app

**Destinataire :** agent IA qui implémente le widget chat dans `money-transfer-app`.  
**API :** préfixe `/v3` — JWT client uniquement (`isAdmin: false`).  
**Backend déjà livré.** Tu n’inventes ni taux, ni statut, ni `txid`, ni motif d’erreur.

Docs liées :

- [`FRONTEND_CLIENT_API_V3.md`](./FRONTEND_CLIENT_API_V3.md) — reste de l’app
- [`SOCKET_TRANSACTIONS.md`](./SOCKET_TRANSACTIONS.md) — events transaction (même socket)
- [`SOCKET_SUPPORT.md`](./SOCKET_SUPPORT.md) — events support

---

## 0. Règle produit (à respecter)

Chaque transaction **ERROR du jour** (celle du client connecté, `dateTime` = aujourd’hui `DD-MM-YYYY`) est un **message présélectionné**.

- Affiche **une puce par TX**, pas un bouton générique « Problème avec une transaction ».
- Le `label` est déjà formaté : `{txid} · {amountToSend} · {receiverName}`.
- Au clic : envoie `{ action: "select_tx", txid }` — **jamais** le `label` dans `message`.
- L’IA **backend** (DeepSeek) reçoit le détail (`complain`) et guide l’utilisateur pour **corriger et reprendre** la TX (`ERROR` → `INPROGRESS`).
- Après succès, la TX sort de la liste : `suggestions` est recalculée. Mets à jour les puces avec **chaque** réponse.

S’il n’y a aucune ERROR aujourd’hui : `suggestions: []`. Pas de puce fantôme. Le chat FAQ reste disponible.

---

## 1. Ce que l’utilisateur voit

Trois modes, un seul widget :

| Mode           | `thread.status`        | Comportement UI                                                                                                          |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Bot            | `BOT`                  | Bulles. Puces = TX ERROR du jour. Si `input` est présent, afficher le champ / l’upload demandé.                          |
| File d’attente | `WAITING`              | « Un agent va vous répondre ». Plus d’appel bot libre. Socket. Les puces ERROR restent utilisables pour auto-correction. |
| Agent          | `LIVE`                 | Chat temps réel. Pièces jointes. Typing. Les puces ERROR ne relancent **pas** le bot : tout passe à l’agent.             |
| Fermé          | `CLOSED` ou pas de fil | Le prochain message crée un fil `BOT`.                                                                                   |

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

/** Une TX ERROR du jour — message présélectionné. */
type ChatSuggestion = {
  id: string; // "select_tx:{txid}"
  label: string; // "AE12 · 150 · Ali"
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

Un champ **omis** ≠ `null`. Tester `if (data.input)`, `if (msg.uri)`.

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
  "suggestions": [
    {
      "id": "select_tx:AE12",
      "label": "AE12 · 150 · Ali K.",
      "action": "select_tx",
      "txid": "AE12"
    }
  ]
}
```

Si `thread` est `null` : widget vide + puces ERROR s’il y en a. Le premier `POST /message` crée le fil.

Si un parcours erreur est en cours, `input` peut déjà être présent (après refresh).

| `status`          | Au chargement                                                     |
| ----------------- | ----------------------------------------------------------------- |
| `BOT`             | Afficher `messages`. Zone de saisie. Puces `suggestions`.         |
| `WAITING`         | Afficher `messages`. `socket.emit('support:join', { threadId })`. |
| `LIVE`            | Idem + saisie live + pièces jointes.                              |
| absent / `CLOSED` | Nouveau chat bot.                                                 |

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
`waiting: true` = un agent est demandé.  
`input` = champ à afficher pour finir la correction.

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

## 5. Puces ERROR + résolution par l’IA backend

### 5.1 Afficher les messages présélectionnés

Chaque `GET /thread` et chaque `POST /message` renvoie `suggestions`.

- Rendre **toutes** les puces (`label` tel quel).
- Tableau vide = aucune ERROR aujourd’hui. Ne pas inventer de bouton.
- Remplacer les puces à **chaque** réponse (une TX corrigée disparaît).

Clic sur une puce :

```json
{ "action": "select_tx", "txid": "AE12" }
```

Utilise `suggestion.action` et `suggestion.txid`. N’envoie pas `label` en `message`.

L’IA backend :

1. Charge **cette** TX si elle est encore `ERROR` et appartient au client.
2. Explique le motif admin (`complain`) en langage naturel — tu ne l’affiches jamais brut.
3. Demande **uniquement** la donnée manquante.
4. Renvoie `input` pour que tu affiches le bon contrôle.

### 5.2 Ce que l’IA peut corriger (et met à jour en base)

| Motif admin       | L’IA demande                             | Contrôle `input`         | Mise à jour réelle                         |
| ----------------- | ---------------------------------------- | ------------------------ | ------------------------------------------ |
| Mauvais numéro    | Nouveau n° destinataire                  | `text` / `receiverPhone` | `update_receiver_phone` → TX `INPROGRESS`  |
| Seuil atteint     | Autre n° **ou** agent                    | `text` / `receiverPhone` | idem, ou `handoff`                         |
| Preuve illisible  | Nouveau reçu                             | `file` + `endpoint`      | upload puis `confirm_proof` → `INPROGRESS` |
| Montant incorrect | Renvoyer le **montant déclaré** + preuve | `file`                   | idem. **Ne jamais changer le montant**     |

Tu n’appelles pas ces tools. Le backend les exécute, scoped au JWT.

### 5.3 L’utilisateur donne un numéro

Si `input.type === "text"` et `input.name === "receiverPhone"` :

```json
{ "action": "fix", "txid": "AE12", "value": "79001234567" }
```

Chiffres seuls, indicatif, **9 à 15** digits, **sans** `+`.

S’il tape le numéro dans le champ chat, `{ "message": "79001234567" }` suffit : le backend le détecte et met à jour.

Succès : `reply` confirme la reprise. La puce de cette TX disparaît de `suggestions`.

### 5.4 L’utilisateur envoie une preuve

`input.endpoint` = `/v3/file/upload/{transactionId}` (`id` UUID, **pas** le txid).

```http
POST /v3/file/upload/:transactionId
Content-Type: multipart/form-data
```

Champ `file` (+ `comment` optionnel). **201** `{ ok: true }`.

Puis :

```json
{ "action": "proof_done", "txid": "AE12" }
```

L’IA backend vérifie qu’un fichier existe, reprend la TX, et te le dit. Si aucun fichier : `reply` redemande l’upload.

### 5.5 Agent humain

```json
{ "action": "handoff" }
```

ou un message du type « parler à un agent ».

Dès que `waiting === true` : mode file (§7).

---

## 6. Mode bot libre (FAQ / statut)

`{ "message": "…" }` sans `action`.

L’IA peut citer **les** TX du client (statut, txid) mais n’invente pas.  
Si l’utilisateur décrit un problème de transfert sans cliquer une puce, l’IA voit la liste ERROR du jour et peut l’orienter.

Dès que `waiting === true` : basculer en file. Ne plus attendre une nouvelle phrase DeepSeek.

Tu peux encore `POST /message` en `WAITING` : le texte est **stocké et poussé à l’agent**, la réponse HTTP est `{ reply, waiting: true }`.

---

## 7. File d’attente et agent (socket)

### Events à écouter (dès la connexion)

| Event              | Quand                  | UI                                                     |
| ------------------ | ---------------------- | ------------------------------------------------------ |
| `support:waiting`  | Handoff                | Mode file. `threadId` dans le payload.                 |
| `support:accepted` | Un agent a pris le fil | Mode LIVE. `support:join` si pas déjà fait.            |
| `support:message`  | Nouveau message        | Ajouter la bulle (`author`, `text`, `uri` si fichier). |
| `support:typing`   | Agent écrit            | Indicateur.                                            |
| `support:closed`   | Agent a fermé          | Revenir au bot. Recharger `GET /thread` (puces ERROR). |
| `support:history`  | Après `join`           | Remplacer la liste par `messages`.                     |
| `support:error`    | Refus                  | Toast `message`.                                       |

### Events à émettre

```ts
socket.emit("support:join", { threadId });
socket.emit("support:message", { threadId, text }); // LIVE / WAITING
socket.emit("support:typing", { threadId, isTyping: true });
```

Le client **ne peut pas** `accept` ni `close`.

### Refresh

1. `GET /v3/chatbot/thread`
2. Si `WAITING` ou `LIVE` → reconnecter → `support:join`
3. Afficher `messages` + `suggestions` + `input` éventuel

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
             │   clic puce ERROR ─────────┤ { action: select_tx, txid }
             │   saisie texte ────────────┤ POST message
             │   input text ──────────────┤ { action: fix, txid, value }
             │   input file ──────────────┤ upload endpoint + proof_done
             │   waiting:true ────────────┤
             ▼                            ▼
          mode WAITING ◄──── support:waiting
             │
             │  support:accepted
             ▼
          mode LIVE
             │
             │  support:closed  ou  prochain POST après CLOSED
             ▼
          mode BOT (nouveau fil) + GET /thread pour les puces
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

export function renderSuggestions(suggestions: Suggestion[]) {
  return suggestions.map((item) => ({
    key: item.id,
    label: item.label,
    onClick: () => sendSelectedError(item.txid),
  }));
}
```

---

## 10. Checklist agent web app

- [ ] `GET /v3/chatbot/thread` à l’ouverture du widget et au refresh
- [ ] Une puce **par** entrée de `suggestions` (`label` tel quel)
- [ ] Clic puce = `{ action: suggestion.action, txid: suggestion.txid }`
- [ ] Ne jamais poster le `label` en `message`
- [ ] Remplacer les puces après **chaque** `POST /message`
- [ ] `input.type === "text"` → champ n° ; submit = `{ action: "fix", txid, value }`
- [ ] `input.type === "file"` → `POST input.endpoint` puis `{ action: "proof_done", txid }`
- [ ] `waiting: true` → UI file + `support:join`
- [ ] Bulles `author` : CLIENT / BOT / ADMIN
- [ ] Fichier : afficher `uri` si présent
- [ ] Lire `reply` uniquement (plus de `response` / `content`)
- [ ] Ne pas appeler `/v2/support/*` (admin)
- [ ] Ne pas afficher `complain`, email d’un autre client, ou TX étrangères

---

## 11. Ce que tu ne fais pas

- Inventer une puce « Problème avec une transaction » si `suggestions` est vide
- Changer le montant déclaré d’une TX
- Corriger une TX qui n’est plus `ERROR` (l’API répondra que ce n’est plus possible)
- Rejoindre `admins-*` ou `support:{id}` d’un autre fil
- Fermer le fil (l’agent dashboard le fait)
