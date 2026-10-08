# Fuuud — Walrus Memory Hackathon submission

SuiHub Lagos · 27 Aug 2026

---

## 1. The prompt

The full copy-pasteable text lives in **[PROMPT.md](PROMPT.md)** — it is written
to be lifted whole, with a tool table and a five-line setup underneath so a
stranger can run it against their own Walrus Memory account and get this exact
behaviour.

The short version of what the prompt does: it forces the agent to **recall
before it speaks**, gives it four named categories it is allowed to write and an
explicit list of things it must never write, tells it that storing nothing is
the normal outcome, makes the newer of two contradicting facts win out loud
rather than silently, and makes it **fail closed** — an unreachable record and
an empty one look identical from inside the agent, and only one of them is safe
to guess at.

Three rules in it exist because a health record is not a preferences blob.
Severity travels with the allergy, because `groundnuts - anaphylaxis` and
`groundnuts - mild bloating` are different facts about different risks. Relative
time is resolved to an absolute date before it is stored, because "since last
Ramadan" does not survive being read back in two years. And taking something
back is an explicit act with its own tool, because an agent that privately
decides to stop mentioning a fact has changed nothing — the next session recalls
it again.

## 2. What we built

A nutrition assistant that already knows your health profile the moment you open
it — because the profile is not in our database. It is on Walrus, in a Walrus
Memory account **you** own, and this app is only a delegate you registered.

Ask any nutrition chatbot for a meal plan twice and you type your conditions
twice. For someone managing diabetes and a groundnut allergy, that is not an
inconvenience. A forgotten allergy is a hazard, and re-declaring it every
session is a hazard waiting for the one time you forget.

Fuuud is several surfaces over one record:

- **The chat** recalls your conditions and allergies before generating, folds
  them into the system prompt as hard constraints, and screens what comes back.
- **`/consultants`** ranks practitioners by the conditions it recalled, showing
  the reason next to each — visible proof that memory drives the app, not just
  the chat.
- **`/calendar` and reminders** plan a week of meals, re-screen every meal
  against the record each time the page loads, and can send a message before
  each meal (Telegram, browser push) or export the week as an `.ics` file. A meal
  that stops passing the screen is flagged, and its reminder is cancelled.
- **Telegram and voice.** Message the bot, or send it a voice note, and it answers from the same record. The
  website chat has a mic for dictation. Both are described below.
- **An MCP server** exposes the same memory, through the *same contract*, to
  Claude Code, Cursor, or any other agent. A fact a connected agent learns is
  enforced by the web app's allergen screen, and vice versa, because the record
  lives on Walrus rather than inside either application.

**There is no database for your health record.** It lives only on Walrus. One
small store (Upstash Redis) exists for reminders alone, and only once you connect
a channel: a Telegram chat id, a push subscription, and the names and times of
your upcoming meals. Disconnecting deletes it. A scheduler has no cookie and no
delegate key, so it cannot read Walrus; that is why the store exists, and it is
the one place a meal name sits in plain text on our side.

### One connection for every AI app

The same memory is reachable from any AI app that supports MCP connectors: one hosted endpoint
(`/api/mcp`, Streamable HTTP) behind OAuth 2.1 (PKCE S256, dynamic client registration, resource
indicators, an `iss` parameter). You approve it once; it then follows your account to your phone. It
exposes our contract, not a generic memory API, so retraction, supersede stamping and the deterministic
`check_meal` allergen screen apply wherever you use it.

It was designed against a hostile review, and the decisions that came out of it are the point:
each app gets its **own** delegate key (revocable independently of the web app); tokens carry no key
material and the key is sealed server-side; only an allow-list of known AI apps may register, because an
open registration would let a stranger redirect someone's grant to their own server; a consent decision
is single-use; a replayed authorization code or refresh token revokes the whole connection; and because a
web page the model reads can instruct it, `forget_fact` refuses without an explicit
`confirm_user_asked` and a write that has not finished is reported as *not yet confirmed*, never as saved.
`pnpm oauth:e2e` drives the whole flow over HTTP (70 checks). What it cannot cover is the wallet and the
live AI apps themselves, which need a manual run, and we have not claimed otherwise.

### Chat from Telegram, and by voice

The Telegram bot is a full surface, not only a reminder channel. It runs the same turn as the website chat (shared in
`lib/chat-core.ts`: the same prompt, one recall, the same write gate) and the same rule: if the record cannot be
read it says so and does not guess at your conditions. A Telegram message has no browser session, so the bot speaks
to Walrus with **its own delegate key**, minted in your browser when you press Connect Telegram, registered by your
wallet, and kept sealed on the server as a revocable grant. It is separate from your browser's key and from every
AI app's. Updates are de-duplicated, chats are rate-limited, and a chat that is not linked never reaches memory.

