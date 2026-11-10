# Fuuud: a meal planner that never asks about your allergy twice

*Built for Total Recall, the Tatum x Walrus Memory hackathon. Live at [fuuud.site](https://www.fuuud.site) · code at
[github.com/ezedike-evan/fuuud](https://github.com/ezedike-evan/fuuud) · demo: <VIDEO LINK>*

## The problem

Ask a nutrition chatbot for a meal plan twice and you type your conditions twice. If you manage diabetes and a
groundnut allergy, that is not an inconvenience. Each time you have to tell the bot is a chance for it to go wrong,
and the one time you forget, it will happily suggest kuli kuli.

Fuuud is a food and nutrition agent for people in Nigeria: jollof, ofada, moi moi, egusi, akamu, not a generic
Western meal plan. It keeps a health record you own, reads it before every answer, and checks every meal it
suggests against your recorded allergens before you see it.

## Where the memory lives

There is no database for your health record. It lives in **Walrus Memory**, under a MemWalAccount on Sui that
**you** own. You sign in with Google (Enoki zkLogin). Your wallet creates the account and registers this app as a
delegate key, and the relayer sponsors the gas, so nobody needs SUI. The server only ever holds a revocable
delegate key. Revoke it onchain and the app stops reading anything you save after that.

Two namespaces hold the record:

- `kitchen:health:<address>`: conditions, allergies, clearances ("no known allergies"), religious and fasting rules.
- `kitchen:feedback:<address>`: meals you rejected and why, symptoms after eating, likes, dislikes, goals,
  budget and kitchen limits.

The same record is reachable from the website chat, a Telegram bot (text and voice notes), and a hosted MCP
connector, so Claude, ChatGPT or Cursor read and write through the same rules.

## How it learns over time

This is the part we care most about. Every turn runs one loop:

1. **Recall first.** The health namespace is read with a *fixed* safety query, never with the user's words. Recall
   is a similarity search with a relevance floor, and "something light for dinner" sits nowhere near
   `allergy | groundnuts - hives` in embedding space. An allergy cannot only matter when someone mentions it.
2. **Answer under constraints.** Recalled facts go into the prompt as hard constraints, and a deterministic
   allergen screen (`check_meal`) matches ingredient tokens against the record. It is a rule, not a model's opinion.
3. **Write through a gate.** A second pass decides whether *the person* asserted something durable: a condition,
   an allergy, a refusal with a reason, a symptom after eating. Cravings, small talk, and anything in a turn that
   says "don't save that" are never written.

So the record grows from use. Reject egusi because it upsets your stomach and next week's plan leaves it out.
Report heartburn after akara and it shows up when akara comes up again. Say your groundnut allergy has resolved and
the newer, dated fact wins, out loud: "going by your note from March…".

Getting that loop right on Walrus Memory meant working around four SDK behaviours:

- **`remember()` is append-only.** Every write recalls first at a tight distance, skips true duplicates, and stamps
  `SUPERSEDES` on contradictions. Facts are stored as `2026-11-10 | allergy | groundnuts - hives` so the newer date
  can win, and each write carries a deterministic idempotency key so a retry never writes your allergy twice.
- **`recall()` has no default relevance floor.** Every read sets `maxDistance`, otherwise a small namespace returns
  unrelated filler that the model treats as clinical context.
- **Nothing deletes.** "Forget that" writes a tombstone that outranks the claim, and tombstones are swept with
  *no* distance floor. We measured a retraction at 0.805 while the fact it retracts sat at 0.519, so a floor would
  have let a retracted allergy reach the model. Settings says "retracted", never "deleted", because the encrypted
  entry stays on Walrus until its storage period ends.
- **The vector index and Walrus are separate stores.** An empty recall triggers one `restore()` pass before we
  believe it. Otherwise a missing index looks exactly like a healthy person with no conditions.

When the record cannot be read, Fuuud says so and names no food. An empty record and an unreachable one look the
same from inside the agent, and only one of them is safe to guess at.

## Where Tatum comes in

Every onchain read the server makes goes through one function: finding your MemWalAccount in the registry by owner,
listing its delegate keys (an account holds at most 20; Settings lets you prune them), checking that the configured
registry really is a MemWal registry on the relayer's network, and, for the MCP server, learning the owner from an
account id. For this hackathon, that function now returns a Sui client on **Tatum's Sui gateway**.

One detail mattered. Tatum serves Sui over **native gRPC** (HTTP/2), while the Sui TypeScript SDK's default
transport is gRPC-web over `fetch`. Pointed at Tatum, the default client fails with
`unexpected response content type: application/grpc`. So the server hands `SuiGrpcClient` protobuf-ts's grpc-js
transport instead. It implements the same `RpcTransport` interface, so nothing downstream changed: same client
type, same calls, one reused HTTP/2 channel per network, and the API key sent as `x-api-key`, server side only.

Settings shows the result: *Read from Sui mainnet via Tatum · checkpoint … · epoch …*, linked to your account
object on Suiscan. The checkpoint comes from Tatum's `LedgerService.GetServiceInfo` on the same client, so the line
is a receipt of the read rather than a label.

## On mainnet

The record is on Walrus Memory **mainnet** (relayer `relayer.memory.walrus.xyz`). Agent ID (delegate public key):
`<MEMWAL_AGENT_ID>`. Account: `<ACCOUNT OBJECT LINK>`.

## What it doesn't do (yet)

- Retraction is not deletion, and revoking a key is forward-only: a revoked key can still read what was saved
  before it was removed, until that data is re-encrypted. We say this in the app in those words.
- Voice is listen-and-talk, not hands-free. Pidgin comes out as English words, and Yoruba and Hausa transcribe
  poorly so far.
- It is not a doctor. Whenever a condition is involved, it says so and points you to a practitioner.

Use synthetic profiles for demos. A real person's real conditions do not belong on a public network.
