# Room live unique — client web app ↔ agent dashboard

**À lire en premier** avant d’implémenter le chat humain.  
Ce fichier remplace toute interprétation des docs plus anciennes pour la **phase LIVE** (agent et client en contact).

Docs liées (bot, ERROR, inbox HTTP) :
- [`FRONTEND_CLIENT_CHAT_SUPPORT.md`](./FRONTEND_CLIENT_CHAT_SUPPORT.md) — widget bot / file d’attente
- [`FRONTEND_ADMIN_CHAT_SUPPORT.md`](./FRONTEND_ADMIN_CHAT_SUPPORT.md) — inbox HTTP
- [`SOCKET_SUPPORT.md`](./SOCKET_SUPPORT.md) — Nginx / PM2

---

## 0. Ce qui cassait (les deux captures)

| Côté | Ce qu’on voyait | Cause |
|------|-----------------|--------|
| **Dashboard** | « Bonjour monsieur » (agent) présent. « comment vous allez » (client) **absent**. Quitter / rejoindre visibles. | L’agent n’était **pas** dans `support:{threadId}`. En LIVE le serveur n’envoyait plus vers `admins-{pays}`. |
| **Web app** | Message agent visible **seulement après réouverture** du widget. Double « Un agent est connecté… ». | Le client n’écoutait pas `support:message` en live. À la réouverture : `GET /thread` (historique) + un second `support:accepted`. |

Les messages **étaient en base**. Seul le **push socket** manquait.

Le serveur force maintenant les deux sockets dans la **même room** à chaque handoff / accept / message, et pousse aussi vers les rooms déjà rejointes au handshake (`{clientId}`, `{adminId}`, `admins-{pays}`).

Les fronts doivent quand même **écouter et émettre** comme ci-dessous. Sans ça, l’UI ne bouge pas.

---

## 1. Un seul serveur, une seule room live

```
https://api.afrue.com          ← Socket.IO (même host que l’API HTTP)
room unique du fil             ← support:{threadId}
```

Il n’existe **pas** de socket dashboard vs socket client.  
Les deux apps se connectent au **même** `io('https://api.afrue.com')`.  
Ce qui change : le **JWT** et les rooms automatiques.

### Rooms après le handshake (automatique — ne pas les inventer)

| Qui | JWT | Rooms auto | Room live |
|-----|-----|------------|-----------|
| Client web app | `isAdmin: false`, `userId` = `Client.id` | `{clientId}` | `support:{threadId}` — le serveur y met le client au handoff / reconnect |
| Agent dashboard | `isAdmin: true`, `userId` = `Admin.id` | `admins-{Country.name}` + `{adminId}` | `support:{threadId}` — le serveur y met l’agent au `accept` / `join` / 1er message |

`Country.name` = code pays (`cg`, `cd`, …), **pas** l’UUID `countryId`.

### Handshake (identique, seul le token change)

```ts
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('https://api.afrue.com', {
  auth: { token: accessToken },   // même access JWT que l’HTTP
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 8,
});

// Interdit : toaster à chaque retry (boucle « websocket error »)
socket.on('connect_error', err => console.warn('[socket]', err.message));
```

| | Web app | Dashboard |
|--|---------|-----------|
| `accessToken` | JWT client v3 | JWT admin v2 |
| `isAdmin` dans le JWT | `false` | `true` |
| Refus handshake | client pas `isCheck` / `draft` | admin pas `ACTIF` |

Connecter **au login**, pas à l’ouverture du widget / de la page Support.  
**Un** socket par app. Ne pas en recréer à chaque montage.

---

## 2. Séquence obligatoire (de zéro)

```
1. Client socket connecté (login)
2. Client POST /v3/chatbot/message  { message: "agent" }
      → fil WAITING
      → serveur : client → support:{id}
      → serveur : support:waiting  → client
      → serveur : support:request  → admins-{pays}
3. Client écoute support:waiting  →  emit support:join { threadId }
4. Agent voit la carte inbox (support:request ou GET /v2/support/threads)
5. Agent emit support:accept { threadId }
      → fil LIVE
      → serveur : agent + client → support:{id}
      → support:accepted + bulle BOT « Un agent est connecté… »
6. Agent emit support:join { threadId }  →  reçoit support:history
7. À partir d’ici, TOUT texte live = socket.emit('support:message', { threadId, text })
      → serveur ré-inscrit les deux dans support:{id}
      → pousse support:message vers :
           support:{id}  +  {clientId}  +  {adminId}  +  admins-{pays}
8. Chaque front APPEND la bulle tout de suite (dédup par message.id)
```

