# TryOn AI

Live AI virtual try-on with an AgenticOrg stylist team, human review, and Pine Labs checkout.

- **Two try-on engines** in one Live Mirror that stays open while you browse:
  - **Photo AI (free, default):** [IDM-VTON](https://huggingface.co/spaces/yisol/IDM-VTON) on Hugging Face ZeroGPU. Take or upload one photo, then tap Try on anywhere; each look renders in about 15–40 s.
  - **Live AI (paid):** Decart Lucy VTON, real-time video. Set `DECART_ACCESS_CODE` to reserve it (for example for judges).
- **AgenticOrg**: five agent units that *recommend*. People approve stylist advice, orders and refunds.
- **Pine Labs Online**: hosted checkout, callbacks, webhooks and refunds, all verified server-side.

## Quick start

Requires Node 22.5+ (uses the built-in `node:sqlite`).

```bash
cd web
npm install
cp .env.example .env.local      # then set CONSOLE_PASSWORD at minimum
npm run dev                     # http://localhost:3000
```

```bash
npm run check                   # typecheck + lint + tests
npm run build
```

The camera needs `localhost` or HTTPS. For phones, use `npx next dev --experimental-https` or a tunnel, and set `APP_URL` to that origin. Decart tokens are origin-scoped.

## What runs without credentials

| Piece | No credentials | With credentials |
|---|---|---|
| Photo AI (IDM-VTON) | Works with no key (shared free GPU quota) | `HF_TOKEN` (free HF account) raises the quota |
| Decart Live AI | Shows a notice; Photo AI is the default | Live session via short-lived tokens; `DECART_ACCESS_CODE` gates who can start one |
| AgenticOrg | Rule-based checks; **every** decision goes to a human; the Concierge matches from the catalog | Agents called over MCP; runs logged in Console → AgenticOrg agents |
| Pine Labs | **Demo checkout**: orders are flagged `demo`, nothing is charged, and it's disabled in production builds | UAT sandbox (`PINELABS_ENV=uat`) |
| Console | Locked until `CONSOLE_PASSWORD` is set | Basic auth on `/console` and `/api/ops/*` |

## Architecture

```
Shopper browser
 ├─ Studio ── camera ──WebRTC──► Decart Lucy VTON ──► transformed video
 │     └─ token: POST /api/decart/token (60 s, model + origin scoped, max session length)
 ├─ AI Stylist chat ─► /api/concierge ─► AgenticOrg MCP (advice only, grounded in the catalog)
 ├─ Ask a stylist ──► /api/stylist ─► Fit Advisor agent ─► review queue ─► human stylist
 └─ Checkout ───────► /api/orders  ─► Order Guardian agent ─► review queue ─► human approves
                                                         └► Pine Labs hosted checkout
 Pine Labs ─ callback ─► /api/payments/pinelabs/callback ┐ signature check, then a server-to-server
           ─ webhook ──► /api/payments/pinelabs/webhook  ┘ GET order: verify reference/amount/currency/status
 Refund ─► Returns Desk agent ─► human ─► POST /refunds (idempotent) ─► pending ─► PROCESSED (confirmed) ─► refunded
 Ops ─► /console: review queue · AgenticOrg agents (kill switches, run log) · reconciliation · orders (retries)
```

Human review never sits inside the real-time video loop: Decart streams continuously, and stylist reviews are asynchronous.

| Area | Files |
|---|---|
| Decart session (connect, `set()` garment swap, limits, cleanup) | `src/hooks/useDecartTryOn.ts`, `src/app/api/decart/token/route.ts` |
| Free photo try-on | `src/hooks/usePhotoTryOn.ts`, `src/lib/freeTryOn.ts`, `src/app/api/tryon/free/route.ts` |
| Live Mirror (shared across pages) | `src/components/tryon/*` |
| AgenticOrg units, logging, kill switches | `src/lib/agenticorg.ts`, `src/lib/agents.ts` |
| Approval gates and state machine | `src/lib/workflow.ts` |
| Payment rules (pure, unit-tested) | `src/lib/payment-rules.ts` |
| Pine Labs client | `src/lib/pinelabs.ts` |
| Durable storage (SQLite, WAL, transactions) | `src/lib/store.ts` |
| Ownership, CSRF and rate limits | `src/lib/access.ts`, `src/proxy.ts` |
| UI | `src/components/*`, `src/app/*` |

## Payment rules

- Only `PROCESSED` counts as paid. `AUTHORIZED`, `PENDING` and `ATTEMPTED` mean `payment_pending`, because funds are held but not captured. Checkout uses `pre_auth: false`.
- Every status change comes from a server-side `GET /api/pay/v1/orders/{id}`. The merchant reference, amount and currency must match, or the order becomes `payment_mismatch` for ops.
- Transitions only move forward and are idempotent, so duplicate or late callbacks and webhooks are harmless. Webhook ids are deduplicated *after* successful processing, so failed deliveries are retried.
- Each checkout attempt gets a unique reference (`<order>-<n>`). A short claim lock stops concurrent requests from creating two checkouts.
- Refunds use a fixed idempotency reference (`<order>-refund-<n>`). If submission fails, the refund becomes `submit_failed` and can be retried from the console. An accepted submission is only `pending`; `refunded` requires Pine Labs to report `PROCESSED`.
- Production charges need both `PINELABS_ENV=prod` and `ALLOW_LIVE_PAYMENTS=true`. Demo checkout can never touch a live order.

## Human-in-the-loop rules

- In `ORDER_APPROVAL_MODE=always` (the default), every order waits for a person.
- In `threshold` mode, an order is auto-approved only when **all** of these hold: AgenticOrg actually answered (no fallback), it says `approve`, confidence ≥ `MIN_AGENT_CONFIDENCE`, it raised no flags, there was no HITL trigger, and the amount is below the threshold.
- Agent errors, timeouts, unparseable output or a disabled unit always route to a human.
- Shoppers only see stylist advice after a stylist sends it. Snapshots are shared only when the shopper ticks consent.

## Privacy

- **Live AI try-on** streams camera video to Decart to generate the result. TryOn AI doesn't record it.
- **Photo AI** sends the shopper's photo to Hugging Face (IDM-VTON) for that one request. TryOn AI doesn't store it.
- **Stylist snapshots** are one still frame, sent only with explicit opt-in.
- Orders and stylist requests are bound to the browser that created them, through an httpOnly cookie holding a random token. The server stores only its hash.

## Verification status

| Integration | Verified how |
|---|---|
| Payment state machine, approval gates, duplicates, retries | 28 unit/integration tests (`npm test`) against a real SQLite DB, with Pine Labs and AgenticOrg mocked |
| Shopper flow in a browser | Exercised locally in **demo** mode: order → human approval → demo pay → refund request → approval → settle |
| Console auth and order ownership | Checked locally (401 without credentials, 404 for a foreign order) |
| Pine Labs UAT | **Not run yet.** Code follows the published docs (token, hosted checkout, GET order, refunds, webhook HMAC) but needs credentials |
| Free photo try-on (IDM-VTON) | **Verified live**: real requests through `/api/tryon/free` returned photoreal results in about 16–21 s |
| Decart | **Not run yet.** Code follows `@decartai/sdk@0.2.8` types and the official docs, and needs `DECART_API_KEY` plus a real camera |
| AgenticOrg (hackathon host) | **Verified live** on `agenticorg.hackathon.pinelabs.com`: chat_agent, product_agent, risk_sentinel, complaint_resolution and recon_agent all answer in about 2–3 s, and their confidence and "needs a human" signals feed the review queue |
| AI Stylist photo upload | **Verified in the browser**: colours are read on the device and AgenticOrg recommends complementary pieces |

## Remaining setup

1. **Decart**: add `DECART_API_KEY`, open the studio, and choose *Live AI try-on*. Try on real garment photos: the bundled samples are illustrations, and Decart quality depends heavily on the reference image.
2. **AgenticOrg**: add `AGENTICORG_API_KEY` (MCP scope) and `AGENTICORG_COMPANY_ID`. Open `/api/ops/tools` to confirm which tools your key can call, and set the `AGENTICORG_*_TOOL` values.
3. **Pine Labs UAT**: add the client id/secret, `PINELABS_SECRET_KEY` and `PINELABS_WEBHOOK_SECRET`. Set `APP_URL` to a public HTTPS URL (a tunnel works), and register `APP_URL/api/payments/pinelabs/webhook` in the dashboard. Run an order with a UAT test card, then a refund. Confirm the callback signature field set with your Pine Labs integration manager, because the docs are ambiguous on whether the secret is appended.
4. **Before going live**: move storage to Postgres if you run more than one instance, replace basic auth with SSO, move rate limits to Redis, then set `PINELABS_ENV=prod` and `ALLOW_LIVE_PAYMENTS=true`.

## Photos

The sample catalog uses free-licence photos from [Unsplash](https://unsplash.com/license), stored in `public/products/`. To use your own, replace the files or edit the `product`/`model` slugs in `src/lib/catalog.ts`. For the best try-on results, give each product a garment-only shot on a plain background.

## AI Stylist photo upload

Shoppers can attach a photo of their outfit in the AI Stylist. The browser reads the outfit's main colours and their warm/cool and light/dark balance (`src/lib/photoStyle.ts`). Only that small colour profile, never the image, goes to AgenticOrg, which recommends pieces that pair with the look. "Try on me" then reuses the same photo in the free Photo AI try-on.