Voice goes both ways. The website's mic transcribes into the message box and never sends by itself. A Telegram
voice note is transcribed and **echoed back** ("I heard: ...") before the agent answers, because a misheard allergy
is the one error this app cannot afford. Replies can be spoken: on the website with the browser's own voice (a Listen
chip on each reply and a read-aloud toggle, off by default, nothing sent to us), and on Telegram with `/voice on`, which
follows the text reply with a voice note made by Groq's Orpheus model (200 characters a call, WAV out, so the reply is
chunked and encoded to MP3 in `lib/tts.ts`). Speech in and out goes through Groq, is not stored by us, and is disclosed
in the privacy policy. Hands-free conversation is next, and it will confirm any fact aloud before saving it.

### Saves you can watch

The first version held the chat stream open while Walrus certified the write (25-120 s), so a slow upload surfaced
as a "network error", a stale "saving" chip and a lost draft. Following the Walrus Memory demo's job pattern, a save now
returns a relayer job id quickly and the browser follows it (pending, running, uploaded, done, or failed with the
reason). The chip says "saved" only when every job is `done`; a failure shows why; a failed request returns your text to
the box. One real bug this surfaced is worth stating: after a successful save the memory panel stayed empty
because health recall was filtered by a relevance distance, so stored allergies were dropped on read. Health facts are
now read without a floor, since an allergy applies to every question whether or not it resembles the query.

### Your own account, and gas you do not pay

Each person creates **their own** Walrus Memory account at `/setup`. Their Enoki
wallet signs `createAccount` and `addDelegateKey` in the browser; the server only
ever receives the delegate key, sealed in an httpOnly cookie. This matters
because namespaces organise a record but do not isolate it — any delegate key on
an account decrypts every namespace on it — so the boundary between two people
has to be the account, not a string prefix. One server-held key serving everyone
would have made "you own your memory" false, so that mode is off by default
(`MEMWAL_SHARED_ACCOUNT=1` turns it on for a single-tenant demo).

Every account transaction is gas-sponsored: build the transaction kind, the
relayer's `/sponsor` (Enoki) wraps it, the wallet signs, `/sponsor/execute` runs
it. Nobody needs SUI. Settings can also issue a second, separate key for a coding
agent (MCP), generated in the browser and shown once (the MCP server reads the
owner address from the account on Sui, so there is no address to configure), so the same record works in
Claude Code or Cursor without this app ever holding that key.

Signing in on another device adds a delegate key to the same account instead of creating a new one. Settings lists
every key (this browser, connected apps, Telegram, other devices), counts them against the contract's cap of 20,
and removes one with a wallet signature; setup checks the cap first. If the relayer refuses a key, the app fails
**closed** with a banner and a "set up again" action. It never shows an empty record, which would read as "no allergies".

The safety check is deliberately **not** the model's job. `check_meal` matches
ingredient tokens against your recorded allergens (`kuli kuli` → peanut,
`semovita` → gluten, and `garden egg` is not an egg). It runs after the model
speaks, so an unsafe suggestion is caught whether it came from a static plan or
a hallucination.

## 3. What the prompt tells the agent to do

There are **two prompts, doing two different jobs**, and keeping them apart is
the design.

The **conversation prompt** decides what to *say*. The **write gate** decides
what to *keep*. A model fluent enough to give good food advice is not therefore
trustworthy about what belongs in a medical record — it will happily write down
"I fancy jollof tonight" to look useful. So the gate is a separate call with its
own instructions and a strict schema, and it is the graded part of this project.

### The conversation prompt: ask before you serve

The agent is told, in this order:

1. **Check what you already know before you ask.** Its own stored record is in
   the prompt. If that record names an allergy, it has already been told.
   *Asking someone to repeat an allergy they gave you is the one thing this app
   exists to prevent* — so the instruction says exactly that.
2. **Ask only when the record is empty.** With nothing stored, the first reply
   is a question, not a meal. One short question covering allergies and
   conditions, and it says you only have to answer once.
3. **Don't pad the question with a menu.** No "in the meantime you could try…".
   A suggestion attached to the question defeats the question.
4. **Say which stored fact you used** — "no groundnut, as you told me" — so the
   memory is visible and correctable rather than something you take on trust.
