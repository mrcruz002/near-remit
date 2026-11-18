# NearRemit

**Send money home, across chains.** A one-page cross-chain remittance
application built as a personal project.

## The problem

Sending $50 home to Nigeria through a bank or a money-transfer service costs
$5–$15 and takes hours or days — and that is before the recipient works out
how to turn it into money they can use. Cryptocurrency solves the speed but
not the fragmentation: the sender holds USDC on Ethereum, the recipient holds
a wallet on Base or NEAR, and moving between the two means bridges, wrapped
tokens, and a wallet the recipient may not have.

## What this is

NearRemit is a single web page. The sender selects a token on the "From"
panel and a token on the "To" panel — any token, any supported chain, from a
list grouped by chain — enters the amount in dollars or in the token itself
(the page converts using the token's live price), pastes the recipient's
address, and receives a live quote from NEAR Intents. The quote returns a
single deposit address. The sender transfers the exact amount to it from any
wallet they already use — no wallet connection, no sign-up, no seed phrase —
and NEAR Intents solvers settle the swap and pay the recipient on the
destination chain. The page then tracks the swap live until it is delivered,
refunded, or failed.

A swap is saved in the browser as soon as the deposit address is created:
a refresh restores the route, the amounts, the deposit address and the
tracking, with a "Resumed your swap" notice. A "Track a swap you already
started" box at the top of the page accepts any deposit address and shows
its status, and the deposit step allows the details to be copied or
downloaded as a receipt before sending.

## NEAR tools used

- **NEAR Intents — 1-Click Swap API** (`https://1click.chaindefuser.com`):
  - `POST /v0/quote` — live quotes (`dry: true` for a free price check,
    `dry: false` to reserve a deposit address)
  - `GET /v0/status?depositAddress=…` — swap status polling
- No 1-Click JWT is used; without it the API applies a 0.2% platform fee,
  which the quote displays.
- **Mainnet only.** No testnet exists for NEAR Intents. The default amount
  is $1, and the page states this plainly at the top.
- No smart contract, no backend, no wallet library. The page calls the
  public 1-Click API directly from the browser (the API permits
  cross-origin calls: `Access-Control-Allow-Origin: *`).

## How to run it

```sh
# from this folder — any static server works
python3 -m http.server 8000
# then open http://localhost:8000
```

Or `npx serve .` — then open the address it prints. No build step, no
dependencies, no environment variables.

## Trying it out

All quote steps are free and move no money. Only the deposit step moves
real money, and only the amount you choose to send.

1. **Open the page.** The hero, a mainnet notice, and five steps are shown.
2. **Step 1 — you send.** Two panels are shown: "From" USDC on Ethereum,
   "To" USDC on Base, amount $1. The $ / token toggle sits above the
   panels: in $ mode you type dollars and the page converts to the token
   amount using the live price; in token mode you type the token amount
   and it shows the dollar value underneath. Tap a token button to open
   the picker — tokens grouped by chain, with live prices — or tap a
   quick-route chip. The ↓ button between the panels swaps the two.
   Paste an Ethereum address you control in "Your address — for refunds".
   Click **Continue →** to open step 2.
3. **Step 2 — they receive.** Paste a Base address in "Recipient address".
   Click **Get a quote →**. NEAR Intents returns a live price (about a
   second) showing what you send, what they receive, the minimum they
   get, the rate, the estimated time (about 47 seconds for this route),
   and the fees. Nothing has moved.
4. **Step 3 — quote.** Click **Create deposit address →**. A deposit
   address, the exact amount to send, and a deadline are shown. This is
   a real, reserved deposit address from the live API.
5. **Step 4 — deposit (optional, moves real money).** Before sending,
   copy the details (**Copy all details**) or download the receipt
   (**Download receipt**) — both hold the deposit address, the exact
   amount and a link to track the swap, so a refresh or a closed tab can
   never lose them. From any wallet, send exactly the amount shown, in
   the token and on the chain shown, to the deposit address. The swap
   starts by itself.
6. **Step 5 — track.** Click **Track this swap →**. The status moves from
   "Waiting for your deposit" → "Deposit seen" → "Settling" → "Delivered",
   with links to the origin and destination transactions on their
   explorers. Any swap can also be checked later by pasting its deposit
   address in "Track a swap you already started" at the top of the page
   (or "Or check any swap" in step 5) and clicking **Check status**.
7. **Refresh mid-swap.** After step 4 or 5, reload the page: a "Resumed
   your swap from before the refresh" notice appears at the top, the
   deposit address, amounts, route and step are all restored, and — if
   tracking was running — status polling resumes on its own. Click
   **Start over — clear saved swap** in the notice to wipe the saved
   swap and reset the page.
8. **Recover with only the address.** In a fresh browser (or after
   "Start over"), paste a deposit address in "Track a swap you already
   started" and click **Check status** to see the live status for that
   swap. The receipt download prints the same address plus a tracking
   link (`?track=<depositAddress>`) that opens the tracker directly.
9. **Try another token.** Open the "From" or "To" token picker in step 1
   and choose a different token or chain — for example NEAR on NEAR, or
   SOL on Solana — and repeat. NEAR recipients use an account like
   `name.near`; Ethereum, Base and other EVM recipients use a `0x…`
   address; Solana recipients use a base58 address. The page validates
   the format for the chain selected. If a pair cannot be priced, the
   page states this plainly ("This pair is not available") instead of
   failing — the quote API is the source of truth for which pairs work.

## Verified behavior

Real calls against the live 1-Click API:

- Dry quote, **$1 USDC (Ethereum) → USDC (Base)**: in `1.0 USDC ($0.9995)`,
  out `0.997398 USDC ($0.9969)`, minimum out `0.987424`, estimated time
  `47s`, HTTP 201 in 0.94s.
- Live quote, same pair: returned deposit address
  `0x1E9fea631b4beE045218F9873523CBC65C5e9942`, deadline
  `2026-11-16T13:38:27Z` (the API sets its own deadline — 3 days — rather
  than the 1 hour requested).
- Status check on that deposit address: `PENDING_DEPOSIT`, with refund and
  withdraw fees as quoted.
- `GET /v0/tokens` returns live prices. Routes in the app use asset IDs
  taken from that live list.
- **$ / token toggle and two-panel picker:** typing `$2` shows
  `≈ 2.000958 USDC on Ethereum`; a dry quote for that pair returns
  `1.99832 USDC ($2.00)` out, and the "To" panel fills in with the quoted
  receive amount. Switching to token mode converts the input to the token
  amount; typing `0.5` USDC shows `≈ $0.4998` underneath. The "From" menu
  opens with 56 tokens in 13 chain groups; search filters the list; the ↓
  button swaps the two panels; the 10 quick-route chips work as expected.
  An unquotable pair (BRETT on Base → GNO on Gnosis) returns `No liquidity
  available` from the API, and the page shows "This pair is not available —
  try another token or chain".
- **Refresh recovery:** going through the flow to the deposit step saves
  the deposit address, route, amounts, addresses, quote and step in the
  browser; a new page load restores them, shows the resume notice, and
  tracking resumes on its own. A saved swap whose deposit address has
  expired restores with an "expired — do not send to it" warning and does
  not resume polling. Opening `?track=<depositAddress>` opens the tracker
  for that swap directly.
- **End-to-end swap:** a $1 USDC (Ethereum) → USDC (Base) swap was
  completed in full, from deposit to delivery.

## Limitations

- **Mainnet only.** There is no testnet for NEAR Intents, so a complete
  end-to-end swap costs real money.
- **Saved swaps live only in the browser where they were made**
  (localStorage). Switching device or browser, or clearing browser data,
  loses the saved state; the only recovery is the deposit address itself —
  which is why the deposit step asks you to copy the details or download
  the receipt before sending, and why the receipt prints a `?track=` link.
- **The page does not send the deposit for you.** The user sends it from
  their own wallet. That is by design — the page never touches a key — but
  it means a full end-to-end swap requires funds and a wallet on the
  origin chain.
- **Quotes are per-pair.** The picker offers 56 tokens across 13 chains
  (Ethereum, Base, NEAR, Arbitrum, Optimism, BNB Chain, Avalanche, Gnosis,
  Polygon, Solana, Robinhood, Bitcoin, Zcash) — a curated shortlist of the major tokens from the ~230
  the API lists, grouped by chain. Whether a given pair can be priced is
  up to the quote API; if it cannot, the page says so plainly. Adding a
  token is one entry in the `TOKENS` table in `app.js`.
- **A `quoteWaitingTimeMs` quirk:** sending `quoteWaitingTimeMs: 3000`
  makes the quote endpoint hang instead of answering. The app omits the
  field, and quotes then return in about a second. The code comments this
  where the request is built.
- **Small amounts.** The demo defaults to $1. Very small swaps can be
  uneconomic once network fees are counted; the quote shows the real
  numbers before anything is committed.

## Files

- `index.html` — the page (structure + copy)
- `app.js` — all logic: routes, quotes, deposit, status polling
- `styles.css` — monochrome ash/black/white theme, dark by default with a
  light toggle that remembers the choice
- `README.md` — this file
- `LICENSE` — MIT

## License

MIT — see `LICENSE`.
