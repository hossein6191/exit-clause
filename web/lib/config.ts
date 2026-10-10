// Site settings. One place for the contract address, the name and the tagline.
//
// DEMO_CONTRACT is the deployed copy the site reads when NEXT_PUBLIC_CONTRACT is unset. It is filled
// in once the contract is deployed; while both are empty every page says the contract is not
// deployed yet, and the whole site still works with NEXT_PUBLIC_MOCK=1.
export const DEMO_CONTRACT: string = "0xc8B97A242cb10c016566572bF8b5BE9b74e81764";

export const SITE_NAME = "Exit Clause";
export const SITE_TAGLINE = "Cancel anytime, enforced.";
export const SITE_LINE =
  "Cancel anytime, enforced: the month's fee is held until the month ends, and a provider whose reply stalls a cancellation gives that month back.";

/** The public source repository; the rail link is hidden while this is empty. */
export const REPO_URL: string = "https://github.com/hossein6191/exit-clause";

/** The contract in use: the deploy's environment first, then the committed address. */
export const contractAddress = (): string => process.env.NEXT_PUBLIC_CONTRACT || DEMO_CONTRACT || "";