5. **Respect a dislike without hiding it.** Do not blend, puree or bury a
   disliked food in a dish and present that as a solution.
6. **You are not a doctor.** Any condition gets a not-medical-advice line and a
   nudge to see a practitioner.
7. **A fact you dislike is not yours to forget.** If the user says a stored fact
   is wrong, the agent points them at the retraction UI — quietly deciding to
   stop mentioning it changes nothing, because the record outlives the chat.

Underneath sits a **deterministic constraints block** built in code, not by the
model (`lib/safety.ts`): stated allergies and conditions verbatim, plus
mechanical avoid-lists for the ones we have token tables for, plus an explicit
warning naming any allergen no automatic screen can catch. With an empty
profile it emits a refusal to name any dish at all.

### The write gate: eleven kinds, and a bias toward keeping

A fact is written only when the **user asserts it about their own body**:

| Kind | Namespace | Example |
|---|---|---|
| `condition` | `kitchen:health:<addr>` | "I'm diabetic" |
| `allergy` | `kitchen:health:<addr>` | "groundnuts bring me out in hives" |
| `clearance` | `kitchen:health:<addr>` | "no allergies that I know of" |
| `observance` | `kitchen:health:<addr>` | "I don't eat pork", "halal only" |
| `rejection` | `kitchen:feedback:<addr>` | "no, palm oil upsets me" |
| `symptom` | `kitchen:feedback:<addr>` | "that gave me heartburn" |
| `dislike` | `kitchen:feedback:<addr>` | "I'm not a vegetables person" |
| `preference` | `kitchen:feedback:<addr>` | "I love pepper soup" |
| `goal` | `kitchen:feedback:<addr>` | "cutting back on sugar" |
| `household` | `kitchen:feedback:<addr>` | "I cook for four" |
| `practical` | `kitchen:feedback:<addr>` | "twenty minutes on weeknights" |

Planned meals are a twelfth kind, `plan`, in their own namespace
(`kitchen:plan:<addr>`), because a meal the agent proposed is not a fact the
person asserted about their body and must never be recalled into the chat prompt
as one.

Three of these exist because of failures we watched happen in a live run:

- **`clearance`** — storing the *absence* matters as much as the presence.
  Without it, "nothing recalled" is ambiguous between *they told us they are
  clear* and *we never asked*, and the agent interrogates the same person every
  session.
- **`dislike` and `observance`** — a standing preference is durable; a craving is
  not. "Not in the mood for rice" is not kept. "I don't eat pork" is kept as an
  *observance*, not a dislike: a dislike is taste and can be worked around, an
  observance is a rule the person does not intend to break.
- **A suspected allergy is still an allergy.** "I *think* I might be allergic to
  groundnut" is written as `suspected groundnut allergy`, not discarded as
  speculation. The cost of keeping a suspicion that turns out to be nothing is
  that they correct it later. The cost of dropping it is that the agent keeps
  serving the thing they just flagged.

The line is whether they are talking about their own body: *"I might be
allergic"* is written, *"what if I were allergic"* is not.

**Also enforced:** carry the stated severity and never a milder one; resolve
relative time to an absolute date or omit it rather than guess; one turn can
carry two facts and both are returned; the agent's previous question is passed
as context so a bare "none that I know of" can be resolved — but nothing the
*assistant* said is ever storable.

**Never written:** cravings, small talk, hypotheticals, the assistant's own
suggestions, or anything in a turn containing "don't save that" — which covers
the whole turn, including a real condition mentioned inside it. Most turns store
nothing, and the prompt says an empty result is the correct and common answer so
the model does not invent facts to seem useful.

### How it is retrieved — the part that is easy to get wrong

Recall is a similarity search with a relevance floor, so **what you ask for
decides what the model sees**. We originally queried the health namespace with
the user's own message. Ask "something light for dinner" and a stored
`allergy | groundnuts - hives` sits nowhere near it in embedding space, falls
below the floor, and is dropped as irrelevant — the agent then answers, in good
faith, as though the allergy did not exist.

An allergy is not relevant only when it happens to be mentioned. Conditions and
allergies are now retrieved every turn with a **fixed** query, never the user's
words. Preferences are read twice and merged: a stable query so a standing
dislike always applies, plus the user's own words so something rejected last
time resurfaces when it comes up again.

### The problem the memory solves

Re-declaration. Steps 3→4 of the acceptance test are the entire point: close the
browser, clear all site data, sign in again, say only "what should I eat today?"
— and the constraints are already applied. Steps 5→6 are what make it Walrus:
retract a fact and nothing can read it again.

