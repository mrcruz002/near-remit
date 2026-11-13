# NearRemit

**Send money home, across chains.** A one-page cross-chain remittance demo built for
**NEAR HACKATHON**, track **Real-World Money** (`realworld`).

## The problem

Sending $50 home to Nigeria through a bank or a money-transfer shop costs $5–$15 and
takes hours or days — and that is before the recipient figures out how to turn it into
money they can use. Crypto fixes the speed but not the fragmentation: the sender holds
USDC on Ethereum, the family holds a wallet on Base or NEAR, and moving between the two
means bridges, wrapped tokens, and a wallet the recipient may not have.

## What this is

NearRemit is a single web page. The sender picks a token on the "From" panel
and a token on the "To" panel — any token, any supported chain, from a list
grouped by chain — types the amount in dollars or in the token itself (the
page converts with the token's live price), pastes the recipient's address,
and gets a **live quote from NEAR Intents**. The quote hands back one deposit
address. The sender sends the exact amount to it from any wallet they already
have — no wallet connection, no sign-up, no seed phrase — and NEAR Intents
solvers settle the swap and pay the recipient on the destination chain. The
page then tracks the swap live until it is delivered, refunded, or failed.

Your swap is saved in your browser the moment the deposit address is created
— a refresh restores the route, the amounts, the deposit address and the
tracking, with a “Resumed your swap” notice. A “Track a swap you already
started” box at the top of the page lets you paste any deposit address and
check its status, and the deposit step lets you copy the details or download
a receipt before you send.

The remittance angle is the story; the working swap is the proof.

## NEAR tools used

- **NEAR Intents — 1-Click Swap API** (`https://1click.chaindefuser.com`):
  - `POST /v0/quote` — live quotes (`dry: true` for a free price check,
    `dry: false` to reserve a deposit address)
  - `GET /v0/status?depositAddress=…` — swap status polling
- No 1-Click JWT is used (HACKATHON.md Q-006: not required; without it the API
  applies a 0.2% platform fee, which the quote shows).
- **No testnet exists for NEAR Intents** (HACKATHON.md Q-007), so this is mainnet
  only. The default demo amount is **$1**. The page warns about this at the top
  and never suggests sending more than a few dollars.
- No smart contract of our own, no backend, no wallet library. The page calls the
  public 1-Click API directly from the browser (the API allows cross-origin calls:
  `Access-Control-Allow-Origin: *`, verified 2026-11-13).

## How to run it

```sh
# from this folder — any static server works
python3 -m http.server 8000
# then open http://localhost:8000
```

Or: `npx serve .` — then open the address it prints. No build step, no
dependencies, no environment variables.

## Try it — do X, see Y (for judges)

All quote steps are **free** and move no money. Only step 4 moves real money,
and only the $1 you choose to send.

1. **Open the page.** You see the hero, a mainnet warning, and five steps.
   Do: read the warning. See: the page tells you plainly that this is mainnet
   and to demo with $1.
2. **Step 1 — you send.** The page already shows two panels: “From” USDC on
   Ethereum, “To” USDC on Base, amount **$1** (the $ / token toggle sits above
   the panels — in $ mode you type dollars and the page converts to the token
   amount with the live price; in token mode you type the token amount and it
   shows the dollar value underneath). Tap a token button to open the picker
   — tokens grouped by chain, with live prices — or tap a quick-route chip.
   The ↓ button between the panels swaps the two. Paste any Ethereum address
   you control in “Your address — for refunds” (for example your own wallet
   address).
   Do: click **Continue →**. See: step 2 opens.
3. **Step 2 — they receive.** Paste any Base address in “Recipient address”
   (your own wallet address works for the demo).
   Do: click **Get a quote →**. See: the page asks NEAR Intents for a live
   price (about a second) and shows what you send, what they receive, the
   minimum they get, the rate, the estimated time (~47 seconds for this route),
   and the fees. Nothing has moved.
4. **Step 3 — quote.** Do: click **Create deposit address →**.
   See: a deposit address, the exact amount to send, and a deadline. This is a
   real, reserved deposit address from the live API.
5. **Step 4 — deposit (optional, moves $1 of real money).** Before you send,
   copy the details (**Copy all details**) or download the receipt
   (**Download receipt**) — both hold the deposit address, the exact amount
   and a link to track the swap, so a refresh or a closed tab can never lose
   them. Do: from any wallet, send exactly the amount shown, in the token and
   on the chain shown, to the deposit address. See: the swap starts by itself.
6. **Step 5 — track.** Do: click **Track this swap →**. See: the status moves
   from “Waiting for your deposit” → “Deposit seen” → “Settling” → “Delivered”,
   with links to the origin and destination transactions on their explorers.
   If you skip step 5, you can still check any swap later: paste its deposit
   address in “Track a swap you already started” at the top of the page (or
   “Or check any swap” in step 5) and click **Check status**.
   A ready-made check with no money at all: paste
   `0x1E9fea631b4beE045218F9873523CBC65C5e9942` (a live quote made during
   development, deposit address reserved until 2026-11-16) in the box at the
   top and click **Check status** — you will see `PENDING_DEPOSIT`, because
   nothing was ever sent to it.
7. **Refresh mid-swap — the recovery.** Do: after step 4 (or 5), reload the
   page. See: a “Resumed your swap from before the refresh” notice at the top,
   the deposit address, amounts, route and step all back in place, and — if
   tracking was running — the status polling picks up again on its own.
   Click **Start over — clear saved swap** in the notice to wipe the saved
   swap and reset the page.
8. **Recover with only the address.** Do: in a fresh browser (or after
   “Start over”), paste a deposit address in “Track a swap you already
   started” at the top and click **Check status**. See: the live status for
   that swap, even though the page holds no other state. The receipt
   download prints the same address plus a tracking link
   (`?track=<depositAddress>`) that opens the tracker directly.
9. **Try another token.** Open the “From” or “To” token picker in step 1 and
   choose a different token or chain — for example NEAR on NEAR, or SOL on
   Solana — and repeat. NEAR recipients use an account like `name.near`;
   Ethereum/Base and other EVM recipients use a `0x…` address; Solana
   recipients use a base58 address. The page validates the format for the
   chain you picked. If a pair cannot be priced, the page says so plainly
   (“This pair is not available”) instead of breaking — the quote API is the
   source of truth for which pairs work.

## Verified live (2026-11-13, ~13:08 UTC)

Real calls against the live 1-Click API, no funds moved:

- Dry quote, **$1 USDC (Ethereum) → USDC (Base)**: in `1.0 USDC ($0.9995)`,
  out `0.997398 USDC ($0.9969)`, minimum out `0.987424`, estimated time `47s`,
  HTTP 201 in 0.94s.
- Live quote, same pair: returned deposit address
  `0x1E9fea631b4beE045218F9873523CBC65C5e9942`, deadline
  `2026-11-16T13:38:27Z` (the API sets its own deadline — 3 days — rather than
  the 1 hour requested).
- Status check on that deposit address: `PENDING_DEPOSIT`, with refund/withdraw
  fees as quoted.
- `GET /v0/tokens` returns live prices (wNEAR $3.55, ETH $1,959.45 at the time
  of the check). Routes in the app use asset IDs taken from that live list.

## Verified live — $ / token toggle + two-panel picker (2026-11-13, ~14:40 UTC)

jsdom test against the served page with the real API, 33 checks, all passing,
dry quotes only, no funds moved:

- **$ mode (default):** typing `$2` shows `≈ 2.000958 USDC on Ethereum`
  (USDC live price $0.999531); a dry quote for that pair returns
  `1.99832 USDC ($2.00)` out, and the "To" panel fills in with the quoted
  receive amount.
- **Token mode:** switching converts the input to the token amount
  (`2.000958`); typing `0.5` USDC shows `≈ $0.4998` underneath.
- **Token picker:** the "From" menu opens with 50 tokens in 10 chain groups;
  picking NEAR on NEAR, then USDC on Base, then a dry quote for
  NEAR → USDC on Base ($1) returns `1.001035 USDC ($1.00)`. Search filters
  the list (searching "sol" shows the 4 Solana tokens). The ↓ button swaps
  the two panels. The 7 quick-route chips still work and the default view is
  unchanged (USDC on Ethereum → USDC on Base, $1).
- **Unquotable pair:** BRETT (Base) → GNO (Gnosis) returns `No liquidity
  available` from the API; the page shows "This pair is not available —
  try another token or chain" and nothing breaks. Amount `0` shows the
  validation error. No console errors; the theme toggle still works and
  persists.

## Verified live — refresh recovery (2026-11-13, ~15:00 UTC)

jsdom test against the served page with the real API, 15 checks, all passing
(dry quotes only except one live quote to create a real deposit address —
reserved, expires unused, no funds moved; plus 8 edge-case checks, all
passing):

- **Save:** going through the flow to the deposit step, the live quote
  returned deposit address `0xB739A0BcF6091Cca1bad1cEe9B915683b37118b6`
  (deadline 2026-11-16, 1.000526 USDC on Ethereum) and localStorage held it
  with the route (USDC Eth → USDC Base), the $1 amount, both addresses, the
  quote and step 4. Starting tracking saved the deposit address as the
  tracked swap at step 5.
- **Receipt:** the downloaded receipt is a `.txt` with the deposit address,
  the exact amount and token, the recipient, the deadline and a tracking
  link (`?track=<depositAddress>`).
- **Refresh:** a new page load with the same browser storage showed the
  “Resumed your swap from before the refresh” notice naming the deposit
  address, restored the address, the $1 amount, the route and step 5, and
  tracking resumed on its own — status `Waiting for your deposit`.
- **Lookup:** on a fresh page with no saved state, pasting the known address
  `0x1E9fea631b4beE045218F9873523CBC65C5e9942` in the “Track a swap you
  already started” box at the top showed `PENDING_DEPOSIT`.
- **Start over:** clicking it deleted the saved swap from localStorage; a
  fresh load then showed no banner and opened on step 1.
- **Edge cases:** a saved swap whose deposit address had already expired
  restores with an “expired — do not send to it” warning and does not resume
  polling; opening `?track=<depositAddress>` jumps straight into tracking
  that swap. No console errors in any run.

## Honest limits

- **Mainnet only.** There is no testnet for NEAR Intents, so a full end-to-end
  demo swap costs real money (we verified everything up to the deposit step
  and deliberately did not send a deposit).
- **Saved swaps live only in the browser where they were made**
  (localStorage). If you switch device, change browser, or clear browser
  data, the only recovery is the deposit address itself — that is why the
  deposit step tells you to copy the details or download the receipt
  before you send, and why the receipt prints a `?track=` link.
- **The page does not send the deposit for you.** The user sends it from their
  own wallet. That is by design — the page never touches a key — but it means a
  judge testing the full swap needs $1 and a wallet on the origin chain.
- **Quotes are per-pair.** The picker offers 44 tokens across 10 chains
  (Ethereum, Base, NEAR, Arbitrum, Optimism, BNB Chain, Avalanche, Gnosis,
  Polygon, Solana) — a curated shortlist of the major tokens from the ~230
  the API lists, grouped by chain. Whether a given pair can be priced is up
  to the quote API; if it cannot, the page says so plainly. Adding a token is
  one entry in the `TOKENS` table in `app.js`.
- **A `quoteWaitingTimeMs` quirk:** sending `quoteWaitingTimeMs: 3000` makes
  the quote endpoint hang instead of answering (verified three times,
  2026-11-13). The app omits the field, and quotes then return in ~1s.
  The code comments this where the request is built.
- **Tiny amounts only.** The demo defaults to ~$1. Very small swaps can be
  uneconomic once network fees are counted; the quote shows the real numbers
  before anything is committed.

## Files

- `index.html` — the page (structure + copy)
- `app.js` — all logic: routes, quotes, deposit, status polling
- `styles.css` — monochrome ash/black/white theme, dark by default with a
  light toggle that remembers the choice
- `README.md` — this file
- `LICENSE` — MIT

## Hackathon

- Event: NEAR HACKATHON, 2026-11-01 → 2026-11-14 23:59 UTC
- Track: Real-World Money (`realworld`)
- Rules: https://nearhackathon.com/HACKATHON.md
- This repository was built during the hackathon window. The visual style is
  adapted from an earlier, unrelated community page by the same builder; no
  FLOP code, text, or branding is in this project.

## License

MIT — see `LICENSE`.