Tant que l’étape 5 n’est pas faite, ils ne sont pas en LIVE.  
Tant que l’étape 7 n’utilise pas `support:message` **et** un listener `support:message`, l’autre ne voit rien sans refresh.

---

## 3. Types communs (les deux fronts)

```ts
type ThreadStatus = 'BOT' | 'WAITING' | 'LIVE' | 'CLOSED';
type SupportAuthor = 'CLIENT' | 'BOT' | 'ADMIN';

type SupportMessage = {
  id: string;                 // UUID — dédup obligatoire
  threadId: string;
  author: SupportAuthor;
  text: string;
  createdAt: string;
  filename?: string;
  uri?: string;
  mime?: string;
};

type SupportAccepted = {
  threadId: string;
  adminId: string;
  status: 'LIVE';
  agentReady: true;
  message: string;
  replay?: boolean;           // true = reconnect — NE PAS ré-afficher `message`
};
```

Rendu des bulles :

| `author` | Web app | Dashboard |
|----------|---------|-----------|
| `CLIENT` | à droite (moi) | à gauche (client) |
| `ADMIN` | à gauche, label Agent | à droite (moi / collègue) |
| `BOT` | système (handoff, « agent connecté / parti ») | système, lecture seule |

---

## 4. Côté CLIENT (web app) — implémentation

### 4.1 HTTP — seulement le bot et l’ouverture

```http
GET  /v3/chatbot/thread
POST /v3/chatbot/message          { "message": "…" }   ← mode BOT uniquement
POST /v3/chatbot/thread/:id/file  multipart            ← WAITING / LIVE
```

`GET /thread` au **montage** et après `support:closed`. Pas à chaque message live.

Dès que `waiting === true` ou `status` est `WAITING` / `LIVE` : **arrêter** d’attendre un `reply` IA.

En LIVE, `POST /message` fonctionne encore (le serveur pousse le socket), mais le chemin **normal** est le socket. Si tu POST : affiche `echo`, jamais `reply` (vide).

### 4.2 Socket — listeners (dès `connect`, même widget fermé)

```ts
function appendIfNew(msg: SupportMessage, setMessages: ...) {
  setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
}

socket.on('support:waiting', ({ threadId }) => {
  setThreadId(threadId);
  setStatus('WAITING');
  socket.emit('support:join', { threadId });
});

socket.on('support:accepted', (data: SupportAccepted) => {
  setThreadId(data.threadId);
  setStatus('LIVE');
  socket.emit('support:join', { threadId: data.threadId });
  // replay = le widget vient de se rouvrir : pas de nouvelle bulle
  if (!data.replay && data.message) {
    appendSystem(data.message);
  }
});

socket.on('support:message', (msg: SupportMessage) => {
  if (msg.threadId !== threadId) return;
  appendIfNew(msg);                       // AGENT / CLIENT / BOT
});

socket.on('support:agent-joined', ({ threadId, message }) => {
  if (threadId !== currentThreadId) return;
  appendSystem(message);
});

socket.on('support:agent-left', ({ threadId, message }) => {
  if (threadId !== currentThreadId) return;
  appendSystem(message);                  // le fil reste LIVE
});

socket.on('support:typing', ({ threadId, isAdmin, isTyping }) => {
  if (threadId === currentThreadId && isAdmin) setAgentTyping(isTyping);
});

socket.on('support:closed', ({ threadId }) => {
  if (threadId !== currentThreadId) return;
  setStatus('BOT');
  // GET /v3/chatbot/thread  → nouveau fil bot
});

socket.on('support:history', ({ threadId, status, messages }) => {
  if (threadId !== currentThreadId) return;
  setStatus(status);
  setMessages(messages);                  // vérité Prisma
});
```

### 4.3 Socket — emit CLIENT

```ts
// WAITING ou LIVE uniquement
socket.emit('support:join', { threadId });
socket.emit('support:message', { threadId, text });   // texte live
socket.emit('support:typing', { threadId, isTyping: true });
// debounce 1–2 s → isTyping: false
```

Le client **ne peut pas** `accept` / `leave` / `close`.

### 4.4 Envoyer un texte en LIVE (web app)

```ts
function sendLive(text: string) {
  const trimmed = text.trim();
  if (!trimmed || !threadId || status !== 'LIVE') return;
  socket.emit('support:message', { threadId, text: trimmed });
  // pas d’optimistic sans id : attendre support:message (dédup par id)
}
```

