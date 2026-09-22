# Chat & support — app web client

**Destinataire :** frontend `money-transfer-app`  
**API :** préfixe `/v3` — JWT client uniquement (`isAdmin: false`)  
**Backend déjà livré.** Ce guide est le contrat pour le widget chat.

Docs liées :
- [`FRONTEND_CLIENT_API_V3.md`](./FRONTEND_CLIENT_API_V3.md) — reste de l’app
- [`SOCKET_TRANSACTIONS.md`](./SOCKET_TRANSACTIONS.md) — events transaction (même socket)
- [`SOCKET_SUPPORT.md`](./SOCKET_SUPPORT.md) — résumé events support

---

## 1. Ce que l’utilisateur voit

Trois modes, un seul widget :

| Mode | `thread.status` | Comportement UI |
|------|-----------------|-----------------|
| Bot | `BOT` | Bulles texte. Toujours le bouton **Problème avec une transaction**. Si l’API envoie `choices` / `input`, afficher boutons ou champ. |
| File d’attente | `WAITING` | Message « un agent va vous répondre ». Plus d’appel bot. Écouter la socket. |
| Agent | `LIVE` | Chat temps réel. Pièces jointes. Indicateur « en train d’écrire ». |
| Fermé | `CLOSED` ou pas de fil | Le prochain message rouvre un fil `BOT`. |

`GET /v3/chatbot/thread` au montage et après refresh décide le mode.

---

## 2. Auth

```http
Authorization: Bearer <accessToken>
```

Même JWT que le reste de l’app v3. TTL access **900 s**. Cookie `refresh` HttpOnly.

Socket :

```ts
const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
  auth: { token: accessToken },
  transports: ['websocket', 'polling'],
});
```

Le client rejoint automatiquement la room `{userId}`. Ne pas inventer d’autres rooms.

---

## 3. Types à coller

```ts
type ThreadStatus = 'BOT' | 'WAITING' | 'LIVE' | 'CLOSED';
type SupportAuthor = 'CLIENT' | 'BOT' | 'ADMIN';

type ChatSuggestion = {
  id: string;   // aujourd’hui toujours "tx_error"
  label: string; // "Problème avec une transaction"
};

type ChatChoice = {
  id: string;
  label: string;
  action: 'tx_error' | 'select_tx' | 'fix' | 'proof_done' | 'handoff' | string;
  txid?: string;
  value?: string;
};

type ChatInput =
  | { type: 'text'; name: 'receiverPhone'; placeholder: string }
  | { type: 'file'; transactionId: string; endpoint: string };

type ChatbotRequest = {
  message?: string;
  action?: 'tx_error' | 'select_tx' | 'fix' | 'proof_done' | 'handoff';
  txid?: string;
  value?: string;
};

type ChatbotReply = {
  reply: string;
  threadId: string;
  suggestions: ChatSuggestion[];
  waiting?: boolean;
  choices?: ChatChoice[];
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
};
```

Un champ **omis** ≠ `null`. Tester `if (data.choices)`, `if (msg.uri)`.

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
    { "id": "tx_error", "label": "Problème avec une transaction" }
  ]
}
```

Si `thread` est `null` : widget vide + suggestion. Le premier `POST /message` crée le fil.

| `status` | Au chargement |
|----------|----------------|
| `BOT` | Afficher `messages`. Zone de saisie bot. |
| `WAITING` | Afficher `messages`. `socket.emit('support:join', { threadId })`. Plus de `POST` bot « intelligent ». |
| `LIVE` | Idem + saisie live + pièces jointes. |
| absent / `CLOSED` | Nouveau chat bot. |

### 4.2 Envoyer un message (bot ou assistant guidé)

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
Ajouter `waiting: true` si un agent est demandé.  
Ajouter `choices` / `input` pendant le parcours erreur.

Rate limit : **10 / minute** → **429**.

| HTTP | Sens |
|------|------|
| 400 | Ni `message` ni `action`, ou message > 2000 |
| 403 | Pas de JWT client |
| 429 | Trop de messages |
| 502 / 503 | IA indisponible (uniquement mode bot libre) |

### 4.3 Pièce jointe vers l’agent (WAITING / LIVE seulement)

```http
POST /v3/chatbot/thread/:threadId/file
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

