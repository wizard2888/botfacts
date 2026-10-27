# BOTfacts: facts about a token on BOT Chain

Paste a token address and see what can be checked: decimals, total supply, proxy patterns, owner,
verified source, holder concentration, and look-alikes. **Each fact shows its source and when it's
from.** Anyone can freeze a token's answers into an on-chain snapshot, so later changes show.

**Facts only. No scores, no verdicts.** Nothing on the page is rated, ranked, or colored good or bad,
and the test suite fails if verdict words ("safe", "scam", "risk", "score", "rug", "trusted") appear in
the results.

The BOT Chain website (https://www.botchain.ai) and BOT Scan (https://scan.botchain.ai/) are linked in
the header and footer, and the footer links the deployed contract on BOT Scan.

## What each row is

**Read from the chain** (straight from the BOT Chain RPC, all at one pinned block that the page names):
contract code (size and hash); name; symbol; decimals; total supply; `owner()` and `getOwner()`, each
with what kind of address it returned; four proxy storage slots (EIP-1967 implementation, admin and
beacon, and EIP-1822); and whether the code matches the EIP-1167 minimal-proxy pattern.

**From BOT Scan** (a Blockscout explorer): verified-source record, the explorer's own token record,
holder concentration (top 1 / 5 / 10 shares, computed against the chain's total supply), look-alikes,
and an explorer-freshness row comparing the explorer's latest block with the chain's.

**Three possible outcomes for any question**, always stated:
- an answer, with its source;
- **"No answer (reason)"**: the token was asked and didn't answer (reverted, returned nothing, or
  returned something that isn't valid);
- **"Unavailable: reason"**: this page couldn't ask or couldn't get the data (for example BOT Scan blocked
  the browser). An outage is never shown as "no verified source" or "no look-alikes".

**Look-alikes use two plain rules, stated in the row:** the same symbol, or the same name once look-alike
characters (such as a Cyrillic "В" posing as "B") are normalized. A match is a fact about names, nothing more.

## The snapshot contract: `TokenSnapshots.sol`

`snapshot(token, reported)` records, permanently and publicly, two kinds of fact kept strictly apart:

1. **Read by the contract itself** (cannot be faked by whoever takes the snapshot): code hash and size,
   decimals, total supply, and an owner address if the token answers `owner()` or `getOwner()`.
2. **Reported by the snapshot taker** (the contract cannot check these): the explorer facts and proxy
   readings. The contract stores only a hash and emits the text in an event beside the taker's address.
   The page labels it "not verified by the contract", re-checks the hash, and lists any fact the taker
   couldn't get. Treat it as a claim.

`readFacts(token)` is the exact reader `snapshot` uses, so a stored snapshot and the live answers are
always directly comparable. The page does that comparison field by field, saying only "same" or "differs".

Fixed rules: no owner, no admin, no fee, no setter, nothing payable (sending BOT to it reverts). Tests
assert the contract's exact function list, so none of those can be added unnoticed.

**Hostile tokens can't break it.** Each read is capped at 50,000 gas and only a reply of exactly 32 bytes is
accepted. Tests cover tokens that burn all their gas, return huge data, return garbage, revert, or lie
about decimals. The page applies the same strict reading, so the page and a snapshot never disagree.

## Honest limits

- **It reads facts, not logic.** It does not look for mint functions, blacklists, transfer fees, honeypot
  behavior, or locked liquidity. A missing fact is not an all-clear.
- **Owner detection covers only `owner()` and `getOwner()`.** Role-based or other access-control schemes
  aren't detected. "No answer" is not the same as "no owner".
- **Proxy detection covers EIP-1967, EIP-1822 and EIP-1167.** Other proxy designs aren't detected.
- **Holder concentration uses the first page of holders the explorer returns** (its top 50), and the
  explorer's indexed balances.
- **The explorer can lag, and its API can change.** Blockscout's docs say per-instance endpoints are being
  deprecated in favor of its PRO API. The freshness row shows how far behind BOT Scan is. When I fetched the
  BOT Scan homepage while building this, it showed blocks "3y ago" and transactions "4y ago"; that may have
  been a cached copy, but I couldn't confirm from here.
- **Anyone can take misleading snapshots.** The contract reads its own facts honestly, but the "reported"
  part can be anything. Each snapshot shows who took it. Snapshots from different people are independent.
- **Anyone can take unlimited snapshots of any token** (gas only). The page shows the newest 10.

## Configure (top of the `<script>` in `index.html`)

| Constant | Meaning |
|---|---|
| `CONTRACT_ADDRESS` | Paste the deployed `TokenSnapshots` address. Until set, checking a token works fully; only snapshots are disabled. |
| `NETWORK` | `"mainnet"` (BOT Chain, id 677) or `"testnet"` (id 968). |
| `EXPLORER_API` | BOT Scan's address, used for the explorer rows. |
| `DEMO` | Leave `false`. The preview copy sets it to `true` to show demo data. |

## Deploy

```bash
npm install
cp .env.example .env        # add the deployer wallet's private key
npm run compile
npm test                    # 25 tests
npm run deploy:mainnet      # or deploy:testnet; prints the contract address
```

1. Paste the address into `CONTRACT_ADDRESS` in `index.html`.
2. Push the folder to GitHub and import it into Vercel as a static site (no build command, no keys).

**Cost.** Deploying uses about 630k gas. A snapshot uses about 250k to 300k gas (worst case about 455k
with a gas-burning token). `contracts/mocks/` holds test fixtures only and is never deployed.

## Testing notes (what was and wasn't verified)

- **Contract:** 25 tests, including the hostile-token cases and the exact-function-list guard.
- **Logic:** unit tests for look-alike matching (including capital-letter spoofs), holder math, parsing of
  explorer replies (including malformed ones), strict text decoding, and the size cap on the on-chain record.
- **Page, simulated:** every flow clicked through in a headless DOM, including opening snapshots and
  comparing them with the token's answers now.
- **Page, real path:** the real page driven against a real local chain with real tokens: a normal token, an
  EIP-1967 proxy, an EIP-1167 clone, a BNB-style `getOwner()` token, and tokens that revert, answer
  0xFF..FF, burn gas, or return huge data. The explorer was a stand-in serving Blockscout-shaped replies,
  switched to fail four different ways. Snapshots were taken on-chain and "later changes show" was
  confirmed after changing a token's owner and supply.
- **Not verified:** the shape of BOT Scan's real API replies, whether BOT Scan and `rpc.botchain.ai` allow
  calls from a browser, and how the page looks in a real browser or on phones. If BOT Scan blocks browser
  calls, the explorer rows say so and the chain rows are unaffected. If the RPC blocks them, connect a wallet
  to read through it.
- Unaudited.