That 3→4 claim has one failure mode, and we handle it rather than hope. The
relayer's vector index and the blobs on Walrus are separate stores; only the
second is durable. A namespace with missing index rows recalls **nothing** while
the record sits intact — and an empty recall is indistinguishable from a healthy
person with no conditions. So an empty recall is never taken at face value: it
triggers one `restore()` pass for that namespace, pulling blobs back from
Walrus, re-embedding and reinserting the rows, then retrying. Once per namespace
per process, and never in front of a recall that already returned something.

### Five SDK behaviours that shaped the whole design

**`remember()` is append-only — it is not an upsert.** Writing the same fact
twice yields two entries, and recall ranks by vector distance rather than
recency, so a stale "allergic to groundnuts" can outrank a newer "allergy
resolved". Every write therefore recalls first at `maxDistance 0.3`, skips true
duplicates, and stamps `SUPERSEDES` on contradictions. Facts are stored as
`2026-08-27 | allergy | groundnuts - hives` so the newer date can win.

**`recall()` has no default relevance threshold.** In a small namespace it
returns the nearest entries even when they are unrelated filler. Every read
passes `maxDistance` — `0.6`, tunable with `KM_RELEVANCE_DISTANCE`. For a health
agent, filler means reasoning over the wrong person's condition; but the two
errors are not symmetric, and an allergy phrased differently from the question
and dropped below the floor is worse than a filler line, so the floor is set
loose and the noise is cleaned up downstream.

**Nothing deletes**, so retraction is a tombstone that outranks the claim it
names — the design in §5.

**The vector index is not the record.** Only Walrus is. An empty recall triggers
one `restore()` warm-up per namespace before it is believed.

**The relayer meters each delegate key at 30 points a minute** (remember 5,
recall 1, analyze 10), and answers `401 AUTH_REJECTED` for everything once you
pass it — indistinguishable from a bad key. A week of planned meals written one
by one cost about 126 points and tripped it. Now a client-side budget
(`lib/relayer-budget.ts`) spends the allowance deliberately, and a week is one
bulk write instead of twenty-one single ones.

We did not use `withMemWal({ autoSave: true })`. Auto-save extracts facts from
every turn, which would happily persist "I fancy jollof tonight" into a medical
record. The write gate is the graded part, so it is enforced in code
(`lib/extract.ts`, `lib/memory-core.ts`) rather than delegated to middleware.

## 4. Proof it works

Run one command against the live staging relayer:

```bash
pnpm smoke
```

It writes **[PROOF.md](PROOF.md)** — every fact it stored, the Walrus blob id
for each, an aggregator link, and the recall distance that brought it back. It
asserts the six claims this submission rests on:

1. a fact written in one session is recalled in a **fresh** one
2. an identical write is **skipped**, not duplicated
3. a contradiction **supersedes** the old fact, newer date wins
4. namespaces isolate — health facts never leak into feedback
5. a retried write carrying the same idempotency key lands on the **same blob**,
   so a timeout on bad wifi cannot write an allergy to the record twice
6. a **retracted** fact leaves active memory entirely, and its blob id is still
   printed — retraction is out of reach, not erased, and the proof says so

The blobs are encrypted under the owner's keys, so the links prove the record is
on Walrus without exposing its contents. The smoke test uses a synthetic subject
and synthetic conditions; no real person's medical data goes onto a public
network.

`pnpm smoke` needs a test account's `MEMWAL_PRIVATE_KEY` and `MEMWAL_ACCOUNT_ID` (create one at `/setup`, then
Settings -> Developer key prints them once). The checked-in `PROOF.md` is from an earlier run: rerun it
against your own network before relying on it.

Also checked in this repository: 261 unit tests, `pnpm oauth:e2e` (the hosted connector over HTTP on the offline
mock), a scope guard that fails if any page or route reaches memory without the person's own account in scope,
and an SEO guard that fails if a signed-in page is ever indexable. Lighthouse on the production site:
performance 96 on mobile and 100 on desktop, accessibility 96, best practices 100, SEO 100.

Two more checks that need **no credentials and no API key at all**:

```bash
pnpm test        # the reconciliation and conflict-resolution rules, pure logic
pnpm mcp:probe   # the whole MCP contract, end to end, on an in-memory store
```

`pnpm mcp:probe` is the one to run first if you are picking this up cold. With
no keys the memory layer falls back to the SDK's in-memory mock and the probe
still exercises the real thing: it stores an allergy, skips the identical
rewrite rather than duplicating it, recalls it back, watches `check_meal` flip
from SAFE to UNSAFE on `kuli kuli` because the memory changed underneath it, and
refuses a fact the person asked to keep off the record.

