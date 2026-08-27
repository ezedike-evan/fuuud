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

## Layout

```
lib/memory-contract.ts   write rules, reconciliation, conflict resolution
lib/extract.ts           the write gate — what counts as a durable fact
lib/safety.ts            deterministic allergen screening, runs after the model
lib/consultants.ts       practitioner ranking driven by recalled conditions
lib/namespaces.ts        the only place namespace strings are built
lib/memory-core.ts       the contract, importable from anywhere
mcp/server.mts           the same contract, exposed over MCP
app/api/chat/route.ts    recall once, generate, write behind the gate
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

Set several and the first present wins, in that order; pin one with
`KM_MODEL_PROVIDER`, and override model ids with `KM_CHAT_MODEL` /
`KM_EXTRACT_MODEL`. A health agent someone else is meant to run should not force
them to open an account with a company they have no relationship with.

Two jobs, deliberately split: the chat model talks to the person, and a small
fast model runs the write gate on every single turn.

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

Note the dependency split: `@mysten-incubation/memwal` peers on
`@mysten/sui >= 2.5.0`, while `@mysten/enoki` hard-depends on `1.33.0` and its
`SuiClient` type is not compatible. `@mysten/sui-enoki` is an alias pinning
1.33.0 so Enoki gets a matching client without a cast.

## MCP server — your memory, in any agent

The web app is not the only thing that can read this memory. `mcp/server.mts`
exposes it over MCP, so Claude Code, Cursor, or any other agent can recall and
write through the **same contract** — the same relevance threshold, the same
duplicate reconciliation, the same supersede stamping, the same allergen screen.
Nothing is reimplemented; the server imports `lib/memory-core.ts` directly.

That is the portability argument made concrete. A fact your coding agent learns
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

```json
{
  "mcpServers": {
    "fuuud": {
      "command": "node",
      "args": ["--experimental-strip-types", "mcp/server.mts"],
      "cwd": "/absolute/path/to/fuuud",
      "env": {
        "KM_OWNER_ADDRESS": "0x...",
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