| Champ | Requis | |
|-------|--------|--|
| `file` | oui | JPEG, PNG, WebP, PDF — max **10 Mo** |
| `comment` | non | Légende |

**201** `{ threadId, status, message }` où `message` a `uri` / `filename` / `mime`.

**409** si le fil est encore `BOT` ou déjà `CLOSED`.

Ce n’est **pas** la preuve de paiement d’une transaction (voir §6).

---

## 5. Suggestion permanente + parcours erreur

Chaque `ChatbotReply` et `GET /thread` contient `suggestions`.  
Afficher **toujours** le bouton `suggestions[0].label`.

Clic → **ne pas** envoyer le label en `message`. Envoyer l’action :

```json
{ "action": "tx_error" }
```

### 5.1 Liste du jour

L’API charge les TX `ERROR` du client dont `dateTime` = aujourd’hui (`DD-MM-YYYY`).

`choices[]` — afficher uniquement le `label` (déjà formaté) :

```
{txid} · {montant envoyé} · {nom destinataire}
```

Clic sur une ligne :

```json
{ "action": "select_tx", "txid": "AE12" }
```

Liste vide : `reply` l’explique + éventuellement un bouton `handoff`.

### 5.2 Détail — quoi corriger

Selon le motif **admin** (`complain`, jamais exposé tel quel) :

| Motif | `reply` (idée) | UI |
|-------|----------------|-----|
| Mauvais numéro | Nouveau n° du destinataire | `input.type = "text"`, `name = "receiverPhone"` |
| Preuve illisible | Photo nette du reçu | `input.type = "file"` |
| Montant incorrect | Renvoyer le **bon** montant + preuve, sinon nouvelle TX | `input.type = "file"` |
| Seuil atteint | Autre n° **ou** agent | texte + `choices` (`handoff`) |

### 5.3 Corriger un numéro

```json
{ "action": "fix", "txid": "AE12", "value": "79001234567" }
```

Chiffres seuls, indicatif, **9 à 15** digits, **sans** `+`.  
Si l’utilisateur tape le numéro dans le champ chat alors que `input.name === 'receiverPhone'`, tu peux envoyer `{ "message": "79001234567" }` : le bot le comprend.

Succès : TX repasse en `INPROGRESS`. Afficher `reply`. Plus de `choices`.

### 5.4 Corriger une preuve

`input.endpoint` ressemble à `/v3/file/upload/{transactionId}` (`id` UUID, pas le txid).

```http
POST /v3/file/upload/:transactionId
Content-Type: multipart/form-data
```

Champ `file` (+ `comment` optionnel). **201** `{ ok: true }`.

Puis :

```json
{ "action": "proof_done", "txid": "AE12" }
```

Si aucune preuve n’est arrivée, l’API redemande le fichier.

### 5.5 Parler à un agent depuis le parcours

```json
{ "action": "handoff" }
```

ou le bouton `choices` dont `action === "handoff"`.

---

## 6. Mode bot libre (FAQ / statut)

`{ "message": "…" }` sans `action`.

L’IA peut citer **tes** TX (statut, txid) mais n’invente pas.  
Dès que `waiting === true` : basculer en file d’attente (§7). Ne plus appeler DeepSeek via ce POST « pour une réponse ».

Tu peux encore `POST /message` en `WAITING` : le texte est **stocké et poussé à l’agent**, la réponse HTTP est `{ reply, waiting: true }` (pas une nouvelle phrase IA).

---

## 7. File d’attente et agent (socket)

### Events à écouter (dès la connexion, pas seulement dans le chat)

