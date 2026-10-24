import "server-only";

const env = (key: string, fallback = "") => process.env[key]?.trim() || fallback;
const num = (key: string, fallback: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && process.env[key] !== "" ? v : fallback;
};

export const config = {
  appUrl: env("APP_URL", "http://localhost:3000"),

  agenticorg: {
    apiKey: env("AGENTICORG_API_KEY"),
    baseUrl: env("AGENTICORG_BASE_URL", "https://agenticorg.hackathon.pinelabs.com"),
    companyId: env("AGENTICORG_COMPANY_ID"),
    merchantId: env("AGENTICORG_MERCHANT_ID", "merchant_demo"),
    // MCP tool names (see `client.mcp.tools()` / GET /api/agenticorg/tools)
    conciergeTool: env("AGENTICORG_CONCIERGE_TOOL", "agenticorg_chat_agent"),
    stylistTool: env("AGENTICORG_STYLIST_TOOL", "agenticorg_product_agent"),
    reconTool: env("AGENTICORG_RECON_TOOL", "agenticorg_recon_agent"),
    orderReviewTool: env("AGENTICORG_ORDER_REVIEW_TOOL", "agenticorg_risk_sentinel"),
    refundReviewTool: env("AGENTICORG_REFUND_REVIEW_TOOL", "agenticorg_complaint_resolution"),
    // Mirror each approval as an AgenticOrg governed case for audit trail
    mirrorCases: env("AGENTICORG_MIRROR_CASES", "false") === "true",
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  pinelabs: {
    clientId: env("PINELABS_CLIENT_ID"),
    clientSecret: env("PINELABS_CLIENT_SECRET"),
    // Hex secret used to verify redirect-callback signatures (from Pine Labs onboarding)
    secretKey: env("PINELABS_SECRET_KEY"),
    // Base64 webhook secret (Pine Labs dashboard → Settings → Webhooks)
    webhookSecret: env("PINELABS_WEBHOOK_SECRET"),
    env: env("PINELABS_ENV", "uat") as "uat" | "prod",
    get baseUrl() {
      return this.env === "prod" ? "https://api.pluralpay.in" : "https://pluraluat.v2.pinepg.in";
    },
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  freeTryOn: {
    // Hugging Face Space running IDM-VTON. HF_TOKEN (free account) raises the GPU quota.
    space: env("FREE_TRYON_SPACE", "yisol/IDM-VTON"),
    hfToken: env("HF_TOKEN"),
    enabled: env("FREE_TRYON_ENABLED", "true") !== "false",
  },

  decart: {
    // Optional: require this code before minting Decart tokens (keeps paid credits for judges/demos)
    accessCode: env("DECART_ACCESS_CODE"),
    apiKey: env("DECART_API_KEY"),
    model: env("DECART_MODEL", "lucy-vton-latest"),
    maxSessionSeconds: num("DECART_MAX_SESSION_SECONDS", 300),
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  payments: {
    /** Live Pine Labs production charges need an explicit opt-in after go-live review. */
    allowLive: env("ALLOW_LIVE_PAYMENTS", "false") === "true",
    /** Demo (mock) checkout: only when Pine Labs isn't configured, and never in production unless opted in. */
    get demo() {
      return !config.pinelabs.enabled && (process.env.NODE_ENV !== "production" || env("DEMO_PAYMENTS") === "true");
    },
  },

  policy: {
    // "always": every order waits for a human; "threshold": only orders >= orderReviewThreshold (or flagged by the agent)
    orderApprovalMode: env("ORDER_APPROVAL_MODE", "always") as "always" | "threshold",
    orderReviewThresholdPaise: num("ORDER_REVIEW_THRESHOLD_PAISE", 500000), // ₹5,000
    refundAutoApproveLimitPaise: num("REFUND_AUTO_APPROVE_LIMIT_PAISE", 0), // 0 = every refund needs a human
    minAgentConfidence: num("MIN_AGENT_CONFIDENCE", 0.8),
  },

  console: {
    user: env("CONSOLE_USER", "admin"),
    password: env("CONSOLE_PASSWORD"),
  },
};

export function integrationStatus() {
  return {
    agenticorg: config.agenticorg.enabled ? "live" : "rules only",
    pinelabs: config.pinelabs.enabled ? (config.pinelabs.env === "prod" ? "production" : "sandbox (UAT)") : config.payments.demo ? "demo" : "off",
    decart: config.decart.enabled ? (config.decart.accessCode ? "live (code)" : "live") : "not configured",
    freeTryOn: config.freeTryOn.enabled ? "free (IDM-VTON)" : "off",
  };
}
