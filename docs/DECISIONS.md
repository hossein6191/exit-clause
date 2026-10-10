# Decisions

Why each rule of `contracts/exit_clause.py` is the way it is, and what is
verified and what is not.

## 1. One fixed rule, not a provider's promise

**Every reply is judged against the same sentence, and no provider writes it.**

> A cancellation is honoured when the reply itself confirms it: no phone call,
> chat, visit or form is required, no offer must be answered first, no other
> condition is attached, and it takes effect no later than the end of the
> current period.

A plan could have carried its own cancellation terms, written by the provider
and judged as written. That puts the provider in charge of the standard it is
judged by. A provider who writes "cancellation by phone only" has published a
promise that any phone-call reply honours, and the member learns that only
after paying. A promise also has to be read by every member before joining,
and its wording becomes one more text the network must weigh.

One rule removes both problems. A member knows what "cancel anytime" means here
before reading anything about the plan, because it means the same thing on
every plan. The validators read the same rule in every round, so the only
texts that change between rounds are the member's message and the provider's
reply. The rule is a module constant (`THE_RULE`), placed in the RULE block of
both askings, and published word for word by `rules()`. A test checks that all
three are the same text, and that no write takes a rule, a promise or terms.

**The rule is a click-to-cancel rule, stated as conditions a reader can check.**
Each clause names something a reply can visibly do or fail to do: confirm, ask
for a call, chat, visit or form, put an offer first, attach a condition, or
take effect later than the period's end. "Fair" or "reasonable" would have
asked the model for a judgment of taste, and honest validators would disagree.

**The member's identity is stated, not asked.** The prompt says the message
came from the member's own account. Otherwise a reply that asks the member to
call "so we can confirm your identity" could pass as diligence instead of the
stall it is.

**An offer is not a stall unless the cancellation waits on it.** The reading
note says an offer the member may ignore, while the cancellation goes ahead,
is not an offer that must be answered first. A provider may still try to keep
a customer. It may not make leaving depend on the attempt.

## 2. The held fee, not a bond

**The contract holds the period's fee, and that fee is what a stall costs.**
A plan could have asked the provider for a bond, paid out as a penalty to each
member whose cancellation stalled. A bond has to be sized and kept topped up,
caps how many members a plan can take, and needs a separate penalty figure
that somebody has to choose. It also makes the provider's exposure to each
member a number unrelated to what that member paid.

Holding the fee needs none of that. The money at stake is already in the
contract, because the member put it there to join. It reaches the provider
only when the period is over, and only if no cancellation on it is open. A
stalled or lapsed cancellation sends that same money back. The contract never
has to find money it does not hold, and no plan has a capacity. The
provider's risk is exactly the fee the member paid, which is the thing the
member wanted not to lose.

**`join` is the only write that takes value.** A provider puts up nothing and
a cancellation costs nothing to send. That keeps the payable surface to one
method, which a static test reads for any path that raises after taking value.

**Nothing renews on chain.** A membership is one period. The next period is a
new join, sent by the member. That keeps the contract from ever pulling money
from anyone, and it means "cancel" here is the provider's written
confirmation, backed by the fee the contract still holds.

## 3. Stalling and lapse return the current period only

**The member gets back what the contract holds for that membership: one
period's fee.** A stall cannot claim earlier periods, which were collected by
the provider once they ended with nothing open on them, and it cannot charge
the provider anything on top. Both would need money the contract does not
hold.

This is also the amount that matches the harm. A stalled cancellation costs
the member the period it stood in the way of. A provider whose stall would cost
it a fixed penalty of its own choosing could price stalling in. Here a stall
costs the provider exactly the period it was trying to keep.

**The fee stays held while a cancellation is open, even past the period's
end.** A member may cancel until the last second of the period, and the reply
window may run past the end. `collect` is refused while a request is open, so
a provider cannot take the fee before answering. A stall or a lapse after the
period ended still returns the whole fee. That is deliberate: a provider who
wants the month replies plainly, and in time.

**Silence returns the fee, by rule.** Once the deadline passes with the
request still open, anyone may `lapse` it, and the fee goes back with no model
asked. The burden of confirming is the provider's, because only the provider
can cancel.

## 4. `unclear` gets one more reply

**`unclear` moves nothing and leaves the provider one more reply.** A reply the
network cannot call either way is not yet a stall. A provider who wrote "we
have passed this to the team" has not refused anything, but has not cancelled
anything either. Returning the fee on `unclear` would punish a provider for a
model's doubt. Keeping the fee for the provider on `unclear` would reward
vagueness. One more reply is the provider's chance to say it plainly.

**Only one more.** Two replies per request. Without a cap a provider could
keep replying until a round happened to come back `honoured`. Two `unclear`
replies, one, or none all end the same way once the deadline passes: `lapse`,
and the fee goes back.

**A round that does not reach agreement is not counted.** It stores nothing,
so the reply can be sent again. Only a reply the validators agreed on, with
whatever word, uses up one of the two.