| Event | Quand | UI |
|-------|-------|-----|
| `support:waiting` | Handoff | Mode file. `threadId` dans le payload. |
| `support:accepted` | Un agent a pris le fil | Mode LIVE. `support:join` si pas déjà fait. |
| `support:message` | Nouveau message | Ajouter la bulle (`author`, `text`, `uri` si fichier). |
| `support:typing` | Agent écrit | Indicateur. |
| `support:closed` | Agent a fermé | Revenir au bot. Vider la saisie live. |
| `support:history` | Après `join` | Remplacer la liste par `messages`. |
| `support:error` | Refus (mauvais fil, etc.) | Toast `message`. |

### Events à émettre

```ts
socket.emit('support:join', { threadId });
socket.emit('support:message', { threadId, text }); // LIVE / WAITING
socket.emit('support:typing', { threadId, isTyping: true });
```

Le client **ne peut pas** `accept` ni `close`.

### Refresh

1. `GET /v3/chatbot/thread`
2. Si `WAITING` ou `LIVE` → reconnecter la socket → `support:join`
3. Afficher `messages` (historique Prisma, survit au refresh)

### Pièce jointe live

`POST /v3/chatbot/thread/:id/file` puis la socket envoie `support:message` avec `uri`.  
Afficher image si `mime` commence par `image/`, sinon lien `filename`.

---

## 8. États UI (machine)

```
montage → GET /thread
             │
             ├─ null / BOT ──────────► mode BOT
             │                            │
             │   clic suggestion ─────────┤ action tx_error
             │   clic choice ─────────────┤ action + txid
             │   saisie texte ────────────┤ POST message
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
          mode BOT (nouveau fil)
```

---

## 9. Exemple Next.js (hook)

```ts
'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useClientSupport(accessToken: string | null) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    const socket: Socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      auth: { token: accessToken },
    });

    socket.on('support:waiting', (data: { threadId: string }) => {
      setThreadId(data.threadId);
      setWaiting(true);
      socket.emit('support:join', { threadId: data.threadId });
    });

    socket.on('support:accepted', (data: { threadId: string }) => {
      setThreadId(data.threadId);
      setWaiting(false);
      socket.emit('support:join', { threadId: data.threadId });
    });

    socket.on('support:closed', () => {
      setWaiting(false);
      setThreadId(null);
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken]);

  return { threadId, waiting };
}
```

Envoyer un message bot :

```ts
await api.post('/v3/chatbot/message', { message });
// ou
await api.post('/v3/chatbot/message', { action: 'tx_error' });
await api.post('/v3/chatbot/message', { action: 'select_tx', txid });
```

---

## 10. Checklist front client

- [ ] `GET /v3/chatbot/thread` au open du widget et au refresh
- [ ] Bouton `suggestions` **toujours** visible en mode bot
- [ ] Clic suggestion = `{ action: "tx_error" }`, pas le libellé en `message`
- [ ] Rendre `choices` comme boutons (`action` + `txid`)
- [ ] `input.type === "text"` → champ n° ; submit = `{ action: "fix", txid, value }`
- [ ] `input.type === "file"` → upload `input.endpoint` puis `{ action: "proof_done", txid }`
- [ ] `waiting: true` → UI file + socket `support:join`
- [ ] Bulles `author` : CLIENT / BOT / ADMIN
- [ ] Fichier : afficher `uri` si présent
- [ ] Plus de fallback `response` / `content` : lire `reply`
- [ ] Ne pas appeler `/v2/support/*` (admin)

---

## 11. Ce que le client ne fait pas

- Voir `complain`, email d’un autre client, ou TX qui ne sont pas à lui
- Rejoindre `admins-*` ou `support:{id}` d’un autre fil
- Fermer le fil (l’agent le fait)
- Corriger une TX qui n’est pas `ERROR` aujourd’hui via ce parcours (liste du jour uniquement)