Si tu veux une bulle immédiate : ajoute un id local temporaire, remplace-le quand `support:message` arrive avec le même `text` + `author: 'CLIENT'`.

### 4.5 Checklist client

- [ ] Un socket au login vers `https://api.afrue.com`, JWT client
- [ ] Listeners `support:*` **avant** d’ouvrir le widget
- [ ] `support:join` dès `waiting` / `accepted` / `GET /thread` en WAITING|LIVE
- [ ] Texte LIVE = `support:message` (pas seulement POST)
- [ ] `support:message` → append immédiat, dédup `id`
- [ ] `accepted.replay === true` → pas de 2e « Un agent est connecté… »
- [ ] Ne pas toaster `connect_error` en boucle

---

## 5. Côté AGENT (dashboard) — implémentation

### 5.1 HTTP — inbox et historique, **pas** le texte

```http
GET  /v2/support/threads                 ← liste WAITING + LIVE
GET  /v2/support/threads/:id             ← historique (refresh / clic)
POST /v2/support/threads/:id/accept      ← optionnel (le socket suffit)
POST /v2/support/threads/:id/close
POST /v2/support/threads/:id/file        multipart
```

**Il n’y a aucun POST HTTP pour envoyer un texte.**  
`POST /accept` sans `support:join` + `support:message` = le client ne voit tes phrases qu’au refresh.

### 5.2 Socket — listeners (dès le login dashboard)

```ts
socket.on('support:request', row => {
  // badge + prepend inbox WAITING
});

socket.on('support:accepted', ({ threadId }) => {
  // carte WAITING → LIVE
});

socket.on('support:message', (msg: SupportMessage) => {
  bumpInboxPreview(msg.threadId, msg.text);
  if (msg.threadId === openThreadId) appendIfNew(msg);
});

socket.on('support:typing', ({ threadId, isAdmin, isTyping }) => {
  if (threadId === openThreadId && !isAdmin) setClientTyping(isTyping);
});

socket.on('support:history', ({ threadId, messages, status }) => {
  if (threadId === openThreadId) {
    setMessages(messages);
    setStatus(status);
  }
});

socket.on('support:closed', ({ threadId }) => removeFromInbox(threadId));
socket.on('support:error', ({ message }) => toast(message));
```

Écouter `support:message` **globalement**, pas seulement après avoir ouvert le fil. Sinon le message client arrive dans le vide.

### 5.3 Ouvrir un fil (clic inbox) — ordre fixe

```ts
async function openThread(threadId: string) {
  const { data } = await api.get(`/v2/support/threads/${threadId}`);
  setOpenThreadId(threadId);
  setMessages(data.messages);

  if (data.thread.status === 'WAITING') {
    socket.emit('support:accept', { threadId });   // LIVE + room + notice client
  }
  socket.emit('support:join', { threadId });       // room + support:history
}
```

### 5.4 Envoyer / quitter

```ts
function sendLive(text: string) {
  socket.emit('support:message', { threadId: openThreadId, text: text.trim() });
}

function onUnmountConversation() {
  socket.emit('support:leave', { threadId: openThreadId });
  // → client : « L’agent a quitté le chat. »  (fil reste LIVE)
}

function closeThread() {
  socket.emit('support:close', { threadId: openThreadId });
  // ou POST /v2/support/threads/:id/close
}
```

### 5.5 Checklist agent

- [ ] Un socket au login vers `https://api.afrue.com`, JWT **admin**
- [ ] `support:request` + `support:message` écoutés **dès le login** (pas seulement page Support)
- [ ] Clic fil → `accept` (si WAITING) **puis** `join`
- [ ] Texte = uniquement `socket.emit('support:message', { threadId, text })`
- [ ] Append immédiat, dédup `id`
- [ ] Quitter la vue → `support:leave` (sinon le client croit que tu es encore là)
- [ ] Ne pas appeler `/v3/chatbot/*`

---

## 6. Table events (référence unique)

### Serveur → les deux