## 5. What the network agrees on

**The stored value is one closed word per reply.** `honoured`, `stalled` or
`unclear`. Nothing the model wrote reaches storage: `_read_answer` maps an
answer onto `yes`, `no`, `unclear` or nothing, and `_combine` writes the word.
A score or a sentence of reasoning would be a value the validators could never
compare exactly, and the fee moves on this word. Every reply's word is kept on
the request.

**The validator reruns both askings and compares the word.** Exactly, letter
for letter. A tolerance would let one node store `stalled` while another
believed `unclear`, and those two words decide whether the fee goes back.

**A leader that raised is never agreed with.** A failure is not a verdict.

**The validator's own failure is a disagreement.** Its rerun is inside
try/except. Without that, a node whose model could not be reached would raise
out of the comparison instead of voting.

**An answer the contract cannot read is `unclear`, not a failed round.** If
reading raised, a round could be thrown away and asked again until the answer
suited somebody.

## 6. Two orders, two framings, one block

The honour question is asked with the rule first and the reply last; the
stall question with the reply first and the rule last. Both run in one block,
one after the other. A model that leans towards yes, or towards no, answers
both questions the same way, and the pair (yes, yes) or (no, no) is
`unclear`, never a verdict. A model that leans on whatever it reads first sees
the rule first in one asking and the provider's reply first in the other. That
is where position and framing bias land: in the stored value.

**The second question is the inverse, not a paraphrase.** "Does it honour the
cancellation under the rule" and "does it stall the cancellation" need
opposite answers for the same reading. A paraphrase would let the same bias
pass twice.

The orders are tied to the framings rather than crossed (four askings per
reply) to keep the round at two askings. A bias that follows both the order and
the framing at once could still agree with itself; that is listed under what
is not verified.

## 7. The model never sees an amount

The round receives the member's message and the provider's reply, and the
rule is the contract's own text. The question is whether a reply honours the
rule, not what the period is worth. An amount in the prompt would invite the
model to weigh the fee against the offence, and honest validators would answer
different questions. The plan's name, the addresses and the dates stay out too:
a famous-sounding brand or a date near a holiday is not evidence.

## 8. The prompt is where trust changes hands

The message and the reply are untrusted, each written with money at stake.
Every block is:

- fenced with `str(raw).replace("<", "(").replace(">", ")")` (replace, never
  delete, so a length cap still holds after fencing),
- capped at its own limit,
- placed between delimiter lines carrying the first 16 hex characters of its
  own sha256,
- and declared untrusted before the first block.

The tag depends on every byte of the text, so a text cannot carry its own
closing line. The label on a delimiter line is one of the contract's three
constants, and anything else prints as `BLOCK`. The rule goes through the same
fence and tag as the other two, so every block is built the same way. A static
test fails if a value reaches a prompt without being fenced or a contract
constant.

**Printable ASCII on one line, at the door.** Every text is refused if it has
a line break, a control character or anything outside ASCII. No look-alike
angle bracket and no line of its own can reach the prompt. Angle brackets
themselves are allowed and fenced at the prompt boundary, so storage keeps
what was written.

**Nothing is sampled.** A text over its limit is refused, so every character
of everything judged is inside the prompt that judged it.

## 9. Who may write

Every write is bound to an address, and the exceptions are listed in the test
suite with their reasons:

- `lapse` is open: after the deadline with no honoured or stalled verdict, the
  fee goes back to the member recorded on the request, whoever calls. A member
  must never depend on the provider to get the month back.
- `collect` is open: after the period's end with no request open, the fee goes
  to the provider recorded on the plan, whoever calls. A provider's pay never
  waits on one particular account, and nothing can be moved early.

Every other write is bound to the sender. `open_plan` makes the sender the
provider and refuses a second open plan of the same name from the same
address, because members could not tell the two apart. `close_plan` and
`reply` compare the sender with the plan's provider. `join` refuses the
provider and a second live membership. `cancel` compares the sender with the
membership's member. Every comparison is in lowercase, because an address is
twenty bytes and not a case-sensitive string. A static test reads each write's
parsed source and fails on a write that refuses nobody and is not listed, and
on a listed write that has grown a gate.

## 10. Every refusal leaves a way on

| the party who is refused or does not act | what happens next |
|---|---|
| the provider never replies, or only replies `unclear` | anyone calls `lapse` once the deadline passes: the fee back to the member |
| the provider replies too late | the reply is refused and names `lapse` |
| the provider's reply is refused at the door (too short, a line break) | it is corrected and sent again inside the window |
| the validators do not agree on a reply | nothing is stored; the reply is sent again, or `lapse` applies once the window closes |
| a join sent with the wrong fee | the value comes back; the join is sent again with the fee |
| a second join while a membership is live | the value comes back; the member joins again once it is over |
| a member's message refused at the door | it is corrected and sent again inside the period |
| a provider whose early `collect` is refused | it collects once the period ends |
| a provider whose `collect` is refused while a request is open | it replies first; an honoured reply lets it collect |
| a provider refused a duplicate plan name | it closes the old plan, or picks another name |

