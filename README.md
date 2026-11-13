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

NearRemit is a single web page. The sender picks a route (for example USDC on Ethereum
→ USDC on Base), types an amount, pastes the recipient's address, and gets a **live
quote from NEAR Intents**. The quote hands back one deposit address. The sender sends
the exact amount to it from any wallet they already have — no wallet connection, no
sign-up, no seed phrase — and NEAR Intents solvers settle the swap and pay the
recipient on the destination chain. The page then tracks the swap live until it is
delivered, refunded, or failed.

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
2. **Step 1 — you send.** The route is already “USDC on Ethereum → USDC on
   Base” and the amount is already `1`. Paste any Ethereum address you control
   in “Your address — for refunds” (for example your own wallet address).
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
5. **Step 4 — deposit (optional, moves $1 of real money).** Do: from any wallet,
   send exactly the amount shown, in the token and on the chain shown, to the
   deposit address. See: the swap starts by itself.
6. **Step 5 — track.** Do: click **Track this swap →**. See: the status moves
   from “Waiting for your deposit” → “Deposit seen” → “Settling” → “Delivered”,
   with links to the origin and destination transactions on their explorers.
   If you skip step 5, you can still check any swap later: paste its deposit
   address in “Or check any swap” and click **Check status**.
   A ready-made check with no money at all: paste
   `0x1E9fea631b4beE045218F9873523CBC65C5e9942` (a live quote made during
   development, deposit address reserved until 2026-11-16) and click
   **Check status** — you will see `PENDING_DEPOSIT`, because nothing was ever
   sent to it.
7. **Try another route.** Change the route in step 1 — for example
   “NEAR on NEAR → USDC on Base” — and repeat. NEAR recipients use an account
   like `name.near`; Ethereum/Base recipients use a `0x…` address. The page
   validates the format for the chain you picked.

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

## Honest limits

- **Mainnet only.** There is no testnet for NEAR Intents, so a full end-to-end
  demo swap costs real money (we verified everything up to the deposit step
  and deliberately did not send a deposit).
- **The page does not send the deposit for you.** The user sends it from their
  own wallet. That is by design — the page never touches a key — but it means a
  judge testing the full swap needs $1 and a wallet on the origin chain.
- **Quotes are per-route.** The app offers seven curated routes (USDC/NEAR/ETH
  across Ethereum, Base and NEAR) rather than all 230 tokens the API lists.
  Adding a route is one entry in the `ROUTES` table in `app.js`.
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
