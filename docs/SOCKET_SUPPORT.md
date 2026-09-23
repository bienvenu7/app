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

Transactions du jour (2 temps) :

Les boutons n’existent **que** si `choices` est dans la réponse en cours. « bonjour » / FAQ / `GET /thread` → `suggestions: []`, pas de `choices`.

1. Message lié à une transaction → `reply` « Veuillez choisir la transaction pour continuer. » + `choices` = un bouton par transaction du jour (brouillons exclus, 20 max). `label` tel quel.
2. Clic → `{ "action": "select_tx", "txid": "AE12" }` — jamais le `label` en `message`. `reply` sans code interne ni lien `/v3/file/…`.

```http
{ "action": "select_tx", "txid": "AE12" }
{ "action": "fix", "txid": "AE12", "value": "79001234567" }
{ "action": "proof_done", "txid": "AE12" }
```

`input.type=file` → file picker, `POST input.endpoint` (statut inchangé), puis tout de suite `proof_done`.  
`input.type=text` / `receiverPhone` → `{ action: "fix", txid, value }` uniquement. Un `{ "message": "…" }` ne remet pas la transaction en cours.  
`suggestions` = même liste (souvent `[]` quand `choices` est rempli).

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

| Event                  | Qui                                        | Payload                                                             |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `support:request`      | Admins du pays                             | `{ threadId, clientId, preview, status: 'WAITING' }`                |
| `support:waiting`      | Client                                     | `{ threadId, status: 'WAITING' }`                                   |
| `support:accepted`     | Room + client + admins pays                | `{ threadId, adminId, status: 'LIVE', agentReady: true, message }`  |
| `support:agent-joined` | Room + client                              | `{ threadId, adminId, message }`                                    |
| `support:agent-left`   | Room + client                              | `{ threadId, adminId, message }`                                    |
| `support:message`      | Room + client (+ admins si WAITING)        | `{ id, threadId, author, text, createdAt, filename?, uri?, mime? }` |
| `support:typing`       | Room + client (+ admins si le client tape) | `{ threadId, userId, isAdmin, isTyping }`                           |
| `support:closed`       | Room + client + admins pays                | `{ threadId, status: 'CLOSED' }`                                    |
| `support:history`      | Celui qui join/accept                      | `{ threadId, status, messages }`                                    |
| `support:error`        | Émetteur                                   | `{ message }`                                                       |

`author` : `CLIENT` \| `BOT` \| `ADMIN`.

---

## Events client / admin → serveur

```ts
socket.emit("support:join", { threadId });
socket.emit("support:accept", { threadId }); // admin — première prise
socket.emit("support:message", { threadId, text });
socket.emit("support:typing", { threadId, isTyping });
socket.emit("support:leave", { threadId }); // admin quitte la vue (fil reste LIVE)
socket.emit("support:close", { threadId }); // admin ferme le fil
```

- Client : join seulement son fil. Au `connection`, un fil `WAITING` / `LIVE` le rattache tout seul.
- Admin : join / accept / leave / close si son pays = pays du client (ou rôle global).
- `support:accept` : `WAITING` → `LIVE` + bulle « Un agent est connecté… ».
- `support:join` sur un `LIVE` sans agent : bulle « Un agent a rejoint le chat. »
- `support:leave` / disconnect du dernier agent : bulle « L’agent a quitté le chat. »
- Texte live : `support:message` uniquement.

## Production (pourquoi un refresh suffisait)

L’API tourne en **3 process PM2** (`7001` / `7002` / `7003`) derrière Nginx. Sans adapter, `io.to(room)` n’atteint que les sockets **du même process**. Client et agent atterrissent souvent sur deux instances → le message est en base (visible au refresh) mais **pas poussé**.

Les 3 instances partagent maintenant les rooms via **Postgres** (`@socket.io/postgres-adapter`, table `socket_io_attachments`). CORS socket = mêmes origines que l’API (`app.afrue.com` inclus).
