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
it — because the profile is not in our database, it is on Walrus under your own
address.

Ask any nutrition chatbot for a meal plan twice and you type your conditions
twice. For someone managing diabetes and a groundnut allergy, that is not an
inconvenience. A forgotten allergy is a hazard, and re-declaring it every
session is a hazard waiting for the one time you forget.

Fuuud is three surfaces over one record:

- **The chat** recalls your conditions and allergies before generating, folds
  them into the system prompt as hard constraints, and screens what comes back.
- **`/consultants`** ranks practitioners by the conditions it recalled, showing
  the reason next to each — visible proof that memory drives the app, not just
  the chat.
- **An MCP server** exposes the same memory, through the *same contract*, to
  Claude Code, Cursor, or any other agent. A fact your coding agent learns is
  enforced by the web app's allergen screen, and vice versa, because the record
  lives on Walrus rather than inside either application.

There is no database. Memory is the only store — which is what lets someone
clone the repo and run it with three environment variables.

The safety check is deliberately **not** the model's job. `check_meal` matches
ingredient tokens against your recorded allergens (`kuli kuli` → peanut,
`semovita` → gluten, and `garden egg` is not an egg). It runs after the model
speaks, so an unsafe suggestion is caught whether it came from a static plan or
a hallucination.

## 3. What it remembers

Two namespaces, both keyed to the owner's Sui address:

| Namespace | Holds | Written when |
|---|---|---|
| `kitchen:health:<suiAddress>` | conditions, allergies | the user asserts one |
| `kitchen:feedback:<suiAddress>` | rejected meals, symptoms | the user refuses a suggestion **with a reason**, or reports a symptom after eating |

**Never written:** cravings, small talk, the assistant's own suggestions,
speculation and hypotheticals, or anything in a turn containing "don't save
that" — that instruction covers the whole turn, including a real condition
mentioned inside it. Most turns store nothing, and the prompt says so explicitly
so the agent does not invent facts to look useful.

**The problem the memory solves** is re-declaration. Steps 3→4 of the acceptance
test are the entire point: close the browser, clear all site data, sign in
again, say only "what should I eat today?" — and the constraints are already
applied. Steps 5→6 are what make it Walrus: retract a fact and nothing can read
it again, then revoke the delegate key on-chain without asking the app's
permission.

That step 3→4 claim has one failure mode, and we handle it rather than hope.
The relayer's vector index and the blobs on Walrus are separate stores; only the
second is durable. A namespace with missing index rows recalls **nothing** while
the record sits intact — and here, an empty recall is indistinguishable from a
healthy person with no conditions. So an empty recall is never taken at face
value: it triggers one `restore()` pass for that namespace, which pulls the
blobs back from Walrus, decrypts, re-embeds and reinserts the rows, then the
recall is retried. Once per namespace per process, and never in front of a
recall that already returned something.

### Four SDK behaviours that shaped the whole design

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
`OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` or `XAI_API_KEY` — whichever
you already have — and it uses it; pin one with `KM_MODEL_PROVIDER` when several
are present. Someone reproducing this should not have to open an account with a
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

**Sign-in.** Enoki zkLogin via `registerEnokiWallets` — the wallet signs a
server-issued nonce, the server verifies it with
`verifyPersonalMessageSignature`, and only then mints an HMAC-signed session
cookie. An address asserted by the client is never trusted on its own; it is the
key to someone's medical record.