| Event | Client | Agent | Payload | UI |
|-------|:------:|:-----:|---------|----|
| `support:request` | — | oui | `{ threadId, clientId, preview, status:'WAITING' }` | Inbox |
| `support:waiting` | oui | — | `{ threadId, status:'WAITING' }` | File + `join` |
| `support:accepted` | oui | oui | `{ threadId, adminId, status:'LIVE', agentReady, message, replay? }` | Mode LIVE. Si `replay` : pas de bulle |
| `support:message` | oui | oui | `SupportMessage` | **Append immédiat** |
| `support:typing` | si `isAdmin` | si `!isAdmin` | `{ threadId, userId, isAdmin, isTyping }` | « … écrit » |
| `support:agent-joined` | oui | oui | `{ threadId, adminId, message }` | Bulle système |
| `support:agent-left` | oui | oui | `{ threadId, adminId, message }` | Bulle système, fil ouvert |
| `support:history` | après join | après join/accept | `{ threadId, status, messages }` | Remplacer les bulles |
| `support:closed` | oui | oui | `{ threadId, status:'CLOSED' }` | Retour bot / retire inbox |
| `support:error` | émetteur | émetteur | `{ message }` | Toast |

### Front → serveur

| Event | Client | Agent | Body |
|-------|:------:|:-----:|------|
| `support:join` | oui | oui | `{ threadId }` |
| `support:accept` | — | oui | `{ threadId }` |
| `support:message` | oui (LIVE) | **obligatoire** | `{ threadId, text }` max 2000 |
| `support:typing` | oui | oui | `{ threadId, isTyping }` |
| `support:leave` | — | oui | `{ threadId }` |
| `support:close` | — | oui | `{ threadId }` |

---

## 7. Règles anti-incohérence (à coller dans les deux agents IA)

1. **Même host** : `https://api.afrue.com` — jamais `app.afrue.com` ni `dashbord.afrue.com` comme URL socket.
2. **Bon JWT** : client ≠ admin. Un token de l’autre côté = `connect_error` 403.
3. **Un socket** créé au login, vivant jusqu’au logout.
4. **Room live** = `support:{threadId}`. Personne ne la « crée » à la main : `join` / `accept` / 1er `message`.
5. **Texte live = event `support:message`**, les deux sens. HTTP ne sert que le bot (client) et l’inbox (agent).
6. **Dédup** : n’afficher un `SupportMessage` que si `id` est nouveau.
7. **`replay: true`** : changer le mode, ne pas empiler une 2e phrase système.
8. Filtrer tout event par `threadId === fil ouvert`.
9. Optimistic UI sans `id` serveur = doublon garanti quand le socket revient.
10. Nginx : `ip_hash` + `location /socket.io/` avec `Upgrade` — sinon le handshake casse avant les rooms.

---

## 8. Mini hooks prêts à coller

### Web app

```ts
'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useClientLiveChat(accessToken: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [status, setStatus] = useState<'BOT' | 'WAITING' | 'LIVE' | 'CLOSED'>('BOT');
  const [messages, setMessages] = useState<SupportMessage[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;
    socket.on('connect_error', e => console.warn('[socket]', e.message));

    const join = (id: string) => socket.emit('support:join', { threadId: id });

    socket.on('support:waiting', ({ threadId: id }) => {
      setThreadId(id);
      setStatus('WAITING');
      join(id);
    });
    socket.on('support:accepted', (d: SupportAccepted) => {
      setThreadId(d.threadId);
      setStatus('LIVE');
      join(d.threadId);
    });
    socket.on('support:message', (msg: SupportMessage) => {
      setThreadId(id => id ?? msg.threadId);
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    });
    socket.on('support:history', ({ threadId: id, status: s, messages: rows }) => {
      setThreadId(id);
      setStatus(s);
      setMessages(rows);
    });
    socket.on('support:closed', () => {
      setStatus('CLOSED');
      setThreadId(null);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken]);

  const send = (text: string) => {
    if (!threadId || !text.trim()) return;
    socketRef.current?.emit('support:message', { threadId, text: text.trim() });
  };

  return { threadId, status, messages, send };
}
```

### Dashboard

```ts
'use client';
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export function useAdminLiveChat(accessToken: string | null) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;
    socket.on('connect_error', e => console.warn('[socket]', e.message));
    return () => socket.disconnect();
  }, [accessToken]);

  const openThread = (threadId: string, isWaiting: boolean) => {
    const s = socketRef.current;
    if (!s) return;
    if (isWaiting) s.emit('support:accept', { threadId });
    s.emit('support:join', { threadId });
  };

  const send = (threadId: string, text: string) => {
    socketRef.current?.emit('support:message', { threadId, text: text.trim() });
  };

  const leave = (threadId: string) => {
    socketRef.current?.emit('support:leave', { threadId });
  };

  return { socketRef, openThread, send, leave };
}
```

Brancher sur ce `socketRef` les listeners du §5.2 **une seule fois** (pas dans le composant conversation qui se démonte).