That last point matters for "can someone else pick it up?" — you can verify the
contract before you have a single credential.

### Bring your own key

The agent is not tied to one model vendor. Set `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `XAI_API_KEY` or
`GROQ_API_KEY` — whichever you already have — and it uses it; pin one with
`KM_MODEL_PROVIDER` when several are present, or let each person paste their own
key in Settings. The default on Groq is `openai/gpt-oss-120b`: one model both
answers and runs the write gate, and the gate needs one that follows a long,
rule-heavy schema prompt. (Groq can hold the `gpt-oss` models to a strict JSON
schema; the installed `@ai-sdk/groq` does not request it yet, so today the gate's
output is best-effort JSON checked by zod, and a malformed result writes
nothing rather than something wrong.) Someone reproducing this should not have to open an account with a
company they have no relationship with.

## 5. Honest notes

Three claims we could have made and did not, because the SDK does not support
them.

**Deletion.** There is no delete anywhere in the SDK — no `forget()` on the
client, no per-memory delete on the relayer. MemWal ships a Security Delete API,
but it targets legacy V1 blob objects and sits behind `ENABLE_MEMORY_DELETION` +
`ENABLE_SECURITY_DELETE`, off by default. So forgetting here is a **tombstone**:
a dated record that outranks the claim it names and keeps it out of every read,
by this app or any other agent holding the key. The encrypted entry stays on
Walrus, under keys only the owner holds, until its storage period expires. The
settings page says exactly that. We did not ship copy promising permanent
deletion.

**Revocation is forward-only.** `removeDelegateKey`'s own docstring: it stops
the key reading memories saved *after* removal, while memories already saved
stay readable to it until they are re-encrypted. An earlier draft of this
submission said "revoke and the agent goes blind". That is not what the contract
does, and on a medical record the difference is the whole point — so the claim
is now stated the way the SDK actually behaves, in the README, the submission
and the settings page.

**`list_memory` is a search, not a printout.** The SDK has no `list()`. Ours is
two deliberately broad recalls across both namespaces, and it is presented as
what the agent can currently reach — with superseded and retracted entries in
their own sections — rather than as a complete index of the record. For someone
auditing what is stored about them, that distinction is the answer.

**Reminders cannot re-screen at send time.** The scheduler (a GitHub Actions
workflow pinging `/api/cron/reminders`) has no cookie and no delegate key, so it
cannot read the record. The allergen screen runs when a reminder is scheduled and
again on every plan read and every chat turn that stores a fact, so a new
allergy cancels the matching reminders before the next run. A change made
between runs can still be one interval behind, and GitHub's scheduled runs can
start minutes late.

**The Telegram bot and connected apps hold a key on our server.** To act while your browser is closed, each gets
its own delegate key, sealed at rest (AES-GCM) and revocable: Disconnect discards it and you can remove it from your
account. That is a real trade-off against "the server never holds your key", and the privacy page and the consent
screen say so. The web app's own key stays in an encrypted cookie in your browser.

**Voice sends speech to Groq.** Dictation and Telegram voice notes are transcribed by Groq Whisper, and Telegram spoken
replies (opt-in) send the reply text to Groq's Orpheus model. We do not store
the audio. The model is set to English with a Nigerian food vocabulary hint: Pidgin comes out as English words, and
Yoruba and Hausa transcribe poorly. Telegram voice notes use the deployment's key; the website uses the visitor's own
Groq key if they added one.

**The allergen guides are reading aids, not advice.** The public guides for Nigerian food and allergens are written with
hedged language ("often", "check"), always carry a not-medical-advice note, and say recipes vary by cook and region.
They should be read by someone qualified before being relied on.

**The proof is only as current as its last run.** `PROOF.md` is generated, not hand-written, and records its own
timestamp and relayer. Mainnet and testnet runs are different networks.

**Mainnet is real.** On the production relayer, storage is paid for by the
relayer and every account transaction is sponsored; the data is on a public
network. Use a synthetic profile for any demo. The relayer, `NEXT_PUBLIC_SUI_NETWORK`
and the Enoki key must all be on the same network, and `/setup` refuses with a
message when they are not.

**Sign-in.** Enoki zkLogin via `registerEnokiWallets` — the wallet signs a
server-issued nonce, the server verifies it with
`verifyPersonalMessageSignature`, and only then mints an HMAC-signed session
cookie. An address asserted by the client is never trusted on its own; it is the
key to someone's medical record.
