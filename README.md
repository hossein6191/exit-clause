# Exit Clause

Cancel anytime, enforced: the month's fee is held until the month ends, and a
provider whose reply stalls a cancellation gives that month back.

## The problem

"Cancel anytime" is on every gym leaflet, streaming plan and meal box. Then
the customer tries. The reply asks them to call a member line on weekdays, or
to visit the front desk, or to fill in a form, or to answer a retention offer
first, or it says the request has been passed to a team. Meanwhile the month
runs out and the next one is charged. Most people give up, pay another month
or two, and cancel the card.

The question underneath is always the same, and it is a question about words:
does this reply actually cancel, or does it put the customer off?

## What it is

A provider **opens a plan**: a name, a fee for one period, the length of the
period and the length of its reply window. A customer **joins** by paying
exactly the fee. The contract **holds** that fee for the period. It is the
provider's only once the period has ended.

Every plan is bound by one rule. It is a constant in the contract, the same
for every provider, and no provider can change it:

> A cancellation is honoured when the reply itself confirms it: no phone call,
> chat, visit or form is required, no offer must be answered first, no other
> condition is attached, and it takes effect no later than the end of the
> current period.

To leave, the member **cancels** during the period: a short message, and the
provider's reply window starts. The provider **replies**, and the network reads
the reply against the rule in the same transaction:

- **honoured**: the request closes. The membership ends at the end of the
  period, and its fee stays held for the provider.
- **stalled**: the request closes, and **this period's fee goes back to the
  member in the same transaction**. The membership ends now.
- **unclear**: nothing moves, and the provider may reply once more before the
  deadline.

A provider who lets the window pass without an honoured or stalled verdict
gives the fee back by rule: anyone may **lapse** the request, with no model
asked. Once a period is over and no cancellation is open on it, anyone may
**collect** its fee for the provider. A provider can **close** a plan to new
members; every membership it already has runs to its own end.

## How consensus is used

`reply` runs one consensus block that asks about the reply twice, in two
framings and two presentation orders. Order 1 asks the honour question:

> Does this reply honour the cancellation under the rule above: it confirms
> it, requires no call, chat, visit or form, makes no offer the customer must
> answer first, attaches no other condition, and takes effect no later than
> the end of the current period?

Order 2 asks the stall question:

> Does this reply stall the cancellation: ask for a call, chat, visit or form,
> make it wait on an offer or another step, refuse it, or put it off beyond the
> end of the current period?

| asking | blocks, in order | question |
|---|---|---|
| order 1 | RULE, MESSAGE, REPLY | the honour question |
| order 2 | REPLY, MESSAGE, RULE | the stall question |

The contract combines the two answers into one word:

| order 1 | order 2 | stored |
|---|---|---|
| yes | no | `honoured` |
| no | yes | `stalled` |
| anything else, including an answer it cannot read | | `unclear` |

The stored value is that word, and the request keeps the word of every reply.
Every validator reruns both askings itself and compares the word by exact
string equality. A validator never agrees with a leader that raised, and a
validator whose own rerun fails disagrees. There is no tolerance for a bias to
hide in. The second question needs the opposite answer, so a model that says
yes to everything, or no to everything, lands as `unclear`. That moves nothing
and leaves the deadline running.

The rule is the contract's own text and the same in every prompt. The
member's message and the provider's reply are untrusted, and every prompt says
so before the blocks. Each is fenced (`<` and `>` replaced, never deleted) and
sits between two delimiter lines tagged with the start of its own sha256, so a
text cannot write the line that closes it. **The model never sees an
amount**, an address, a plan name or a date. It is asked whether a reply
honours the rule, never what that is worth.

## Who may do what

| call | who | when |
|---|---|---|
| `open_plan(name, fee_atto, period_seconds, reply_seconds)` | anyone; the sender is the provider | one open plan per name per address |
| `close_plan(plan)` | the provider | once |
| `join(plan)`, payable | anyone but the provider | while the plan is open, with exactly the fee; one live membership per address per plan |
| `cancel(membership, message)` | the member who holds it | during its period; once per membership |
| `reply(request, text)` | the provider | before the deadline; at most two replies per request |
| `lapse(request)` | anyone | after the deadline, with the request still open |
| `collect(membership)` | anyone | after the period's end, with no request open and the fee still held |

Every write names its caller. The two that refuse nobody by sender (`lapse`,
`collect`) are listed in the test suite with the reason: what they move is
fixed by the clock and the row, and it goes to the party recorded on the row
whoever calls. `join` is the only write that takes value. A refused join
returns what was sent in the same transaction and answers
`{"ok": false, "reason": ..., "returned": ...}`. The other writes take no
value and refuse by raising, so a refusal is a stored transaction anyone can
find.

