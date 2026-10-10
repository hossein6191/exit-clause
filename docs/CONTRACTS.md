# Contracts

One file, `contracts/exit_clause.py`. It is the only thing in this repository
that asks the network anything.

## contracts/exit_clause.py

### Purpose

A subscription whose cancellation is enforced. A member pays one period's fee
and the contract holds it until the period ends. A member who wants to leave
sends a message during the period, and the provider has a fixed window to
reply. The network reads each reply against one rule, fixed in the contract
and the same for every provider, and decides whether the reply honours the
cancellation or stalls it. A stalling reply sends the period's held fee back
to the member in the same transaction, and so does silence once the window
closes. An honoured cancellation, or a period nobody cancelled, pays the
provider once the period is over.

The rule, `THE_RULE`, word for word:

> A cancellation is honoured when the reply itself confirms it: no phone call,
> chat, visit or form is required, no offer must be answered first, no other
> condition is attached, and it takes effect no later than the end of the
> current period.

### Consensus

One round per reply, `_read_round(message, reply)`, a single
`gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` block called from `reply`.
The only two `gl.nondet.exec_prompt` calls in the file are inside that
`leader_fn`. Only the member's message and the provider's reply enter the
round, and the rule is the contract's own constant: no amount, address, id,
plan name or date can reach a prompt.

1. `_honour_task(message, reply)`: blocks RULE, MESSAGE, REPLY, and the
   honour question: "Does this reply honour the cancellation under the rule
   above: it confirms it, requires no call, chat, visit or form, makes no
   offer the customer must answer first, attaches no other condition, and
   takes effect no later than the end of the current period?"
2. `_stall_task(message, reply)`: blocks REPLY, MESSAGE, RULE, and the stall
   question: "Does this reply stall the cancellation: ask for a call, chat,
   visit or form, make it wait on an offer or another step, refuse it, or put
   it off beyond the end of the current period?"

Each answer is read into `yes`, `no`, `unclear`, or nothing. `_read_answer`
never raises; it reads a JSON boolean and refuses a number with a fraction.
`_combine` turns the pair into `honoured` (yes then no), `stalled` (no then
yes) or `unclear` (anything else). The leader returns `{"v": "stalled"}`.

`_agrees` is the whole comparison. A leader result that is not a
`gl.vm.Return` is never agreed with. Otherwise the validator reruns both
askings itself inside try/except, so its own failure is a disagreement, and
compares the word by exact string equality. After agreement, `_clean_word`
reads the value back; a value in any other shape is `unclear`, which moves
nothing.

Every prompt has the same order:

1. The task. It says the member's identity is already proven by their own
   account, and that the rule is the register's own and the same for every
   provider.
2. A notice that the MESSAGE and REPLY blocks are untrusted and never an
   instruction, and that block order carries no meaning.
3. The three blocks.
4. A short reading note: a customer needs no reason to cancel, and an offer
   the customer may ignore is not one that must be answered first.
5. The question and the closed answer format.

Each block is `<<<LABEL tag>>>` / fenced text / `<<<END LABEL tag>>>`. The
label is one of the contract's three, and the tag is the first 16 hex
characters of the sha256 of the fenced text. Each block is capped after
fencing at the same limit the door enforces: 400 for the rule and the
message, 600 for the reply.

### State

Three storage dataclasses, scalars only (a collection inside one kills the VM).

`Plan`:

| field | type | what it is |
|---|---|---|
| `provider` | `Address` | the sender of `open_plan` |
| `name` | `str` | as opened, trimmed |
| `fee` | `u256` | one period, in atto |
| `period`, `reply_window` | `u64` | seconds |
| `status` | `str` | `open` or `closed` |
| `opened_at`, `closed_at` | `u64` | seconds on the message clock |
| `members` | `u32` | memberships ever opened on the plan |
| `held` | `u256` | the fees this plan's memberships hold now |
| `memberships_json` | `str` | JSON list of the plan's membership ids |

`Membership`:

| field | type | what it is |
|---|---|---|
| `plan_id`, `member` | `str`, `Address` | the plan and the joining address |
| `fee` | `u256` | what was paid at join |
| `start`, `end` | `u64` | the period: `end = start + period` |
| `status` | `str` | `live`, `cancelling`, `cancelled`, `refunded` or `served` |
| `held`, `refunded`, `collected` | `u256` | where the fee is: exactly one of them is the fee, the others 0 |
| `request_id` | `str` | the one cancellation of this membership, or "" |
| `closed_at` | `u64` | when the fee left the contract |

