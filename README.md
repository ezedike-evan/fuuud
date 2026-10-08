# Fuuud

A nutrition agent that remembers your health profile, so you never re-declare an
allergy. Built for the Walrus Memory hackathon (SuiHub Lagos, 27 Aug 2026).

You own your memory. This app is only a delegate you registered — revoke it
onchain, without asking the app's permission, and it stops reading anything you
save from then on.

## The problem

Ask any nutrition chatbot for a meal plan twice and you type your conditions
twice. For someone managing diabetes and a groundnut allergy, that is not an
inconvenience — a forgotten allergy is a hazard.

## What it remembers

| Namespace | Holds | Written when |
|---|---|---|
| `kitchen:health:<suiAddress>` | conditions, allergies | the user states one |
| `kitchen:feedback:<suiAddress>` | rejected meals, symptoms | the user refuses a suggestion with a reason, or reports a symptom after eating |

Never written: cravings, small talk, the assistant's own suggestions, or
anything in a turn containing "don't save that".

The rules live in `lib/memory-contract.ts` and the write gate in `lib/extract.ts`.

## Four things the SDK does that shape the whole design

**`remember()` is append-only.** It is not an upsert. Writing the same fact
twice yields two entries, and recall ranks by vector distance rather than
recency — so a stale "allergic to groundnuts" can outrank a newer "allergy
resolved". Every write therefore recalls first at `maxDistance 0.3`, skips true
duplicates, and stamps supersedes on contradictions. Facts are stored as
`2026-08-27 | allergy | groundnuts - hives` so the newer date can win. Each
write also carries a deterministic `idempotencyKey`, because a transport
timeout *after* the server accepted the job would otherwise write the person's
allergy to their record twice and pay for both.

**`recall()` has no default relevance threshold.** In a small namespace it
returns the nearest entries even when they are unrelated filler. Every read
passes `maxDistance` — `0.6` by default, tunable with `KM_RELEVANCE_DISTANCE`.
For a health agent, filler means reasoning over the wrong condition; too tight a
floor means missing the allergy entirely, which is the worse of the two.

**Nothing deletes.** There is no `forget()` on the client and no per-memory
delete on the relayer, so "forget that" is a tombstone: a dated record that
outranks the claim it names and keeps it out of every read. The entry stays on
Walrus, encrypted. Calling that deletion would be a lie, so no copy in this repo
does. (An earlier version of `app/actions/memory.ts` called a `memwal.forget()`
that only exists on `MemWalMock` — it worked offline and would have thrown the
first time anyone pressed the button live.)

**The vector index and Walrus are two different stores, and only one is
durable.** A namespace whose index rows are missing recalls nothing while the
record sits intact on Walrus — which, here, is indistinguishable from a healthy
person with no conditions. `restore()` rebuilds those rows. Every empty recall
triggers one warm-up pass per namespace, then retries, so the failure that
matters most cannot happen quietly.

## Your own account, per person

Each person creates **their own** MemWalAccount at `/setup`: their Enoki wallet
signs `createAccount` and `addDelegateKey` in the browser, and the server only
ever receives the delegate key (sealed in an httpOnly cookie). Namespaces
organise a record but do not isolate it - any delegate key on an account
decrypts every namespace on it - so the account, not a string prefix, is the
boundary between two people. Revoke removes the delegate onchain from Settings.

Gas is sponsored: every account transaction goes build kind -> relayer `/sponsor`
(Enoki) -> wallet signs -> `/sponsor/execute`, proxied through our own origin
because the relayer's CORS does not allow other origins. Nobody needs SUI. The
relayer, `NEXT_PUBLIC_SUI_NETWORK` and the Enoki key must be on the SAME network
(testnet or mainnet); `/setup` refuses with a clear message when they are not.

`MEMWAL_SHARED_ACCOUNT=1` restores the old single-server-key mode for a demo; it
makes "you own your memory" untrue and is off by default.

**Devices and keys.** Signing in on a second device makes a second delegate key on the same account, never a
second account. Settings lists every key (this browser, connected apps, the Telegram chat, other devices) with
its label and date, counts them against the contract's cap of 20, and removes any one with a wallet signature.
Setup checks the cap first and offers to make room, and removing this browser's key sends you back through
setup. If the relayer refuses a key (the same 401 as a throttle), the app fails **closed**: it says it cannot read
your record and never shows an empty one, because an empty record looks exactly like "no allergies".