Views take a short id, a number or an address, never a text: `plan(id)`,
`membership(id)`, `request(id)`, `plans(offset, limit)`,
`memberships_of(address)`, `requests_of(address)`, `stats()` and `rules()`.
`stats()` is totals only. No view keeps a record per provider.

## The money

| moment | what moves |
|---|---|
| `join` | the member pays exactly the fee; the contract holds it for the period |
| `reply`, `honoured` | nothing; the fee stays held for the provider until the period ends |
| `reply`, `stalled` | this period's held fee back to the member, in the same transaction |
| `reply`, `unclear` | nothing |
| `lapse` | the held fee back to the member, by rule |
| `collect` | the held fee to the provider, once the period is over and no request is open |
| a refused `join` | everything sent goes back to the sender, in the same transaction |

The contract's balance is always the sum of the fees it holds
(`stats().held`). The offline suite checks that after every step of sixty
seeded random journeys, and every journey ends with nothing held.

The demonstration: P1, Ironside Gym, a fee of 0.5 GEN for a period, with the
same rule as everyone else.

| member | message | the provider's reply | stored | the 0.5 GEN |
|---|---|---|---|---|
| A | Please cancel my Ironside Gym membership at the end of this month. Thank you. | Your membership is cancelled and ends when this month ends. No further payments will be taken. | `honoured` | held, then collected for the provider at the period's end |
| B | I would like to cancel my membership, please. I am moving to another city next month. | We're sorry to see you go! To cancel, please call our member line on weekdays between 9 and 5 so we can confirm your identity. | `stalled` | back to B in the same transaction |

A second plan, P2, Northwind Stream, has a five-minute reply window and a
provider who never replies. Once the window closes, anybody lapses the request
and the member's 0.3 GEN comes back by rule.

## Why this has to be on GenLayer

The decision is a reading: does what the provider wrote back actually cancel
the subscription, or does it put the customer off? A deterministic contract
cannot make it. A single oracle could be asked again until it said yes, and
its answer could not be checked. Here every validator reads the same rule and
the same two texts. The stored value is a closed word that a disagreement
shows up in, and the fee follows it in the same transaction, from money the
contract was already holding.

## The limits, stated plainly

- **Nothing renews on chain.** A membership is one period. The next period is
  a new join, sent by the member. The cancellation is the provider's written
  confirmation, and the held fee is what stands behind it.
- **The contract enforces the reply, not the billing outside it.** An honoured
  cancellation is a public record the member can show anyone. The contract
  cannot stop a card being charged somewhere else.
- **Stalling and lapse return the current period only.** The member gets back
  the fee the contract holds, never more. The model never sees it.
- **`unclear` gives the provider a second reply.** Two `unclear` replies, or
  none, end in `lapse` once the window closes: silence returns the fee.
- **A cancellation can be sent until the last second of the period**, and its
  reply window may run past the period's end. The fee stays held until the
  request closes. A stall or a lapse after the period ended still returns the
  whole fee.
- **The rule is one rule, written in the contract,** not the consumer law of
  any country. This is not legal advice.
- **A round that does not reach agreement stores nothing.** The reply can be
  sent again while the window is open; if the window closes first, `lapse`
  applies. A round that does reach agreement is final, `unclear` included.
- **Someone has to call `collect` and `lapse`.** Anyone may, and what they
  move goes to the party on the row, but the contract does not run by itself.
- **Texts are printable ASCII on one line.** Names 3 to 60 characters,
  messages 20 to 400, replies 20 to 600. Nothing longer is ever judged in
  part. Fees are 0.1 to 100 GEN; a period is 5 minutes to 90 days; a reply
  window is 5 minutes to 14 days.

## What is in this repository

