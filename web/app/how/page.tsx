"use client";

// How it decides: the two askings in two framings and two orders, the table that combines them into
// one stored word, where the fee goes for each word, who may do what, the limits, and the contract's
// own rules() read live, word for word.

import * as React from "react";

import { MoneyFlow } from "@/components/money-flow";
import { Single } from "@/components/panes";
import { Placeholder, ReadError } from "@/components/read-state";
import { RuleBlock } from "@/components/rule-block";
import { Section } from "@/components/section";
import { StampTag } from "@/components/stamp";
import { useRead } from "@/components/use-read";
import { hasContract, readRules } from "@/lib/chain";
import { MAX_MESSAGE, MAX_NAME, MAX_REPLIES, MAX_REPLY, MIN_MESSAGE, MIN_NAME, MIN_REPLY, QUESTION_HONOUR, QUESTION_STALL } from "@/lib/rules";

const th = "border-b border-line px-3 py-2 text-left text-[12px] font-semibold text-ink-3";
const td = "border-b border-line-soft px-3 py-2 align-top text-[13.5px]";

export default function HowPage() {
  const rules = useRead(() => readRules(), ["rules"], { enabled: hasContract() });
  return (
    <Single>
      <p className="mono text-xs text-ink-3">Folder · How it works</p>
      <h1 className="mt-1 text-2xl">How it decides</h1>
      <p className="mt-1 text-[14.5px] text-ink-2">
        One question decides every cancellation, and it is a question about words: does this reply actually cancel, or does it put the member off? The network answers it in the
        same transaction as the reply, and the fee follows the answer.
      </p>

      <Section title="The rule" hint="A constant in the contract, the same for every provider. No provider writes or changes it." className="mt-6">
        <RuleBlock />
      </Section>

      <Section title="Two askings, one block" hint="Every validator asks its own model both questions about the same reply, inside one consensus block.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[8px] border border-line px-3.5 py-3">
            <p className="mono text-[11px] font-bold tracking-[0.08em] text-ink-3">ORDER 1 · RULE, MESSAGE, REPLY</p>
            <p className="mt-1.5 text-[14px]">{QUESTION_HONOUR}</p>
          </div>
          <div className="rounded-[8px] border border-line px-3.5 py-3">
            <p className="mono text-[11px] font-bold tracking-[0.08em] text-ink-3">ORDER 2 · REPLY, MESSAGE, RULE</p>
            <p className="mt-1.5 text-[14px]">{QUESTION_STALL}</p>
          </div>
        </div>
        <p className="mt-3 text-[13.5px] text-ink-2">
          The second question needs the opposite answer, so a model that says yes to everything, or no to everything, lands as unclear, which moves nothing. The member&apos;s
          message and the provider&apos;s reply are untrusted: each sits between delimiter lines tagged with the start of its own sha256, with &lt; and &gt; replaced, and the prompt
          says before them that neither is an instruction. The model never sees an amount, an address, a plan name or a date.
        </p>
      </Section>

      <Section title="The combine table" hint="The contract turns the two answers into one word. That word is what validators compare, by exact equality.">
        <div className="overflow-x-auto rounded-[8px] border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-frame/60">
                <th className={th}>Order 1: honours?</th>
                <th className={th}>Order 2: stalls?</th>
                <th className={th}>Stored</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}>yes</td>
                <td className={td}>no</td>
                <td className={td}>
                  <StampTag kind="honoured" />
                </td>
              </tr>
              <tr>
                <td className={td}>no</td>
                <td className={td}>yes</td>
                <td className={td}>
                  <StampTag kind="stalled" />
                </td>
              </tr>
              <tr>
                <td className={td} colSpan={2}>
                  anything else, an answer it cannot read included
                </td>
                <td className={td}>
                  <StampTag kind="unclear" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13.5px] text-ink-2">
          A validator never agrees with a leader that raised, and one whose own rerun fails disagrees. A round with no majority stores nothing; the reply can be sent again while the
          window is open. A provider gets at most {MAX_REPLIES} replies per cancellation.
        </p>
      </Section>

      <Section title="Where the fee goes" hint="The fee is held for the period; the stamp decides which side it leaves to.">
        <MoneyFlow />
        <div className="mt-4 overflow-x-auto rounded-[8px] border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-frame/60">
                <th className={th}>Moment</th>
                <th className={th}>What moves</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["join", "The member pays exactly the fee; the contract holds it for the period."],
                ["reply, honoured", "Nothing now. The fee stays held for the provider until the period ends."],
                ["reply, stalled", "This period's held fee goes back to the member, in the same transaction. The membership ends."],
                ["reply, unclear", "Nothing. The provider may reply once more before the deadline."],
                ["lapse", "After the deadline with the request still open: the held fee goes back to the member, by rule, no model asked. Anyone may send it."],
                ["collect", "After the period's end with no request open: the held fee goes to the provider. Anyone may send it."],
                ["a refused join", "Everything sent goes back to the sender, in the same transaction."],
              ].map(([when, what]) => (
                <tr key={when}>
                  <td className={`${td} mono whitespace-nowrap`}>{when}</td>
                  <td className={td}>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="The limits, plainly" hint="What the contract does not do, so nobody has to find out the hard way.">
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] text-ink-2">
          <li>Nothing renews on chain. A membership is one period; the next is a new join, sent by the member.</li>
          <li>The contract enforces the reply, not billing elsewhere. An honoured cancellation is a public record; it cannot stop a card being charged somewhere else.</li>
          <li>A stall or a lapse returns the current period&apos;s fee, never more.</li>
          <li>The rule is one rule, written in the contract, not the consumer law of any country. This is not legal advice.</li>
          <li>Someone has to send lapse and collect. Anyone may, and the money goes to the party on the row whoever sends it.</li>
          <li>
            Texts are printable ASCII on one line: names {MIN_NAME} to {MAX_NAME} characters, messages {MIN_MESSAGE} to {MAX_MESSAGE}, replies {MIN_REPLY} to {MAX_REPLY}. Fees are
            0.1 to 100 GEN; a period is 5 minutes to 90 days; a reply window 5 minutes to 14 days.
          </li>
        </ul>
      </Section>

      <Section title="rules(), read live" hint="The contract's own words for all of the above, exactly as it publishes them.">
        {rules.error ? (
          <ReadError detail={rules.error} onRetry={rules.retry} />
        ) : !rules.data ? (
          <Placeholder lines={6} />
        ) : (
          <pre className="mono max-h-[28rem] overflow-auto rounded-[8px] border border-line bg-frame/50 p-3 text-[12px] leading-relaxed break-words whitespace-pre-wrap">
            {JSON.stringify(rules.data, null, 2)}
          </pre>
        )}
      </Section>
    </Single>
  );
}
