# Wearable: live virtual try-on

Real-time, in-browser virtual try-on with an AgenticOrg human-in-the-loop, a Pine Labs payment flow, and a 3dcart (Shift4Shop) catalog and orders.

## Run it

```bash
cp .env.example .env.local   # fill in what you have; blanks run in mock mode
npm install
npm run dev
```

Open http://localhost:3000. The camera needs `localhost` or HTTPS. To test on a phone, use `npx next dev --experimental-https`, or tunnel with ngrok or Cloudflare.

## How it fits together

```
Browser (camera never leaves the device)
  MediaPipe PoseLandmarker ─► shoulder/hip anchors ─► affine-warped garment on <canvas>
                           └► world landmarks ─► shoulder/torso cm ─► size suggestion
        │
        ├─ "Ask a stylist" ──► /api/stylist ──► AgenticOrg agent (MCP) drafts fit advice
        │                                        └► approval queue ──► human stylist in /console
        │
        └─ Checkout ──► /api/orders ── prices re-read from 3dcart
                          ├► AgenticOrg agent reviews order (risk, flags, confidence)
                          ├► approval queue ──► human approves in /console
                          ├► 3dcart: POST /Orders
                          └► Pine Labs: token ─► POST /api/checkout/v1/orders ─► redirect_url
                                 │
                 shopper pays ◄──┘
                                 └► /api/payments/pinelabs/callback (signature check + re-fetch status)
                                    /api/payments/pinelabs/webhook  (re-fetch status)
                                    ──► order paid, 3dcart status → Processing

  Refund request ──► AgenticOrg review ──► human approval ──► Pine Labs POST /api/pay/v1/refunds/{order_id}
```

| Piece | File |
|---|---|
| Live try-on (pose, overlay, sizing) | `src/components/TryOnStudio.tsx`, `src/lib/tryon.ts` |
| AgenticOrg agents via MCP | `src/lib/agenticorg.ts` |
| Workflow and approval policy | `src/lib/workflow.ts`, `src/lib/config.ts` |
| Pine Labs | `src/lib/pinelabs.ts`, `src/app/api/payments/pinelabs/*` |
| 3dcart / Shift4Shop | `src/lib/shift4shop.ts` |
| Human-in-the-loop console | `src/app/console/page.tsx` (basic auth via `src/proxy.ts`) |
| Storage (local JSON; swap for Postgres) | `src/lib/store.ts` → `.data/db.json` |

## Integrations

**AgenticOrg.** Agents are called as MCP tools (`client.mcp.call(tool, { inputs })` → `POST /api/v1/mcp/call`). To see the tools your key can use, open `/api/agenticorg/tools`, then set `AGENTICORG_*_TOOL`. Agents only *recommend*. Every money-moving step waits for a human decision in `/console`, or passes the auto-approve policy in `.env`. Set `AGENTICORG_MIRROR_CASES=true` to also file each approval as an AgenticOrg governed case for audit.

The repo also registers the AgenticOrg MCP server for Claude Code in `../.mcp.json`. Export `AGENTICORG_API_KEY` in your shell before starting Claude Code.

**Pine Labs.** Uses UAT by default (`PINELABS_ENV=uat`). Register `APP_URL/api/payments/pinelabs/webhook` in the Pine Labs dashboard. Payment status is never taken from the browser: callbacks are signature-checked, then re-fetched server-to-server. Confirm the callback signature field set with your Pine Labs integration manager.

**3dcart / Shift4Shop.** Needs a dev-portal app (private key) plus a merchant token. For the best overlay, put a transparent PNG of the garment front in the product's `ExtraField1`, and `top`, `outerwear` or `dress` in `ExtraField2`. Otherwise the main product photo is used.

## Before production

- Replace the JSON store with a real database.
- Put real auth on `/console` (SSO) and on order lookups, which currently work for anyone with the unguessable order id.
- Garment overlay is 2D. For photoreal results, add a generative try-on render step that produces HD stills from the snapshot.
