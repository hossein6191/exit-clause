// One-click suggestions for every field a visitor types into, so nothing on the site needs typing.
// Every value here is inside the contract's limits; tests/unit/suggestions.test.mjs checks each one
// against lib/rules.ts.

const GEN = 10n ** 18n;

export type Chip<T> = { label: string; value: T };

/** Plan names a provider can pick (none of them is a demo plan's name). */
export const NAME_CHIPS: string[] = [
  "Riverside Climbing, monthly",
  "Daily Grind coffee club",
  "Pocket Chef recipes, trial",
  "Northgate Swim, family",
  "Paperleaf book box",
  "Stillwater Yoga, unlimited",
  "Brightline Cloud 2 TB",
  "Fixit Home Cover",
];

export const FEE_CHIPS: Chip<bigint>[] = [
  { label: "0.1 GEN", value: GEN / 10n },
  { label: "0.25 GEN", value: GEN / 4n },
  { label: "0.5 GEN", value: GEN / 2n },
  { label: "1 GEN", value: GEN },
];

/** Periods, from 5 minutes (the contract's least) to 30 days. */
export const PERIOD_CHIPS: Chip<number>[] = [
  { label: "5 min", value: 300 },
  { label: "15 min", value: 900 },
  { label: "1 h", value: 3600 },
  { label: "1 day", value: 86400 },
  { label: "7 days", value: 7 * 86400 },
  { label: "30 days", value: 30 * 86400 },
];

/** Reply windows, from 5 minutes (the contract's least) to 3 days. */
export const WINDOW_CHIPS: Chip<number>[] = [
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "30 min", value: 1800 },
  { label: "1 h", value: 3600 },
  { label: "1 day", value: 86400 },
  { label: "3 days", value: 3 * 86400 },
];

/** A member's cancellation message, six ways a real person writes one. */
export const MESSAGE_CHIPS: Chip<string>[] = [
  { label: "Plain request", value: "Please cancel my membership at the end of this period. Thank you." },
  { label: "Moving away", value: "I would like to cancel my subscription, please. I am moving to another city next month." },
  { label: "No longer used", value: "Please cancel my plan. I no longer use it and do not want to be charged again." },
  { label: "No offers, please", value: "Cancel my membership, please. I do not want a discount or a call, just the cancellation." },
  { label: "Confirm in writing", value: "Hello, I am writing to cancel my subscription. Please confirm in writing that it has ended." },
  { label: "Cutting costs", value: "Please stop my plan when this period ends. Money is tight at the moment and I need to cut costs." },
];

/** A provider's reply, one of each kind the rule tells apart. */
export const REPLY_CHIPS: (Chip<string> & { kind: "honour" | "call" | "offer" | "vague" })[] = [
  {
    label: "Honour it",
    kind: "honour",
    value: "Your membership is cancelled as you asked. It ends at the end of the current period and no further payments will be taken. Nothing else is needed from you.",
  },
  {
    label: "Please call us",
    kind: "call",
    value: "We're sorry to see you go! To cancel, please call our member line on weekdays between 9 and 5 so we can confirm your identity.",
  },
  {
    label: "Discount first",
    kind: "offer",
    value: "Before we process this, we would like to offer you 50% off for the next three months. Please reply to tell us whether you accept the offer or still want to cancel.",
  },
  {
    label: "We noted it",
    kind: "vague",
    value: "Thank you for your message. We have noted your feedback and passed it on to the relevant team.",
  },
];