```
contracts/exit_clause.py     the contract
tests/test_pure.py           the offline suite, including the consensus round with scripted models
tests/MUTATIONS.md           every defence removed in turn, and the test that caught it
tests/on_chain/smoke.mjs     a throwaway-account run against Studio
tools/mutate.py              the generator that writes MUTATIONS.md and refuses to if anything survives
docs/CONTRACTS.md            purpose, consensus, state, methods, reuse and limits
docs/DECISIONS.md            why each rule is the way it is, and what is verified and what is not
web/                         the site
```

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                          # no network, no Studio
genvm-lint check contracts/exit_clause.py
python tools/mutate.py                    # rewrites tests/MUTATIONS.md; exits 1 if a mutant survives
```

On this repository as it stands, `pytest tests/ -q` gives **141 passed** in
under two seconds. `genvm-lint check` (genvm-linter 0.11.0) prints
`Lint passed (3 checks)` and reports 15 methods, 8 view and 7 write.
`python tools/mutate.py` removes or inverts **186 defences** one at a time,
and **none survives**.

The on-chain run uses four throwaway keys it generates itself (provider,
member A, member B, stranger) and funds them from the Studio faucet. It never
touches anybody's own wallet. It saves every step to a state file, so a run
that is cut off continues where it stopped:

```
npm ci
node tests/on_chain/smoke.mjs                  # about forty-five minutes: P1's period is thirty
RESUME=1 node tests/on_chain/smoke.mjs         # continue from the saved state
STATE=./smoke-state.json RESUME=1 node tests/on_chain/smoke.mjs
```

It tells the story above. A's cancellation is honoured and its fee collected
for the provider once the period ends. B's is stalled and the fee comes back
in the same transaction. The Northwind request is lapsed by a stranger. On the
way, a join with the wrong fee is refunded in the same transaction, and these
are each refused: an early collect, a stranger's cancel, a stranger's reply,
and a reply to a settled request. It prints a PASS or FAIL line for every
check, the balances before and after every step that moves money,
`N passed, M failed`, and the contract address.

## The site

`web/` is the site, a Next.js app built to look like a mail client: a left
rail of folders, a list of plans or threads, and a reading pane. A
cancellation is a thread. Each provider reply carries the stamp the network
put on it (HONOURED, STALLED, UNCLEAR or LAPSED). A deadline chip counts down
on every open request, and a "held" chip shows the fee the contract still
holds on every live membership.

| page | what happens there |
|---|---|
| `/` | the inbox: what this is in one minute, THE RULE, five sample threads (one per ending) and where the held month goes |
| `/plans` | every plan as an inbox row, the demo provider's three pinned on top |
| `/plan/P1` | a plan, the rule it is bound by, Join, your membership with its period and held fee, the cancellation composer, its thread |
| `/request/R1` | the thread, the step line (Joined, Cancellation sent, Reply, Stamped, Closed), and what whoever is looking may do: reply, lapse, collect |
| `/provider` | open a plan (three samples or your own terms), the cancellations sent to your plans, collect served periods |
| `/mine` | your memberships and the cancellations you sent |
| `/ledger` | the contract's totals and the latest stamps |
| `/how` | the two askings, the combine table, the money table, the limits, and `rules()` read live |

**One wallet can try everything.** A demo provider, a throwaway Studio key held
only by the site's server, runs three plans with a fifteen-minute period:
Ironside Gym (replies with a clean confirmation), Northwind Stream (asks you to
phone a care line) and Lingo Daily Pro (offers 50% off and waits for your
answer). Join one, send a cancellation, and the request page asks the demo
provider to reply (`POST /api/demo/reply`, rate-limited, one signature at a
time). Untick "Let the demo provider reply" to watch the window run out and
lapse it yourself instead. Every field a visitor fills has one-click
suggestions inside the contract's limits.

Deploying on Vercel: Root Directory `web`, and these environment variables.

| variable | value |
|---|---|
| `NEXT_PUBLIC_CONTRACT` | the deployed contract's address (or set `DEMO_CONTRACT` in `web/lib/config.ts`) |
| `DEMO_PROVIDER_KEY` | a throwaway Studio private key for the demo provider; never a key that holds anything real |
| `NEXT_PUBLIC_SITE_URL` | optional, the site's public address for link previews |

Then open the three demo plans once, from the same key:

```
cd web
REGISTER=0x... DEMO_PROVIDER_KEY=0x... node tools/open-demo-plans.mjs
```

`GET /api/demo/status` says whether the demo provider is online, and if not,
exactly why: `no key set`, or `the key set is not a 0x private key of 64 hex
characters`. The key is read forgivingly (quotes, spaces and a missing `0x`
are fine) and never echoed.

Working on the site:

```
cd web
npm ci
npm run dev:mock      # an in-memory copy of the contract, scripted stamps, no wallet; port 3219
npm run typecheck && npm run lint && npm run test:site && npm run build
```

`npm run test:site` runs the site's offline tests: the pure helpers, every
call and refusal checked against `contracts/exit_clause.py`, the three demo
plans from join to stamp, a collect after the period, a lapse, the refusals a
visitor can meet with their way out, money conservation over four hundred
seeded random steps, and a check that nothing personal is in the site's files.

## Network

GenLayer Studio, chain 61999, RPC `https://studio.genlayer.com/api`, explorer
`https://explorer-studio.genlayer.com`. The contract pins the runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` in its first
line.

## Evidence

Run on 11 October 2026 on GenLayer Studio (chain 61999) by `tests/on_chain/smoke.mjs`, from four generated
accounts, one per role: **P** the provider, **A** and **B** two members, and **S** a stranger. **29 checks passed,
0 failed**; the whole log is `tests/on_chain/smoke-run.log`.

Register [`0xc8B97A242cb10c016566572bF8b5BE9b74e81764`](https://explorer-studio.genlayer.com/address/0xc8B97A242cb10c016566572bF8b5BE9b74e81764).
`gen_getContractCode` on it returns `contracts/exit_clause.py` byte for byte (50,783 bytes, sha256
`80c62a0d3d3f7ba8b6533a617666e1f6d2146588745d728a6fd40f2a6218902e`).

| call | by | transaction | result |
|---|---|---|---|
| deploy `contracts/exit_clause.py` | P | [0x71ba225d…](https://explorer-studio.genlayer.com/tx/0x71ba225d42a2399aa3c60fa66170b1b5dd5de95278f8266c0a05d8ce753ef27d) | register `0xc8B97A24…1764`; `gen_getContractCode` returns the repository file byte for byte (sha256 `80c62a0d…`) |
| open P1, Ironside Gym: 0.5 GEN for a 30-minute period, 25-minute reply window | P | [0x3c729802…](https://explorer-studio.genlayer.com/tx/0x3c729802d83dbca9c76cc1060db450aabe9ecc6be852b255ec89433437cc69d6) | P1 open |
| A joins P1 with exactly the fee | A | [0x3f7bc195…](https://explorer-studio.genlayer.com/tx/0x3f7bc1959ae2e5f69d1d3e7151425473c1dbcbbcac7876de25426364e5fc01eb) | M1; the contract holds the 0.5 GEN, nothing reaches the provider yet |
| the provider collects M1 while its period runs | P | [0xea860fbb…](https://explorer-studio.genlayer.com/tx/0xea860fbb8daa4b218ee61fd552c34096e33dea15bf42565e3cf5d299d516a396) | refused: the period is still running |
| a join with 0.25 GEN instead of the fee | S | [0x7e38c20f…](https://explorer-studio.genlayer.com/tx/0x7e38c20f5187575f90a1a21a61c2d8c510428dddddd8199fed46f7c0799985dc) | refused, `ok: false`; the 0.25 GEN came back in the same transaction |
| a stranger cancels A's membership | S | [0x185bbdf0…](https://explorer-studio.genlayer.com/tx/0x185bbdf07d54614936c9cd784fb84c8cf20d14557332f09565bbb89ff972bae5) | refused: only the member may |
| A asks to cancel M1 | A | [0x8ef7f161…](https://explorer-studio.genlayer.com/tx/0x8ef7f161be6bcf845907710b9e18deda9877fd4b83d86f659125813db0173440) | the provider's reply window starts |
| a stranger replies to A's request | S | [0x37b9792e…](https://explorer-studio.genlayer.com/tx/0x37b9792ed0921e5f529f340982a2405fddfb54f2f7f8481c82a616d63c699b64) | refused: only the provider may |
| the provider replies to A: "Your membership is cancelled and ends when this month ends. No further payments will be taken." | P | [0x69af6551…](https://explorer-studio.genlayer.com/tx/0x69af655110e9af4b17a32342902f56ba020fa4523556cfe099bd0f5d9a11f9e9) | **honoured**, 3 agree and 2 idle; nothing moves, A's fee stays held for the provider until the period ends |
| the provider replies to B: "To cancel, please call our member line on weekdays between 9 and 5…" | P | [0xe4be8104…](https://explorer-studio.genlayer.com/tx/0xe4be81049a00e6f653f49a3b35c0048d44ceb407a7d003500cdc3396a54d53da) | **stalled**, 3 agree and 2 idle; **B's 0.5 GEN came back in the same transaction** and the membership ended |
| a further reply to A's settled request | P | [0x16b8e6bd…](https://explorer-studio.genlayer.com/tx/0x16b8e6bd29d328b22520d04dd09174a2c494233abaec8003e84cb98cbcedded4) | refused: a reply is taken only while the request is open |
| P2's provider never replied; after the 5-minute window a stranger lapses A's request | S | [0xb2c04f91…](https://explorer-studio.genlayer.com/tx/0xb2c04f91d3480a793ad2d163571ac9c37103456b6d1ec5789a7170d75aa5eeb2) | **lapsed**: A's 0.3 GEN back by rule, no model asked |
| after A's period on P1 ends, a stranger collects M1 | S | [0xbf709882…](https://explorer-studio.genlayer.com/tx/0xbf7098827f626299d5864fa31b48e5424d9d12e6395fbd0ce2acaeb24a0e1818) | **served**: the provider received the 0.5 GEN |

At the end `stats()` read two plans, three memberships and three requests: one honoured, one stalled and one
lapsed, one refused join, nothing held. The contract's own balance was zero, and every account ended where the
money table says: the provider up 0.5 GEN for the one period it served, A down 0.5 GEN, B and the stranger whole.

After the run the site's demo provider, a separate throwaway key, opened the three sample plans the site uses
(P3 Ironside Gym, P4 Northwind Stream, P5 Lingo Daily Pro) on the same register.

## Licence

MIT. See `LICENSE`.