Relayer allowance: 30 points per minute per delegate key (remember 5, recall 1,
analyze 10). `lib/relayer-budget.ts` spends it deliberately, and a week of
planned meals is written with one bulk call, not 21 single writes.

## Saves you can watch

A write to Walrus takes 25-120 seconds (encrypt, upload, certify, index). The chat stream used to stay open for all of
it, so a slow upload became a dropped connection and a stale "saving" chip. Now `rememberAsync` returns a job
id after at most 6 seconds per fact, the stream closes, and the browser follows each job through
`/api/memory/job` (pending, running, uploaded, done, or failed with the relayer's reason) with a live timer. The chip
says "saved" only when every job is `done`. The route derives the namespace from your session and the fact kind, never
from the request, so a job id cannot be probed across accounts. A failed request puts your message back in the box
and removes the failed turn; the draft also survives a reload.

## Reminders, Telegram and calendar

| Channel | How | Needs |
|---|---|---|
| Telegram | Bot API directly; `/start <id>` deep link, webhook. Reminders **and chat** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` |
| Browser push | Web Push (VAPID) + `public/sw.js` | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Calendar | `.ics` download + per-meal Google Calendar links, no OAuth | nothing |
| Scheduler | GitHub Actions -> `GET /api/cron/reminders` | `CRON_SECRET`, Upstash Redis |

This is the one non-Walrus store: a chat id, a push subscription and the names
and times of upcoming meals, kept only once a channel is connected and deleted on
disconnect. A cron job has no cookie or delegate key, so it **cannot re-screen at
send time**. (The scheduler is `.github/workflows/reminders.yml`, which works on any host.) The screen runs when a reminder is scheduled and again on every plan
read and every chat turn that stores a fact, so a new allergy cancels the
matching reminders before the next cron tick - at worst one interval behind.

**Store.** Upstash Redis REST (`UPSTASH_REDIS_REST_URL` / `_TOKEN`). **Scheduler.**
The GitHub workflow pings every 5 minutes; set repo secrets `APP_URL` and
`CRON_SECRET`. Runs can start a few minutes late, which is fine: a reminder stays
valid for 2 hours after its time.

Register the Telegram webhook once per deployment:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d url=https://<origin>/api/telegram/webhook -d secret_token=$TELEGRAM_WEBHOOK_SECRET
```

Register it on the host that does **not** redirect (Telegram does not follow a 308), e.g. `www.` if the apex
redirects to it. Locally, Settings polls `getUpdates` while you press Start; that completes linking only. Chat
needs the webhook (point `TELEGRAM_API_BASE` at a stand-in server to test it offline). iOS only delivers web push
once the site is added to the home screen.

### Chat with Fuuud in Telegram

Message the bot and it answers like the website chat: it runs the same turn (`lib/chat-core.ts`: one recall, one
model call, the write gate) and it fails closed if your record cannot be read. `/memory` shows what it knows,
grouped by kind; `/voice on|off` toggles spoken replies; `/help` lists commands; the `/` menu is registered with Telegram.

A Telegram message carries no browser session, so the chat speaks to Walrus with **its own delegate key**. Pressing
**Connect Telegram** makes that key in your browser, your wallet registers it on your account (gas sponsored), and
the server keeps it sealed (AES-GCM under `OAUTH_SECRET`, as a grant named "Fuuud Telegram"). It is a different key
from your browser's; Disconnect revokes it, and it also appears under Connected apps. The webhook answers Telegram
at once and works in `after()`; updates are de-duplicated, each chat is limited to 8 messages a minute, and a
chat that is not linked is told so and never reaches memory. Saves report the way the website does: "Saving to
Walrus" first, then "Saved" or the reason it failed. The only text kept for context is your last reply, for 15 minutes.

### Voice

Listen and talk, not hands-free conversation yet. On the website, the mic beside Send records up to about a minute, sends it to
`/api/transcribe` (Groq Whisper, `KM_STT_MODEL`, default `whisper-large-v3-turbo`, English with a Nigerian
food-and-health vocabulary hint) and puts the text in the message box. It never sends by itself, so a misheard
word is seen before it can reach a health record. A **Telegram voice note** is downloaded, transcribed with the
server's `GROQ_API_KEY`, and echoed back ("I heard: ...") before the agent answers; notes over 60 seconds or
3 MB are refused, and a chat that is not linked is never transcribed. Audio goes to Groq and is not stored by
us. A visitor's own Groq key in Settings is used on the website. 

**Spoken replies.** On the website each reply has a **Listen** chip, and a speaker toggle beside the mic reads every
reply aloud; both use the browser's own voice (`speechSynthesis`, `lib/use-speech.ts`), so they cost nothing and run
no server code. The voice is chosen for clear neutral English (an en-NG voice if the device has one), the choice is
remembered on the device, and it is off until turned on. On Telegram, `/voice on` makes the bot follow each text
reply with a voice note (`/voice off` stops it; the text always comes first and the setting is per chat). That path
uses Groq's Orpheus model (`KM_TTS_MODEL`, `KM_TTS_VOICE`, default voice `hannah`): Groq accepts 200 characters per
call and returns WAV, so `lib/tts.ts` splits the reply into sentences, joins the audio and encodes MP3 itself, which
Telegram plays as a voice message. Reply text goes to Groq for this and the audio is not kept; it is capped at 40
voice notes a chat a day. Not built yet: hands-free conversation. Pidgin comes out as English words, and Yoruba and
Hausa transcribe poorly with the English setting.

## Connect any AI app (hosted MCP)

One hosted endpoint, `https://<your-domain>/api/mcp`, so you connect **once** and use your memory from
Claude (web, desktop, iOS, Android), ChatGPT, Cursor, VS Code, Gemini CLI and any other client that
speaks the MCP authorization spec (OAuth 2.1, PKCE S256, dynamic client registration). Unlike MemWal's
generic hosted MCP, writes here go through **this** contract: dated facts, supersede stamping,
retraction, and the deterministic `check_meal` allergen screen.

**Add it.** In your AI app add a custom connector / remote MCP server with that URL and approve it when
asked. Claude: Settings > Connectors > Add custom connector (paid plans; add it on the web and it then
appears on the mobile apps, which cannot add new ones). The approval screen runs here: sign in, and your
wallet creates a key for that app only (gas sponsored).

**What you are trusting.**
- The app gets its **own delegate key**, separate from the web app's. Disconnect it in Settings and it stops
  at once; the same screen offers to remove the key from your account onchain.
- To work while your browser is closed, **this server keeps that key, encrypted** (AES-GCM under
  `OAUTH_SECRET`, in Upstash). Tokens never contain the key.
- Read and write limits are enforced by this server; the key itself can do both on Walrus.
- Whatever the app reads becomes part of your conversation with that AI service.
- `forget_fact` refuses unless the model passes `confirm_user_asked: true`, because a web page the model reads
  can otherwise tell it to retract your allergy. A write that is still saving is reported as **not yet
  confirmed**, never as saved, and `list_memory` shows any that failed.
- Access tokens last 1 hour, refresh tokens 30 days (rotating), and a connection is re-approved after 90 days.
  You can have 5 connected apps. A replayed code or refresh token revokes the whole connection.

**Operator setup** (see `.env.example`): `APP_URL`, `OAUTH_SECRET`, and a **read-write** Upstash token. Add more
AI apps with `OAUTH_REDIRECT_ALLOW`. On Vercel: use a custom domain as the registered host, no apex-to-www
redirect (the redirect drops the `Authorization` header), and turn **Deployment Protection off for `/api/mcp`,
`/.well-known/*` and `/oauth/*`** (a protected URL answers with an HTML 401 that clients cannot follow), then
redeploy. Preview URLs are protected by default, so test on production. Allow Anthropic's egress range
`160.79.104.0/21` if you run a WAF.

**Check it.**
```bash
curl -i https://<domain>/api/mcp                                   # 401 + WWW-Authenticate: Bearer resource_metadata="..."
curl -i https://<domain>/.well-known/oauth-protected-resource      # resource == the connector URL
curl -i https://<domain>/.well-known/oauth-authorization-server     # S256, registration_endpoint, iss
pnpm oauth:e2e                                                      # the full flow over HTTP on the offline mock (70 checks)
```
`pnpm oauth:e2e` runs against a dev server started with `DEV_FAKE_ADDRESS` (see the header of
`scripts/oauth-e2e.mts`): it covers discovery, registration, authorize, consent, tokens, every tool, refresh
rotation, replay detection and revocation, but it **skips the wallet**, so the real approval screen and the
live AI apps still need one manual run each.

**Not covered yet.** Client ID Metadata Documents (ChatGPT prefers them but falls back to registration); the
Gemini consumer app and other new surfaces (add their redirect URI with `OAUTH_REDIRECT_ALLOW`).

## Brand, guides and speed

- **Mark.** The Recall Bowl: a lit gold bowl with one thread of steam ending in a point of light. One source,
  `lib/brand-mark.ts`; `node --experimental-strip-types scripts/make-icons.mts` renders `app/icon.svg`, `favicon.ico`,
  the apple and PWA icons (including a maskable one) and `brand/logo-120.png` (for the Google consent screen).
- **Public pages** are registered once in `lib/pages.ts` and feed the sitemap, titles, descriptions and the SEO tests:
  `/guides`, how your memory stays private, how to connect Claude/ChatGPT/Cursor, five allergen guides for Nigerian
  food (written conservatively, always with a not-medical-advice note), `/privacy` and `/terms`.
- **SEO.** Metadata with canonical URLs and generated social cards, `robots.txt`, `sitemap.xml`, `llms.txt`,
  Organization / WebSite / SoftwareApplication / FAQPage / Article / BreadcrumbList / HowTo structured data, and
  `noindex` on every signed-in page (a test fails if one is missed). URLs come from `APP_URL`, so set it to the
  host that does not redirect. Optional `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`,
  `NEXT_PUBLIC_CONTACT_EMAIL` (see `.env.example`).
- **Speed.** The landing page is static HTML (first-load JS 157 kB dynamic -> 110 kB static), fonts are self-hosted
  through `next/font` (no third-party font requests), scroll reveals are CSS only, and "How it works" is plain
  content rather than a scroll-jacked panel. Lighthouse on production: 96 mobile / 100 desktop performance,
  96 accessibility, 100 best practices, 100 SEO.

## Layout

```
lib/memory-contract.ts   write rules, reconciliation, conflict resolution
lib/extract.ts           the write gate — what counts as a durable fact
lib/safety.ts            deterministic allergen screening, runs after the model
lib/consultants.ts       practitioner ranking driven by recalled conditions
lib/namespaces.ts        the only place namespace strings are built
lib/memory-core.ts       the contract, importable from anywhere
mcp/server.mts           the same contract, exposed over MCP
lib/chat-core.ts         the prompt, recall, system composition and write gate, shared by web and Telegram
lib/telegram-chat.ts     chatting (and voice notes) inside Telegram
lib/transcribe.ts        speech to text (Groq Whisper)
lib/tts.ts               text to speech for Telegram voice notes (Groq Orpheus, MP3 encode)
lib/use-speech.ts        read replies aloud with the browser voice
lib/pages.ts             every public page, once: sitemap, metadata, tests
app/api/chat/route.ts    the website chat: recall once, generate, report the write
app/settings/page.tsx    every stored fact, retract, revoke
components/landing/      the landing page, section by section
design/                  the .dc.html design canvas artboards
```

## Two things only a live run tells you

The offline mock scores by token overlap; the relayer scores by embedding
distance. Two bugs lived comfortably in that gap and neither was visible until
the first run against a real relayer.

**Search with the shape you store.** Dedupe queried with the bare claim
`groundnuts - hives` while storage writes `2026-08-27 | allergy | groundnuts -
hives`. On embeddings that prefix pushes the distance past `DUPLICATE_DISTANCE`,
so *every* duplicate was written as a new entry — "an identical write is
skipped" was simply false. Under token overlap the two strings look nearly
identical, so the mock passed. `factProbe()` now builds the query in the stored
shape.

**A retraction must not be filtered by relevance.** Measured live, an allergy
came back at distance `0.519` for "what am I allergic to?" while the tombstone
retracting it sat at `0.805`. With a `0.6` floor the fact survived and its
retraction was discarded as noise — a retracted allergy reaching the model,
which is the exact failure this project exists to prevent. Two changes: the
tombstone now leads with the claim (`<claim> - RETRACTED`) so it embeds near the
fact it kills, and tombstones are swept on every read with **no distance floor
at all**. Old-shape tombstones are still honoured.

## When the relayer says 401

`401 AUTH_REJECTED` does not always mean what its error text says. After a
handful of signed requests in quick succession, a production account starts
returning 401 for *everything* — writes and reads alike — for a few minutes,
then recovers on its own. The same delegate key that just wrote successfully
gets rejected, and the SDK's message sends you off to check dashboard
credentials that were never wrong.

`withRelayerRetry()` in `lib/memwal-client.ts` retries on that code with backoff
across roughly two and a half minutes, then rethrows the original error so a
genuinely unregistered key still surfaces the message that tells you to fix it.
The [documented causes](https://docs.wal.app/walrus-memory/troubleshooting/overview)
are all worth ruling out first — an unregistered delegate key, an account ID
that belongs to a different account, staging credentials against production, or
a clock outside the five-minute signing window.

Note the health endpoint is **unauthenticated**, so `status: ok` tells you the
relayer is reachable and nothing about whether your key works. Its `write_ready`
flag is the one to watch.

## Prior art

The landing page's visual language and three of the memory patterns here —
warming an index with `restore()` before trusting an empty recall, guarding
against the relayer's rejection of a blank query, and writing a tombstone
instead of pretending to delete — were learned from
[Cortex](https://github.com/goodylili/Cortex), a sovereign memory layer on the
same stack. Nothing is copied from it; it has no licence, and everything here is
our own code and copy against the same SDK.

## Relationship to FUUD

This project began as a slice of FUUD, the Express + Vite food/telehealth app.
That codebase now lives on its own at `../Fuuud-legacy`, with its full git
history intact. Nothing here depends on it — `lib/safety.ts` and
`lib/health-rules.ts` were ported across and are the only shared lineage.

## Bring your own key

Nothing here is tied to one model vendor. Set whichever provider key you
already have:

| Provider | Env var | Chat / extract defaults |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-opus-5` / `claude-haiku-4-5` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` / `gpt-4o-mini` |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-pro` / `gemini-2.5-flash` |
| xAI | `XAI_API_KEY` | `grok-3` / `grok-3-mini` |
| Groq | `GROQ_API_KEY` | `openai/gpt-oss-120b` (one model for both jobs) |

Set several and the first present wins, in that order; pin one with
`KM_MODEL_PROVIDER`, and override model ids with `KM_CHAT_MODEL` /
`KM_EXTRACT_MODEL`. A health agent someone else is meant to run should not force
them to open an account with a company they have no relationship with.

One model does both jobs by default: it talks to the person and it runs the write
gate on every turn. They used to be split, and a gate running on a model nobody
chose failed silently. Set `KM_EXTRACT_MODEL` only if you want a cheaper tier for
the gate. On Groq the default is `openai/gpt-oss-120b`.

## Runs with no credentials at all

With no `MEMWAL_*` keys the memory layer falls back to the SDK's in-memory mock.
The write gate, duplicate skipping and the allergen screen are all real there —
none of them need a network — so `pnpm mcp:probe` exercises the entire loop
offline, including a `check_meal` verdict flipping from SAFE to UNSAFE because
the memory changed underneath it.

What mock mode is *not*: the mock ranks by token overlap rather than embeddings,
so semantic recall — the actual product claim — only exists on live credentials,
and a contradiction will not pick up its `SUPERSEDES` stamp. Use it to pick the
project up, never to film a demo.

## Run it

```bash
pnpm install
cp .env.example .env.local   # fill in the keys
pnpm dev
```

Credentials: Walrus Memory account + delegate key from
<https://staging.memory.walrus.xyz>, Enoki key from
<https://portal.enoki.mystenlabs.com>, plus any one model provider key.

Enoki sign-in is wired end to end (`components/sign-in.tsx` →
`app/api/auth/verify/route.ts`) but has not been exercised against live Enoki
credentials. Set `DEV_FAKE_ADDRESS` to work on the memory flow without it — it
is refused in production.

```bash
pnpm test        # pure logic, no network
pnpm typecheck
pnpm smoke       # live check against the staging relayer (needs MEMWAL_* keys)
```

`pnpm smoke` needs a test account's `MEMWAL_PRIVATE_KEY` and `MEMWAL_ACCOUNT_ID` (the app no longer holds a shared key):
create an account at `/setup`, then take the values from **Settings -> Developer key**, which prints
them once, and put them in `.env.local` next to the `MEMWAL_SERVER_URL` for your network.

`pnpm smoke` writes a synthetic subject to staging and asserts the four claims
this project rests on: a fact survives a fresh session, an identical write is
skipped rather than duplicated, a contradiction supersedes, and namespaces do
not leak. It emits `PROOF.md` with the Walrus blob id and aggregator link for
every fact it stored.

## Submission

- [PROMPT.md](PROMPT.md) — the prompt itself, copy-pasteable, with the tool
  contract it expects
- [SUBMISSION.md](SUBMISSION.md) — what it does, what it remembers, proof

## Sign-in

Enoki zkLogin via `registerEnokiWallets` (not `EnokiFlow` — deprecated in
@mysten/enoki 0.6.x). The wallet signs a server-issued nonce; the server
verifies it with `verifyPersonalMessageSignature` and only then mints an
HMAC-signed session cookie. An address asserted by the client is never trusted
on its own — it is the key to someone's medical record.

Note on versions: `@mysten/enoki` 1.x, `@mysten/sui` 2.x and `@mysten-incubation/memwal`
share one Sui package, so the wallet and the SDK pass transactions to each other
unchanged and every client is a `SuiGrpcClient` (public JSON-RPC is deprecated).
The older `@mysten/enoki` 0.6.x bundled `@mysten/sui` 1.33, which cannot parse
sponsored transactions that use a `ValidDuring` expiry and failed account creation
and key minting with `Invalid type: Expected Object but received Object`.

## MCP server — your memory, in any agent

The web app is not the only thing that can read this memory. `mcp/server.mts`
exposes it over MCP, so Claude Code, Cursor, or any other agent can recall and
write through the **same contract** — the same relevance threshold, the same
duplicate reconciliation, the same supersede stamping, the same allergen screen.
Nothing is reimplemented; the server imports `lib/memory-core.ts` directly.

That is the portability argument made concrete. A fact a connected agent learns
is enforced by the web app's safety screen, and vice versa, because the record
lives on Walrus under your own address rather than inside either application.

| Tool | What it does |
|---|---|
| `recall_memory` | Semantic search over stored facts, conflict-resolved |
| `remember_fact` | Write a durable fact — reconciles, never blindly appends |
| `check_meal` | **Deterministic** screen of a meal against stored allergens and conditions |
| `list_memory` | Everything stored, with superseded entries shown separately |

`check_meal` is the one worth pointing at: it does not ask a model whether a
meal is safe, it matches ingredient tokens against the person's own recorded
allergens. Any agent can call it before recommending food.

There is also a `fuuud://profile` resource returning current conditions
and allergies as JSON.

### Add it to Claude Code

Get the three values from **Settings → Developer key** in the web app:
it registers a separate key for your agent on your own account and shows it once.

```json
{
  "mcpServers": {
    "fuuud": {
      "command": "node",
      "args": ["--experimental-strip-types", "mcp/server.mts"],
      "cwd": "/absolute/path/to/fuuud",
      "env": {
        "MEMWAL_PRIVATE_KEY": "...",
        "MEMWAL_ACCOUNT_ID": "0x...",
        "MEMWAL_SERVER_URL": "https://relayer-staging.memory.walrus.xyz"
      }
    }
  }
}
```

Verify it before wiring it up:

```bash
pnpm mcp:probe    # handshake, tool discovery, one call of each tool
```

The probe passes without credentials too. On the mock it runs the whole
contract for real: store an allergy, skip the identical rewrite, recall it back,
watch `check_meal` flip to UNSAFE on `kuli kuli`, refuse a fact the person asked
to keep off the record, then retract the allergy and watch all three tools
change their minds again.

## Acceptance test

1. Sign in. Say "I'm diabetic and groundnuts give me hives." Get a meal plan.
2. `/consultants` — `dietitian-ifeanyi` ranks first, citing diabetes.
3. **Close the browser. Clear all site data. Sign in again.**
4. Say only "what should I eat today?" The constraints are already applied.
5. `/settings` — retract the groundnut allergy. Ask again; it is gone from the
   answer, and still visible in the ledger as retracted.
6. `/settings` — revoke the delegate key onchain. Nothing saved after that point
   is readable by this app again.

Steps 3→4 are the point. Steps 5→6 are what make it Walrus rather than a
database with extra steps.

## Honest note on deletion

**Retracting is not deleting, and revoking is forward-only.** Both matter enough
to say out loud on a health record.

Retracting writes a tombstone that outranks the fact, so nothing can recall it —
not this app, not any agent holding the key. It does not erase: there is no
delete anywhere in the SDK. MemWal does ship a Security Delete API, but it
targets legacy V1 blob objects and sits behind `ENABLE_MEMORY_DELETION` +
`ENABLE_SECURITY_DELETE`, off by default. So the encrypted entry stays on
Walrus, under keys only the owner holds, until its storage period expires.

Revoking a delegate key is documented forward-only: it stops that key reading
memories saved **after** removal, while memories already saved stay readable to
it until they are re-encrypted. Anyone claiming "revoke and the agent goes
blind" has not read `removeDelegateKey`. The settings page says all of this in
those words. Do not ship copy promising permanent deletion.

Use synthetic profiles for any demo. Do not put a real person's real medical
conditions on a public network.