Each is tested as a journey to its end, not a single call.

## 11. The money

**One exit per request.** Every request ends through `_close_request`. It
writes the ending first. On `honoured` it marks the membership cancelled and
moves nothing. On `stalled` or `lapsed` it zeroes the held fee, marks the
membership refunded, and then sends the member one transfer. A test records
the request's and the membership's state at the moment of the transfer and
finds both already written.

**The fee is in exactly one place.** For every membership, exactly one of
`held`, `refunded` and `collected` is the fee and the other two are 0. The
contract's `held` is the sum of what the memberships hold, and it equals the
balance.

**The payable write never raises after taking value.** `join` checks its
argument's type before reading it and reads the clock without raising when it
is missing. On every refusal, a missing clock included, it returns what was
sent and answers `{"ok": false, "reason", "returned"}`. A raise there would
strand the value. A static test reads its source for `_fail`, `_clock`, a
raising lookup and any `raise`.

**Conservation is checked, not assumed.** Sixty seeded random journeys call
every write in random order, often with the wrong caller, the wrong amount or
a closed state, against five scripted models. After every step:

- what the contract received minus what it sent equals what it holds;
- every fee is in exactly one place;
- every closed request either sent its fee back or left it for the provider;
- a write that raised changed nothing at all.

Every journey ends with nothing held.

## 12. Storage, ids and views

`Plan`, `Membership` and `Request` hold scalars only; the replies and the id
lists are JSON strings, because a collection inside a storage dataclass kills
the VM. Every JSON read goes through one `_loads` that refuses a fraction, an
exponent, NaN and Infinity before a float is built, because a float traps the
VM in deterministic mode. Every non-string argument is checked with
`isinstance` or read by `_number_arg`, which takes an int or a string of digits
and refuses a bool.

Ids are the contract's own (`P1`, `M1`, `R1`), so nobody can claim a name
first. Views take a short id, a number or an address, because a Studio read
call fails once its encoded arguments pass 256 bytes.

**No view keeps a record per provider.** `plan()` shows terms, members and
what is held, not how its cancellations ended. `stats()` is totals only. The
contract's job is to settle each cancellation, not to rate providers. Every
request is public, so anyone who wants a record can build one in the open.

## 13. The clock

There is no block timestamp. The only clock every node agrees on is the
message's own `gl.message_raw["datetime"]`, read with a hand-made integer
calendar because `datetime` and floats trap the VM. A write that takes no value
refuses when the clock is missing or unreadable; `join` refunds instead. Views
report `now` and a `phase` of `unknown` without a clock.

Periods and windows are measured in whole seconds. The closing second of a
period belongs to the provider: at `end` the member may no longer cancel and
the fee may be collected. The closing second of a window belongs to the
member: at `deadline` the provider may no longer reply and anyone may lapse.

## 14. What is verified and what is not

Verified offline (`pytest tests/ -q`, 141 tests, no network):

- every rule, refusal and refund;
- every journey: honoured then collect; stalled with the fee back in the same
  call; unclear then honoured; unclear then stalled; unclear then lapse; two
  unclear replies and a third refused; no reply then lapse; collect refused
  before the end and while a request is open; a stall after the period ended;
  joining again after the end; two members; a closed plan whose memberships
  run on;
- the routes out of every refusal;
- the combine table in all sixteen cells;
- the consensus closure, run against scripted models with the leader and each
  validator in a world of its own, including a validator outvoted, a leader
  that raised and a validator whose own rerun fails;
- the static rules: the open writes listed with reasons; fenced prompt values;
  the model called only inside the leader closure; one block; no float; scalar
  storage; a payable write that never raises; THE RULE the same in the
  constant, the prompt and `rules()`;
- the seeded random journeys.

`tools/mutate.py` removes or inverts 186 defences one at a time and the suite
catches every one; `tests/MUTATIONS.md` names the test that caught each.

Not verified:

- What a live model answers on replies other than the demonstration's. On chain (11 October 2026,
  register `0xc8B97A242cb10c016566572bF8b5BE9b74e81764`, 29 checks passed and 0 failed,
  `tests/on_chain/smoke-run.log`) the validators read the confirmation as `honoured` and the
  "please call our member line" reply as `stalled`, each in one round with 3 agreeing and 2 idle, and the
  deployed bytes equal this file.
- A bias that follows both the presentation order and the framing at once.
- The two-reply cap on chain. It needs two `unclear` verdicts in a row, which
  no scripted text can promise, so the on-chain run shows a further reply to a
  settled request refused instead, and the cap is covered offline.
- Whether the provider stops charging elsewhere. The contract enforces the
  reply and holds the fee; it does not reach into anybody's billing system.
- Whether the rule matches the consumer law of any particular place. It is not
  meant to.
