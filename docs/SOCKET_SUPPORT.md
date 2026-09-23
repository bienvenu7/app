# Socket.IO — Support client ↔ agent

Auth identique aux transactions : `auth.token` = JWT access.

Rooms automatiques au `connection` : admin → `admins-{codePays}` + `{userId}` ; client → `{userId}`.

La room de fil `support:{threadId}` se rejoint avec `support:join` / `support:accept`.

---

## HTTP

### Client

```http
POST /v3/chatbot/message
{ "message": "…" }
→ { reply, threadId, suggestions, waiting?, choices?, input? }
```

Parcours ERROR (2 temps) :

Les boutons ERROR n’existent **que** si le client vient d’en parler. « bonjour » / `GET /thread` → `suggestions: []`, pas de `choices`.

1. Message « problème avec une transaction » → `reply` « Veuillez choisir la transaction pour continuer. » + `choices` = un bouton par TX ERROR (`{ id, label, action: "select_tx", txid }`).
2. Clic → `{ "action": "select_tx", "txid": "AE12" }` → l’IA guide la correction. `reply` sans code interne ni lien `/v3/file/…`.

```http
{ "action": "select_tx", "txid": "AE12" }
{ "action": "fix", "txid": "AE12", "value": "79001234567" }
{ "action": "proof_done", "txid": "AE12" }
```

`input.type=file` → file picker front, `POST input.endpoint`, puis `proof_done`.  
`input.type=text` → nouvel `receiverPhone`.  
`suggestions` = même liste ERROR (peut être vide).

Si `waiting: true`, ne plus attendre DeepSeek : écouter la socket.

```http
GET /v3/chatbot/thread
→ { thread: { id, status, createdAt, updatedAt } | null, messages }
```

Après un refresh : si `status` est `WAITING` ou `LIVE`, émettre `support:join` avec `thread.id`.

```http
POST /v3/chatbot/thread/:id/file
Content-Type: multipart/form-data
file=<jpeg|png|webp|pdf>  (max 10 Mo)
comment?=légende
→ 201 { threadId, status, message }
```

Uniquement si le fil est `WAITING` ou `LIVE`. Le message (avec `uri`) est poussé en socket.

Si aucun agent du pays n’est connecté au handoff : Telegram (admins du pays + DEV/SUPER_ADMIN, sinon canal pays, sinon `SUPER_ADMIN_TG`) et web-push.

### Admin

```http
GET    /v2/support/threads?status=WAITING
GET    /v2/support/threads/:id
POST   /v2/support/threads/:id/accept
POST   /v2/support/threads/:id/close
POST   /v2/support/threads/:id/file   (multipart, même contrat que le client)
```

Un agent ne voit que les fils de son pays. `DEV` / `SUPER_ADMIN` voient tout.

---

## Events serveur → clients

| Event | Qui | Payload |
|---|---|---|
| `support:request` | Admins du pays | `{ threadId, clientId, preview, status: 'WAITING' }` |
| `support:waiting` | Client | `{ threadId, status: 'WAITING' }` |
| `support:accepted` | Room + client + admins pays | `{ threadId, adminId, status: 'LIVE', agentReady: true, message }` |
| `support:message` | Room + client (+ admins si WAITING) | `{ id, threadId, author, text, createdAt, filename?, uri?, mime? }` |
| `support:typing` | Room + client (+ admins si le client tape) | `{ threadId, userId, isAdmin, isTyping }` |
| `support:closed` | Room + client + admins pays | `{ threadId, status: 'CLOSED' }` |
| `support:history` | Celui qui join/accept | `{ threadId, status, messages }` |
| `support:error` | Émetteur | `{ message }` |

`author` : `CLIENT` \| `BOT` \| `ADMIN`.

---

## Events client / admin → serveur

```ts
socket.emit('support:join', { threadId });
socket.emit('support:accept', { threadId }); // admin
socket.emit('support:message', { threadId, text });
socket.emit('support:typing', { threadId, isTyping });
socket.emit('support:close', { threadId }); // admin
```

- Client : join seulement son fil. Au `connection`, un fil `WAITING` / `LIVE` le rattache tout seul et renvoie `waiting` ou `accepted`.
- Admin : join / accept / close seulement si son pays = pays du client (ou rôle global).
- `support:accept` (ou 1er message admin) : `WAITING` → `LIVE`, le client reçoit `accepted` + une bulle bot « Un agent est connecté… ».
- Texte live : `support:message` uniquement. CORS socket = mêmes origines que l’API (`app.afrue.com` inclus).
- Un autre agent du même pays peut reprendre (`support:join` sur un fil `LIVE`).
- `CLOSED` : le prochain `POST /v3/chatbot/message` du client ouvre un nouveau fil `BOT`.
