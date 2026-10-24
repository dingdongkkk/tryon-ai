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
    baseUrl: env("AGENTICORG_BASE_URL", "https://app.agenticorg.ai"),
    companyId: env("AGENTICORG_COMPANY_ID"),
    merchantId: env("AGENTICORG_MERCHANT_ID", "merchant_demo"),
    // MCP tool names (see `client.mcp.tools()` / GET /api/agenticorg/tools)
    stylistTool: env("AGENTICORG_STYLIST_TOOL", "agenticorg_commerce_sales_agent"),
    orderReviewTool: env("AGENTICORG_ORDER_REVIEW_TOOL", "agenticorg_commerce_sales_agent"),
    refundReviewTool: env("AGENTICORG_REFUND_REVIEW_TOOL", "agenticorg_ar_collections"),
    // Mirror each approval as an AgenticOrg governed case for audit trail
    mirrorCases: env("AGENTICORG_MIRROR_CASES", "false") === "true",
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  pinelabs: {
    clientId: env("PINELABS_CLIENT_ID"),
    clientSecret: env("PINELABS_CLIENT_SECRET"),
    // Hex secret used to verify callback signatures (from Pine Labs onboarding)
    secretKey: env("PINELABS_SECRET_KEY"),
    env: env("PINELABS_ENV", "uat") as "uat" | "prod",
    get baseUrl() {
      return this.env === "prod" ? "https://api.pluralpay.in" : "https://pluraluat.v2.pinepg.in";
    },
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  shift4shop: {
    // 3dcart / Shift4Shop REST API
    baseUrl: env("SHIFT4SHOP_API_URL", "https://apirest.3dcart.com/3dCartWebAPI/v1"),
    secureUrl: env("SHIFT4SHOP_SECURE_URL"),
    privateKey: env("SHIFT4SHOP_PRIVATE_KEY"),
    token: env("SHIFT4SHOP_TOKEN"),
    get enabled() {
      return Boolean(this.secureUrl && this.privateKey && this.token);
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
    agenticorg: config.agenticorg.enabled ? "live" : "mock",
    pinelabs: config.pinelabs.enabled ? `live (${config.pinelabs.env})` : "mock",
    shift4shop: config.shift4shop.enabled ? "live" : "mock",
  };
}