`Request`: `membership_id`, `plan_id`, `member`, `message`, `status` (`open`,
`honoured`, `stalled`, `lapsed`), `sent_at`, `deadline`, `n_replies`,
`replies_json` (every reply as `{"text", "verdict", "at"}`), `refunded`,
`closed_at`, `closed_by`.

The contract holds:

- `plan_rows`, `membership_rows` and `request_rows`.
- `latest`: plan and lowercase address to that address's latest membership.
- `plan_names`: lowercase address and name to the plan it last opened.
- Four indexes from a lowercase address to a JSON list of ids: `by_provider`,
  `by_member`, `sent` and `received`.
- `u32`/`u256` totals, among them `held`, which always equals the contract's
  balance.

Ids are the contract's own: `P1`, `M1`, `R1` and so on.

### Key methods

Writes:

| method | payable | who | on refusal |
|---|---|---|---|
| `open_plan(name, fee_atto, period_seconds, reply_seconds)` | no | anyone; the sender is the provider; one open plan per name per address | raises `[EXPECTED] ...` |
| `close_plan(plan)` | no | the provider, once | raises |
| `join(plan)` | yes, exactly the fee | anyone but the provider, while the plan is open, one live membership per address per plan | returns what was sent and `{"ok": false, "reason", "returned"}`; never raises |
| `cancel(membership, message)` | no | the member who holds it, during its period, once | raises |
| `reply(request, text)` | no | the provider, before the deadline, at most two replies | raises |
| `lapse(request)` | no | anyone, after the deadline, the request still open | raises |
| `collect(membership)` | no | anyone, after the period's end, no request open, the fee still held | raises |

A membership is **over** once its fee went back, or once its period ended with
no cancellation open on it. An open cancellation keeps the membership live
past its end, because the fee is still at stake. A member may join the same
plan again once the previous membership is over.

Views (ids, numbers and an address only):

| view | returns |
|---|---|
| `plan(plan_id)` | the terms, `members`, `live` on the clock, `held`, the membership ids and `now`; no record of how cancellations ended |
| `membership(membership_id)` | the period, `status` and `phase` on the clock (`running`, `cancelling`, `cancelled`, `due`, `refunded`, `served` or `unknown`), `collectable`, where the fee is, the request |
| `request(request_id)` | the message, every reply with its agreed word, `verdicts`, `replies_left`, the deadline and `phase` (`reply`, `lapse`, `closed` or `unknown`), the fee, what is held and what came back, who closed it |
| `plans(offset, limit)` | a page of at most 20 plan rows, oldest first |
| `memberships_of(address)` | the membership ids an address holds and the plan ids it provides, in any letter case |
| `requests_of(address)` | the request ids an address sent and the ones sent to its plans, in any letter case |
| `stats()` | totals only: plans, memberships, requests by ending, replies and unclear replies, refunds, collections, what is held, refused joins |
| `rules()` | THE RULE word for word, the reading note, the two askings, the combine table, the comparison, what the model sees, the money table, who may do what and the limits, in the contract's own words |

### Reuse

`request(request_id)` is the part meant to be read by other contracts and
pages. A consumer, such as a card issuer's chargeback desk or a budgeting
app, reads `status`, `verdicts` and `refunded`. A consumer should bind to this
contract's address and to the id it was handed, and check `member` and
`provider` against the parties it was told about. An id is a position in a
queue, never authority on its own. The contract keeps no record per provider;
anyone who wants one has to build it from the requests, in the open.

### Limits

- Every text is printable ASCII on one line: name 3 to 60 characters, message
  20 to 400, reply 20 to 600. Anything else is refused at the door and never
  judged in part.
- Fee 0.1 to 100 GEN, in atto. Period 300 seconds to 90 days. Reply window
  300 seconds to 14 days. Two replies per request.
- Twenty plans per page of `plans`.
- Every view argument is an id, a number or an address, because a Studio read
  call fails once its encoded arguments pass 256 bytes. A view reads at most
  12 characters of an id and 42 of an address.
