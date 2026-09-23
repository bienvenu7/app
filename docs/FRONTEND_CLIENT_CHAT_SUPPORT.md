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

### Les TX en erreur n’apparaissent que si le client en parle

**Interdit** : un bloc permanent « Transferts en erreur aujourd’hui » sous un « bonjour », une FAQ, ou au montage du widget.

| Situation                                              | Boutons ERROR                                | L’IA parle des ERROR                                |
| ------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------- |
| « bonjour », salut, FAQ, statut                        | **Aucun.** `suggestions: []`, `choices` omis | Non                                                 |
| `GET /thread` au open / refresh                        | **Aucun.** `suggestions: []`                 | Non                                                 |
| Le client **écrit** qu’il a un problème de transaction | `choices` = un bouton par TX ERROR           | « Veuillez choisir la transaction pour continuer. » |
| Clic sur un bouton                                     | `input` (champ / file picker)                | Motif en langage courant + correction               |

Si `choices` est **omis** dans **cette** réponse : retire les boutons. Ne recycle pas une ancienne liste.

### Parcours erreur = 2 temps (seulement après notification client)

| Temps | Déclencheur                                     | `reply`                                             | Boutons   |
| ----- | ----------------------------------------------- | --------------------------------------------------- | --------- |
| 1     | Le client **parle** d’une erreur de transaction | « Veuillez choisir la transaction pour continuer. » | `choices` |
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
| Bot            | `BOT`                  | Bulles. Boutons ERROR **uniquement** si `choices` est dans la dernière réponse. Si `input` : champ ou file picker. |
| File d’attente | `WAITING`              | « Un agent va vous répondre ». Socket. Les boutons ERROR restent utilisables pour auto-correction.                 |
| Agent          | `LIVE`                 | Chat temps réel. Pièces jointes. Typing. Les boutons ERROR ne relancent **pas** le bot.                            |
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

/** Une TX ERROR du jour — un bouton. */
type ChatSuggestion = {
  id: string; // "select_tx:{txid}"
  label: string; // "AE12 · 150 · Ali K."
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

Si `thread` est `null` : widget vide, **sans** liste ERROR. Le premier `POST /message` crée le fil.

Si un parcours erreur est en cours, `input` peut déjà être présent (après refresh).

| `status`          | Au chargement                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `BOT`             | Afficher `messages`. Zone de saisie. **Pas** de boutons ERROR (sauf si tu viens d’un POST qui a renvoyé `choices`). |
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

## 5. Parcours ERROR

### 5.1 Temps 1 — le client parle d’une erreur

Exemples de `message` : « j’ai un problème avec une transaction », « transfert en erreur », « preuve refusée ».

**Réponse à afficher telle quelle :**

```json
{
  "reply": "Veuillez choisir la transaction pour continuer.",
  "choices": [
    {
      "id": "select_tx:AE12",
      "label": "AE12 · 150 · Ali K.",
      "action": "select_tx",
      "txid": "AE12"
    },
    {
      "id": "select_tx:AE13",
      "label": "AE13 · 80 · Fatou D.",
      "action": "select_tx",
      "txid": "AE13"
    }
  ],
  "suggestions": ["…même liste…"]
}
```

Rendu :

1. Bulle bot = `reply` uniquement.
2. Sous la bulle : **un bouton par** `choices[]` (préféré) ou `suggestions[]`. `label` tel quel.
3. Clic = `{ "action": "select_tx", "txid": item.txid }`. **Jamais** le `label` en `message`.

Liste vide : pas de bouton. `reply` = « Aucune transaction en erreur aujourd’hui. »

### 5.2 Temps 2 — après le clic

```json
{ "action": "select_tx", "txid": "AE12" }
```

**Alors seulement** l’IA backend :

1. Charge **cette** TX si elle est encore `ERROR` et appartient au client.
2. Explique le motif en langage naturel. Jamais `(ERREUR_CAPTURE)`.
3. Demande **uniquement** la donnée manquante.
4. Renvoie `input` pour le contrôle.

Exemple de `reply` correct : « La photo du paiement n’a pas été acceptée. Envoyez un justificatif plus net. »  
Exemple interdit : « … (ERREUR_CAPTURE). Téléversez via /v3/file/upload/e7c2d590-… »

### 5.3 Ce que l’IA corrige (tu n’appelles pas les tools)

| Motif (interne, jamais affiché) | L’IA demande                             | Contrôle `input`         | Mise à jour                            |
| ------------------------------- | ---------------------------------------- | ------------------------ | -------------------------------------- |
| Mauvais numéro                  | Nouveau n° destinataire                  | `text` / `receiverPhone` | TX → `INPROGRESS`                      |
| Seuil atteint                   | Autre n° **ou** agent                    | `text` / `receiverPhone` | idem, ou `handoff`                     |
| Preuve illisible                | Nouveau reçu                             | `file` (file picker)     | upload puis `proof_done`               |
| Montant incorrect               | Renvoyer le **montant déclaré** + preuve | `file`                   | idem. **Ne jamais changer le montant** |

### 5.4 L’utilisateur donne un numéro

Si `input.type === "text"` et `input.name === "receiverPhone"` :

```json
{ "action": "fix", "txid": "AE12", "value": "79001234567" }
```

Chiffres seuls, indicatif, **9 à 15** digits, **sans** `+`.

S’il tape le numéro dans le champ chat, `{ "message": "79001234567" }` suffit.

Succès : `reply` confirme la reprise. Le bouton de cette TX disparaît.

### 5.5 L’utilisateur envoie une preuve

Quand `input.type === "file"` : bouton **Joindre le justificatif** (file picker).  
Pas de lien dans la bulle.

`input.endpoint` = `/v3/file/upload/{transactionId}` (`id` UUID, **pas** le txid) — usage interne.

```http
POST /v3/file/upload/:transactionId
Content-Type: multipart/form-data
```

Champ `file` (+ `comment` optionnel). **201** `{ ok: true }`.

Puis :

```json
{ "action": "proof_done", "txid": "AE12" }
```

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

- [ ] `GET /v3/chatbot/thread` à l’ouverture : **aucun** bloc ERROR (`suggestions` est vide)
- [ ] Boutons ERROR **seulement** si `choices` est présent dans **cette** réponse
- [ ] « bonjour » / FAQ : pas de liste, pas de « indiquez la référence »
- [ ] Temps 1 : `reply` + **un bouton par** `choices`
- [ ] Clic bouton = `{ action: "select_tx", txid }` — jamais le `label` en `message`
- [ ] Retirer les boutons dès que `choices` est omis
- [ ] Ne pas inventer « J’ai trouvé votre transfert… » ni un titre « Transferts en erreur aujourd’hui » en permanence
- [ ] Conserver les espaces de `reply` (ne pas coller les mots)
- [ ] `input.type === "text"` → champ n° ; submit = `{ action: "fix", txid, value }`
- [ ] `input.type === "file"` → file picker (pas de lien dans la bulle) → `POST input.endpoint` puis `{ action: "proof_done", txid }`
- [ ] Ne jamais afficher `input.endpoint`, un UUID, ou `(ERREUR_CAPTURE)`
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
- Corriger une TX qui n’est plus `ERROR`
- Rejoindre `admins-*` ou `support:{id}` d’un autre fil
- Fermer le fil (l’agent dashboard le fait)
