import "server-only";
import crypto from "node:crypto";
import { loadRuntimeConfig, type WhatsAppRuntimeConfig } from "./config";

/**
 * Thin typed wrapper around the WhatsApp Business Cloud (Graph) API. The
 * only side-effect is the network call; storing / reading state belongs in
 * the route handlers so this module stays pure.
 */

const GRAPH_ROOT = "https://graph.facebook.com";

export interface SendTextArgs {
  to: string; // E.164 digits, no "+"
  text: string;
  previewUrl?: boolean;
}

export interface SendTemplateArgs {
  to: string;
  templateName: string;
  language?: string;
  components?: unknown[]; // Meta template components array
}

export interface GraphSendResponse {
  messaging_product: "whatsapp";
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
}

export interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class WhatsAppApiError extends Error {
  /** Cross-module brand — `instanceof` is unreliable across HMR boundaries. */
  readonly isWhatsAppApiError = true as const;
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;

  constructor(status: number, body: MetaErrorBody | string) {
    const err = typeof body === "string" ? undefined : body.error;
    super(err?.message ?? (typeof body === "string" ? body : "WhatsApp API error"));
    this.name = "WhatsAppApiError";
    this.status = status;
    this.code = err?.code;
    this.subcode = err?.error_subcode;
    this.fbtraceId = err?.fbtrace_id;
  }
}

/** HMR-safe check. Prefer this over `instanceof WhatsAppApiError`. */
export function isWhatsAppApiError(e: unknown): e is WhatsAppApiError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { isWhatsAppApiError?: boolean }).isWhatsAppApiError === true
  );
}

/**
 * Meta requires `appsecret_proof = HMAC-SHA256(access_token, app_secret)` as
 * hex on every request when the app has the "Require App Secret" setting
 * enabled. We always send it when app_secret is configured — it's harmless
 * otherwise and fixes the OAuthException "Unsupported state or unable to
 * authenticate data" (code 1).
 */
function buildAppSecretProof(accessToken: string, appSecret: string): string {
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

function appendQuery(url: string, key: string, value: string): string {
  return url.includes("?")
    ? `${url}&${key}=${encodeURIComponent(value)}`
    : `${url}?${key}=${encodeURIComponent(value)}`;
}

async function graphFetch(
  cfg: WhatsAppRuntimeConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let url = `${GRAPH_ROOT}/${cfg.apiVersion}${path}`;
  if (cfg.appSecret) {
    url = appendQuery(
      url,
      "appsecret_proof",
      buildAppSecretProof(cfg.accessToken, cfg.appSecret),
    );
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${cfg.accessToken}`);
  // Only force JSON when caller passed a *string* body. For FormData /
  // Blob / Uint8Array bodies the platform sets the correct multipart
  // boundary or octet-stream automatically — overriding it breaks the
  // request.
  if (
    init.body &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, headers });
}

async function graphJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const parsed = text ? (safeParse(text) as T | MetaErrorBody) : (null as unknown as T);
  if (!res.ok) {
    throw new WhatsAppApiError(res.status, (parsed as MetaErrorBody) ?? text);
  }
  return parsed as T;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s };
  }
}

// ───────────────────────────── Outbound sends ─────────────────────────────

export async function sendText(args: SendTextArgs): Promise<GraphSendResponse> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.to,
      type: "text",
      text: {
        body: args.text,
        preview_url: args.previewUrl ?? false,
      },
    }),
  });
  return graphJson<GraphSendResponse>(res);
}

export async function sendTemplate(args: SendTemplateArgs): Promise<GraphSendResponse> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: args.to,
      type: "template",
      template: {
        name: args.templateName,
        language: { code: args.language ?? "ar" },
        ...(args.components && args.components.length > 0
          ? { components: args.components }
          : {}),
      },
    }),
  });
  return graphJson<GraphSendResponse>(res);
}

/**
 * Send a stand-alone document (PDF / file). Used by booking-confirmation
 * helper to follow up a template with the contract attachment when the
 * template itself can't carry a DOCUMENT header.
 */
export async function sendDocument(args: {
  to: string;
  /** Either `mediaId` (preferred) or `url` must be supplied. */
  mediaId?: string;
  url?: string;
  fileName: string;
  caption?: string;
}): Promise<GraphSendResponse> {
  const cfg = await loadRuntimeConfig();
  if (!args.mediaId && !args.url) {
    throw new Error("sendDocument: يجب توفير mediaId أو url");
  }
  const document: Record<string, string> = { filename: args.fileName };
  if (args.mediaId) document.id = args.mediaId;
  else document.link = args.url!;
  if (args.caption) document.caption = args.caption;

  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.to,
      type: "document",
      document,
    }),
  });
  return graphJson<GraphSendResponse>(res);
}

// ─────────────────────── Interactive (buttons / list) ──────────────────────
//
// Used by the AI Concierge bot (and by the rule-based fallback engine) to
// drive a deterministic dialog when the LLM is off / unavailable. Both the
// button-reply and the list-reply payloads come back through the webhook as
// `type: "interactive"` and are parsed in `extractInboundContent`.

export interface InteractiveButton {
  /** Stable id that comes back in the webhook reply payload (≤ 256 chars). */
  id: string;
  /** Visible label on the chip (≤ 20 chars per Meta spec). */
  title: string;
}

export interface InteractiveListRow {
  id: string;
  title: string;       // ≤ 24 chars
  description?: string; // ≤ 72 chars
}

export interface InteractiveListSection {
  title?: string;
  rows: InteractiveListRow[];
}

export interface SendInteractiveButtonsArgs {
  to: string;
  bodyText: string;
  buttons: InteractiveButton[]; // 1–3 buttons
  headerText?: string;          // optional plain-text header
  /**
   * Optional image header — overrides headerText when both are passed.
   * Must be a publicly-reachable HTTPS URL (Meta downloads it server-side
   * to render in the bubble). Use for room previews, contract previews, etc.
   */
  headerImageUrl?: string;
  footerText?: string;
}

export async function sendInteractiveButtons(
  args: SendInteractiveButtonsArgs,
): Promise<GraphSendResponse> {
  const cfg = await loadRuntimeConfig();
  if (args.buttons.length < 1 || args.buttons.length > 3) {
    throw new Error("sendInteractiveButtons: WhatsApp allows 1–3 buttons");
  }
  const interactive: Record<string, unknown> = {
    type: "button",
    body: { text: args.bodyText },
    action: {
      buttons: args.buttons.map((b) => ({
        type: "reply",
        reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
      })),
    },
  };
  if (args.headerImageUrl) {
    interactive.header = {
      type: "image",
      image: { link: args.headerImageUrl },
    };
  } else if (args.headerText) {
    interactive.header = { type: "text", text: args.headerText.slice(0, 60) };
  }
  if (args.footerText) {
    interactive.footer = { text: args.footerText.slice(0, 60) };
  }

  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.to,
      type: "interactive",
      interactive,
    }),
  });
  return graphJson<GraphSendResponse>(res);
}

export interface SendInteractiveListArgs {
  to: string;
  bodyText: string;
  buttonText: string; // text on the "open list" CTA (≤ 20 chars)
  sections: InteractiveListSection[]; // up to 10 sections, 10 rows total
  headerText?: string;
  footerText?: string;
}

export async function sendInteractiveList(
  args: SendInteractiveListArgs,
): Promise<GraphSendResponse> {
  const cfg = await loadRuntimeConfig();
  const totalRows = args.sections.reduce((n, s) => n + s.rows.length, 0);
  if (totalRows < 1 || totalRows > 10) {
    throw new Error("sendInteractiveList: WhatsApp allows 1–10 rows total");
  }
  const interactive: Record<string, unknown> = {
    type: "list",
    body: { text: args.bodyText },
    action: {
      button: args.buttonText.slice(0, 20),
      sections: args.sections.map((s) => ({
        ...(s.title ? { title: s.title.slice(0, 24) } : {}),
        rows: s.rows.map((r) => ({
          id: r.id.slice(0, 200),
          title: r.title.slice(0, 24),
          ...(r.description ? { description: r.description.slice(0, 72) } : {}),
        })),
      })),
    },
  };
  if (args.headerText) {
    interactive.header = { type: "text", text: args.headerText.slice(0, 60) };
  }
  if (args.footerText) {
    interactive.footer = { text: args.footerText.slice(0, 60) };
  }

  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.to,
      type: "interactive",
      interactive,
    }),
  });
  return graphJson<GraphSendResponse>(res);
}

// ─────────────────────────── Media uploads ───────────────────────────────

/**
 * Upload a file to Meta's *Resumable Upload API* and return the opaque
 * `handle` (e.g. `4::aXOM…`) required by the template-creation endpoint
 * when a template's HEADER format is IMAGE / VIDEO / DOCUMENT.
 *
 * This is a two-step ritual:
 *   1. POST /{APP_ID}/uploads?file_length=N&file_type=mime → { id: "upload:..." }
 *   2. POST /{id} with raw bytes + `file_offset: 0` → { h: "<handle>" }
 *
 * The handle expires when the template is approved or 30 days later.
 * It is *not* the same as a media_id; that one is for sending messages
 * and is produced by `uploadPhoneMedia()` below.
 */
export async function uploadResumableMedia(args: {
  fileBuffer: Buffer | Uint8Array;
  mimeType: string;
  fileName?: string;
}): Promise<{ handle: string }> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.appId) {
    throw new Error(
      "META_APP_ID مفقود — لا يمكن استخدام Resumable Upload API بدونه. أضِف App ID من إعدادات WhatsApp.",
    );
  }

  const fileLength = args.fileBuffer.byteLength;

  // Step 1 — open upload session.
  const sessionUrl =
    `${GRAPH_ROOT}/${cfg.apiVersion}/${cfg.appId}/uploads` +
    `?file_length=${fileLength}` +
    `&file_type=${encodeURIComponent(args.mimeType)}` +
    (args.fileName
      ? `&file_name=${encodeURIComponent(args.fileName)}`
      : "");
  const openRes = await fetch(sessionUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
  });
  const openJson = (await openRes.json()) as { id?: string } & MetaErrorBody;
  if (!openRes.ok || !openJson.id) {
    throw new WhatsAppApiError(openRes.status, openJson);
  }

  // Step 2 — stream bytes into the session.
  // Meta requires the `OAuth ` prefix here (not `Bearer`).
  const uploadRes = await fetch(`${GRAPH_ROOT}/${cfg.apiVersion}/${openJson.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${cfg.accessToken}`,
      file_offset: "0",
    },
    body: args.fileBuffer as unknown as BodyInit,
  });
  const uploadJson = (await uploadRes.json()) as { h?: string } & MetaErrorBody;
  if (!uploadRes.ok || !uploadJson.h) {
    throw new WhatsAppApiError(uploadRes.status, uploadJson);
  }
  return { handle: uploadJson.h };
}

/**
 * Upload a file to the phone-number's media bucket so it can be referenced
 * by `id` when sending messages or template parameters with media.
 *
 * Returns a `media_id` (numeric string). Media IDs expire 30 days after
 * upload — re-upload before sending if the file has been sitting around.
 *
 * Use this for *send-time* media (booking confirmation PDFs, etc.). For
 * the sample attached to a template definition, use `uploadResumableMedia`.
 */
export async function uploadPhoneMedia(args: {
  fileBuffer: Buffer | Uint8Array;
  mimeType: string;
  fileName?: string;
}): Promise<{ id: string }> {
  const cfg = await loadRuntimeConfig();

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", args.mimeType);
  // The Blob constructor in Node 20+ accepts ArrayBuffer/Uint8Array directly.
  // Coerce Buffer → Uint8Array so Blob doesn't choke on Node Buffer's extra props.
  // Copy bytes into a fresh, definitely-non-shared ArrayBuffer so the Blob
  // constructor in TS lib.dom is happy. (Node's Buffer can be backed by a
  // SharedArrayBuffer in some contexts, which the global Blob type rejects.)
  const sourceView =
    args.fileBuffer instanceof Uint8Array
      ? args.fileBuffer
      : new Uint8Array(args.fileBuffer);
  const ab = new ArrayBuffer(sourceView.byteLength);
  new Uint8Array(ab).set(sourceView);
  form.append(
    "file",
    new Blob([ab], { type: args.mimeType }),
    args.fileName ?? "upload",
  );

  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/media`, {
    method: "POST",
    body: form,
    // graphFetch will set Authorization. Don't override Content-Type — the
    // platform sets a proper multipart boundary automatically when body is
    // a FormData instance.
  });
  return graphJson<{ id: string }>(res);
}

// ─────────────────────────── Templates catalogue ──────────────────────────

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string; // APPROVED | PENDING | REJECTED | PAUSED | DISABLED
  components?: unknown[];
  rejected_reason?: string;
}

export interface MetaTemplatesResponse {
  data: MetaTemplate[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

/** Fetch the first page of message templates for the WABA. */
export async function listTemplates(): Promise<MetaTemplate[]> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) {
    throw new Error("WABA ID غير مُعرَّف في الإعدادات.");
  }
  const res = await graphFetch(
    cfg,
    `/${cfg.wabaId}/message_templates?limit=100&fields=id,name,language,category,status,components,rejected_reason`,
  );
  const data = await graphJson<MetaTemplatesResponse>(res);
  return data.data ?? [];
}

// ───────────────────── Analytics: conversations + cost ────────────────────

/**
 * One row inside Meta's `conversation_analytics` payload. Meta groups data
 * by the dimensions you request (category, type, country, phone_number).
 * `cost` is in `currency` (USD by default for most accounts).
 */
export interface ConversationDataPoint {
  start: number;
  end: number;
  conversation: number;
  /** USD by default — Meta returns whatever currency is configured on the WABA. */
  cost?: number;
  phone_number?: string;
  country?: string;
  /** AUTHENTICATION | MARKETING | UTILITY | SERVICE */
  conversation_category?: string;
  /** FREE_ENTRY | FREE_TIER | REGULAR */
  conversation_type?: string;
}

export interface ConversationAnalytics {
  data: { data_points: ConversationDataPoint[] }[];
}

/**
 * Pull the conversation-based analytics from Meta for the supplied window.
 * Times are *unix seconds* in UTC.
 *
 * Doc: https://developers.facebook.com/docs/whatsapp/business-management-api/analytics/
 */
export async function getConversationAnalytics(opts: {
  start: number; // unix seconds
  end: number;   // unix seconds
  /** DAILY | MONTHLY | HALF_HOUR */
  granularity?: "DAILY" | "MONTHLY" | "HALF_HOUR";
  dimensions?: ("CONVERSATION_CATEGORY" | "CONVERSATION_TYPE" | "COUNTRY" | "PHONE")[];
}): Promise<ConversationAnalytics> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) throw new Error("WABA ID غير مُعرَّف في الإعدادات.");
  const granularity = opts.granularity ?? "DAILY";
  const dims = opts.dimensions ?? ["CONVERSATION_CATEGORY", "CONVERSATION_TYPE", "COUNTRY"];
  const dimsParam = encodeURIComponent(JSON.stringify(dims));
  const fields =
    `conversation_analytics.start(${opts.start}).end(${opts.end})` +
    `.granularity(${granularity}).phone_numbers([])` +
    `.dimensions(${dimsParam}).metric_types(["COST","CONVERSATION"])`;
  const res = await graphFetch(cfg, `/${cfg.wabaId}?fields=${fields}`);
  const wrapped = await graphJson<{ conversation_analytics?: ConversationAnalytics }>(res);
  return wrapped.conversation_analytics ?? { data: [] };
}

/**
 * One row of per-template send analytics returned by Meta.
 * `metric_types`: SENT | DELIVERED | READ | CLICKED.
 */
export interface TemplateAnalyticsDataPoint {
  template_id: string;
  start: number;
  end: number;
  sent?: number;
  delivered?: number;
  read?: number;
  clicked?: { type: string; button_content: string; count: number }[];
}

export interface TemplateAnalytics {
  data: { data_points: TemplateAnalyticsDataPoint[] }[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

/**
 * Per-template send / delivery counts. Meta caps at ~10 templates per call,
 * so callers should batch.
 *
 * Doc: https://developers.facebook.com/docs/whatsapp/business-management-api/analytics/
 */
export async function getTemplateAnalytics(opts: {
  templateIds: string[];
  start: number; // unix seconds
  end: number;   // unix seconds
  granularity?: "DAILY";
  metricTypes?: ("SENT" | "DELIVERED" | "READ" | "CLICKED")[];
}): Promise<TemplateAnalytics> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) throw new Error("WABA ID غير مُعرَّف في الإعدادات.");
  if (opts.templateIds.length === 0) return { data: [] };
  const ids = encodeURIComponent(JSON.stringify(opts.templateIds));
  const metrics = encodeURIComponent(
    JSON.stringify(opts.metricTypes ?? ["SENT", "DELIVERED", "READ", "CLICKED"]),
  );
  const granularity = opts.granularity ?? "DAILY";
  const path =
    `/${cfg.wabaId}/template_analytics?fields=data_points` +
    `&start=${opts.start}&end=${opts.end}&granularity=${granularity}` +
    `&metric_types=${metrics}&template_ids=${ids}&limit=100`;
  const res = await graphFetch(cfg, path);
  return graphJson<TemplateAnalytics>(res);
}

/**
 * One row of pricing / message-based analytics (the new model Meta started
 * rolling out in 2024). Cost is in `currency` (USD for most regions).
 *
 * Some WABAs only respond to `conversation_analytics`, others only to
 * `pricing_analytics`. Callers should attempt the latter first and fall back.
 */
export interface PricingDataPoint {
  start: number;
  end: number;
  /** Number of *messages* (not conversations) in this bucket. */
  volume?: number;
  /** Cost in `currency` units. */
  cost?: number;
  pricing_category?: string;
  pricing_type?: string;
  country?: string;
  phone_number?: string;
}

export interface PricingAnalytics {
  data: { data_points: PricingDataPoint[] }[];
}

export async function getPricingAnalytics(opts: {
  start: number;
  end: number;
  granularity?: "DAILY" | "MONTHLY";
  dimensions?: ("COUNTRY" | "PRICING_TYPE" | "PRICING_CATEGORY" | "PHONE")[];
}): Promise<PricingAnalytics | null> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) throw new Error("WABA ID غير مُعرَّف في الإعدادات.");
  const granularity = opts.granularity ?? "DAILY";
  const dims = opts.dimensions ?? ["PRICING_CATEGORY", "COUNTRY"];
  const dimsParam = encodeURIComponent(JSON.stringify(dims));
  const fields =
    `pricing_analytics.start(${opts.start}).end(${opts.end})` +
    `.granularity(${granularity}).phone_numbers([])` +
    `.dimensions(${dimsParam}).metric_types(["COST","VOLUME"])`;
  try {
    const res = await graphFetch(cfg, `/${cfg.wabaId}?fields=${fields}`);
    const wrapped = await graphJson<{ pricing_analytics?: PricingAnalytics }>(res);
    return wrapped.pricing_analytics ?? null;
  } catch (err) {
    // Older WABAs return "(#100) Tried accessing nonexisting field ..." here.
    // We swallow and let the caller fall back to conversation_analytics.
    if (isWhatsAppApiError(err) && (err.code === 100 || err.status === 400)) {
      return null;
    }
    throw err;
  }
}

/**
 * Template categories accepted by Meta. Choose AUTHENTICATION for OTP /
 * login codes (delivered even outside the 24-hour CS window),
 * MARKETING for promotional content (subject to opt-in + pricing tier),
 * UTILITY for transactional updates (e.g. booking confirmations).
 */
export type TemplateCategory = "AUTHENTICATION" | "MARKETING" | "UTILITY";

export interface CreateTemplateArgs {
  /** Lowercase, snake_case. Must be unique within the WABA + language. */
  name: string;
  /** BCP-47 code (e.g. `ar`, `ar_AE`, `en_US`). */
  language: string;
  category: TemplateCategory;
  /** Components array as defined by Meta. Caller is responsible for shape. */
  components: unknown[];
  /**
   * Marketing/Utility only: when true and Meta finds an existing template
   * with the same name in another language, this submission piggybacks on
   * that family. Ignored for AUTHENTICATION.
   */
  allow_category_change?: boolean;
}

export interface CreateTemplateResponse {
  id: string;
  status: string;
  category?: string;
}

/** POST /{WABA_ID}/message_templates — submit a new template for review. */
export async function createTemplate(
  args: CreateTemplateArgs,
): Promise<CreateTemplateResponse> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) {
    throw new Error("WABA ID غير مُعرَّف في الإعدادات.");
  }
  const res = await graphFetch(cfg, `/${cfg.wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({
      name: args.name,
      language: args.language,
      category: args.category,
      components: args.components,
      ...(args.allow_category_change !== undefined
        ? { allow_category_change: args.allow_category_change }
        : {}),
    }),
  });
  return graphJson<CreateTemplateResponse>(res);
}

/**
 * DELETE /{WABA_ID}/message_templates?name=&hsm_id=
 *
 * If `hsm_id` (template metaId) is provided, deletes only the specific
 * language variant. If only `name` is given, Meta deletes ALL languages
 * with that name — use carefully.
 */
export async function deleteTemplate(args: {
  name: string;
  hsmId?: string;
}): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) {
    throw new Error("WABA ID غير مُعرَّف في الإعدادات.");
  }
  let path = `/${cfg.wabaId}/message_templates?name=${encodeURIComponent(args.name)}`;
  if (args.hsmId) {
    path += `&hsm_id=${encodeURIComponent(args.hsmId)}`;
  }
  const res = await graphFetch(cfg, path, { method: "DELETE" });
  return graphJson<{ success: boolean }>(res);
}

/**
 * POST /{TEMPLATE_ID} — edit an existing template. Meta only allows
 * editing the components / category, not the name or language. The
 * template re-enters review after this call.
 */
export async function editTemplate(args: {
  metaId: string;
  category?: TemplateCategory;
  components?: unknown[];
}): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  const body: Record<string, unknown> = {};
  if (args.category) body.category = args.category;
  if (args.components) body.components = args.components;
  const res = await graphFetch(cfg, `/${encodeURIComponent(args.metaId)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return graphJson<{ success: boolean }>(res);
}

// ───────────────────────── Phone Number management ────────────────────────

export interface PhoneNumberDetail {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  /** TIER_50, TIER_250, TIER_1K, TIER_10K, TIER_100K, TIER_UNLIMITED */
  messaging_limit_tier?: string;
  /** APPROVED | NONE | DECLINED | EXPIRED */
  name_status?: string;
  /** VERIFIED | NOT_VERIFIED | EXPIRED | PENDING */
  code_verification_status?: string;
  /** Object describing per-entity health on Meta side. */
  health_status?: {
    can_send_message?: "AVAILABLE" | "LIMITED" | "BLOCKED";
    entities?: { entity_type: string; id: string; can_send_message: string }[];
  };
  /** New display name awaiting Meta review, if any. */
  new_name_status?: string;
  /** ON_PREMISE | CLOUD_API */
  platform_type?: string;
  is_pin_enabled?: boolean;
  is_official_business_account?: boolean;
}

const PHONE_NUMBER_FIELDS = [
  "id",
  "display_phone_number",
  "verified_name",
  "quality_rating",
  "messaging_limit_tier",
  "name_status",
  "code_verification_status",
  "health_status",
  "new_name_status",
  "platform_type",
  "is_pin_enabled",
  "is_official_business_account",
].join(",");

/** GET /{PHONE_NUMBER_ID}?fields=… — full health & quality snapshot. */
export async function getPhoneNumberDetail(): Promise<PhoneNumberDetail> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(
    cfg,
    `/${cfg.phoneNumberId}?fields=${PHONE_NUMBER_FIELDS}`,
  );
  return graphJson<PhoneNumberDetail>(res);
}

/** GET /{WABA_ID}/phone_numbers — list every number under the WABA. */
export async function listPhoneNumbers(): Promise<PhoneNumberDetail[]> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) {
    throw new Error("WABA ID غير مُعرَّف في الإعدادات.");
  }
  const res = await graphFetch(
    cfg,
    `/${cfg.wabaId}/phone_numbers?fields=${PHONE_NUMBER_FIELDS}&limit=100`,
  );
  const data = await graphJson<{ data?: PhoneNumberDetail[] }>(res);
  return data.data ?? [];
}

/**
 * POST /{PHONE_NUMBER_ID} — change the verified business display name.
 * Meta requires a separate review; the new name will appear in
 * `new_name_status` until approved.
 */
export async function requestDisplayNameChange(
  newName: string,
): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}`, {
    method: "POST",
    body: JSON.stringify({ new_display_name: newName }),
  });
  return graphJson<{ success: boolean }>(res);
}

/**
 * POST /{PHONE_NUMBER_ID}/request_code — request the verification code via
 * SMS or VOICE. Used during initial onboarding or when re-verifying.
 */
export async function requestVerificationCode(
  args: { codeMethod: "SMS" | "VOICE"; language: string },
): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/request_code`, {
    method: "POST",
    body: JSON.stringify({
      code_method: args.codeMethod,
      language: args.language,
    }),
  });
  return graphJson<{ success: boolean }>(res);
}

/** POST /{PHONE_NUMBER_ID}/verify_code — submit the 6-digit code received. */
export async function submitVerificationCode(
  code: string,
): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/verify_code`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return graphJson<{ success: boolean }>(res);
}

/**
 * POST /{PHONE_NUMBER_ID} — set or replace the Two-Step Verification PIN.
 * Distinct from the /register PIN (which is one-shot) — this controls the
 * ongoing 2FA challenge required to re-register the number.
 */
export async function setTwoStepPin(pin: string): Promise<{ success: boolean }> {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error("PIN يجب أن يكون 6 أرقام");
  }
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}`, {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
  return graphJson<{ success: boolean }>(res);
}

// ───────────────── Conversational Automation (greeting / ice-breakers) ────

export interface ConversationalCommand {
  command_name: string;
  command_description: string;
}

export interface ConversationalAutomation {
  /** Auto-reply when a user opens the chat for the first time in 24h. */
  enable_welcome_message?: boolean;
  /** "/" commands — name + description. */
  commands?: ConversationalCommand[];
  /** Up to 4 quick-start prompts shown before the user types. */
  prompts?: string[];
}

/**
 * GET conversational automation. Meta exposes this as a *field* on the
 * phone-number node, not as a sub-resource:
 *   GET /{PHONE_NUMBER_ID}?fields=conversational_automation
 * Hitting the path-style URL returns 400 "Unsupported get request".
 */
export async function getConversationalAutomation(): Promise<ConversationalAutomation> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(
    cfg,
    `/${cfg.phoneNumberId}?fields=conversational_automation`,
  );
  const wrapped = await graphJson<{
    conversational_automation?: ConversationalAutomation;
    id?: string;
  }>(res);
  return wrapped.conversational_automation ?? {};
}

/** POST /{PHONE_NUMBER_ID}/conversational_automation */
export async function updateConversationalAutomation(
  patch: ConversationalAutomation,
): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  // Meta wants commands/prompts as JSON-stringified strings inside form-style
  // params even on POST, but accepts proper JSON when Content-Type is set.
  const body: Record<string, unknown> = {};
  if (patch.enable_welcome_message !== undefined)
    body.enable_welcome_message = patch.enable_welcome_message;
  if (patch.commands !== undefined)
    body.commands = JSON.stringify(patch.commands);
  if (patch.prompts !== undefined)
    body.prompts = JSON.stringify(patch.prompts);

  const res = await graphFetch(
    cfg,
    `/${cfg.phoneNumberId}/conversational_automation`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  return graphJson<{ success: boolean }>(res);
}

// ─────────────────────── App webhook subscriptions ────────────────────────

export interface AppSubscription {
  whatsapp_business_api_data?: {
    id: string;
    name?: string;
    link?: string;
    category?: string;
  };
  override_callback_uri?: string;
}

/**
 * GET /{WABA_ID}/subscribed_apps — which apps are receiving this WABA's
 * webhook events. Meta sends webhooks ONLY to subscribed apps.
 */
export async function getSubscribedApps(): Promise<AppSubscription[]> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) throw new Error("WABA ID غير مُعرَّف.");
  const res = await graphFetch(cfg, `/${cfg.wabaId}/subscribed_apps`);
  const data = await graphJson<{ data?: AppSubscription[] }>(res);
  return data.data ?? [];
}

/** POST /{WABA_ID}/subscribed_apps — subscribe the current app to WABA. */
export async function subscribeApp(): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) throw new Error("WABA ID غير مُعرَّف.");
  const res = await graphFetch(cfg, `/${cfg.wabaId}/subscribed_apps`, {
    method: "POST",
  });
  return graphJson<{ success: boolean }>(res);
}

/** DELETE /{WABA_ID}/subscribed_apps — unsubscribe the current app. */
export async function unsubscribeApp(): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.wabaId) throw new Error("WABA ID غير مُعرَّف.");
  const res = await graphFetch(cfg, `/${cfg.wabaId}/subscribed_apps`, {
    method: "DELETE",
  });
  return graphJson<{ success: boolean }>(res);
}

// ───────────────────────── Business profile (GET/POST) ───────────────────

export interface BusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string; // ALCOHOL | APPAREL | BEAUTY | ... | HOTEL | ...
}

const PROFILE_FIELDS =
  "about,address,description,email,profile_picture_url,websites,vertical";

/** GET /{phone_number_id}/whatsapp_business_profile */
export async function getBusinessProfile(): Promise<BusinessProfile> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(
    cfg,
    `/${cfg.phoneNumberId}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`,
  );
  const data = await graphJson<{ data?: BusinessProfile[] }>(res);
  return data.data?.[0] ?? {};
}

export interface BusinessProfileUpdate {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  websites?: string[];
  /** Opaque handle returned by the Resumable Upload API. */
  profile_picture_handle?: string;
}

/** POST /{phone_number_id}/whatsapp_business_profile */
export async function updateBusinessProfile(
  updates: BusinessProfileUpdate,
): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  const body = { messaging_product: "whatsapp", ...updates };
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/whatsapp_business_profile`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return graphJson<{ success: boolean }>(res);
}

// ───────────────────────── Resumable upload ──────────────────────────────

/**
 * Upload an image (or any file) to Meta's Resumable Upload API and return
 * the handle that can be plugged into `updateBusinessProfile` via
 * `profile_picture_handle`.
 *
 * Two steps:
 *   1. POST /{APP_ID}/uploads  → creates a session `upload:xxxx`
 *   2. POST /{session_id}      → writes the bytes, returns `{ h: "..." }`
 *
 * Docs: https://developers.facebook.com/docs/graph-api/guides/upload
 */
export async function uploadFileHandle(
  file: { bytes: Buffer | ArrayBuffer; mimeType: string; fileName: string },
): Promise<string> {
  const cfg = await loadRuntimeConfig();
  if (!cfg.appId) throw new Error("App ID غير مُعرَّف في الإعدادات.");

  const byteLength =
    file.bytes instanceof Buffer ? file.bytes.length : file.bytes.byteLength;

  // Step 1 — create session.
  const sessionUrl =
    `${GRAPH_ROOT}/${cfg.apiVersion}/${cfg.appId}/uploads` +
    `?file_name=${encodeURIComponent(file.fileName)}` +
    `&file_length=${byteLength}` +
    `&file_type=${encodeURIComponent(file.mimeType)}` +
    `&access_token=${encodeURIComponent(cfg.accessToken)}`;
  const sessionRes = await fetch(sessionUrl, { method: "POST" });
  const session = await graphJson<{ id?: string }>(sessionRes);
  const sessionId = session.id;
  if (!sessionId) throw new Error("Meta لم يُرجع session id لرفع الملف.");

  // Step 2 — upload bytes. Must be raw body with Authorization: OAuth {token}
  // and file_offset header.
  const uploadUrl = `${GRAPH_ROOT}/${cfg.apiVersion}/${sessionId}`;
  const arrayBuffer =
    file.bytes instanceof Buffer
      ? file.bytes.buffer.slice(
          file.bytes.byteOffset,
          file.bytes.byteOffset + file.bytes.byteLength,
        )
      : file.bytes;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${cfg.accessToken}`,
      file_offset: "0",
      "Content-Type": file.mimeType,
    },
    // @ts-expect-error — Node's fetch accepts ArrayBuffer/Blob; lib DOM types are stricter.
    body: new Blob([arrayBuffer], { type: file.mimeType }),
  });
  const uploaded = await graphJson<{ h?: string }>(uploadRes);
  if (!uploaded.h) throw new Error("Meta لم يُرجع file handle.");
  return uploaded.h;
}

// ─────────────────────────── Media upload / download / send ─────────────

/**
 * Upload media to `/{phone_number_id}/media` — returns a Meta media id that
 * can then be plugged into a `sendMedia({ mediaId })` call. Preferred over
 * attaching raw URLs because Meta caches/optimises the bytes and the send
 * works even before our domain is publicly reachable.
 *
 * Two upload targets exist in Graph:
 *   1. `/{phone_number_id}/media` — media messages (this function).
 *   2. `/{APP_ID}/uploads`        — business-profile picture handles (above).
 * Do not mix them.
 */
export async function uploadMedia(args: {
  bytes: Buffer | ArrayBuffer;
  mimeType: string;
  filename: string;
}): Promise<{ id: string }> {
  const cfg = await loadRuntimeConfig();
  const byteLength =
    args.bytes instanceof Buffer ? args.bytes.length : args.bytes.byteLength;
  const arrayBuffer =
    args.bytes instanceof Buffer
      ? args.bytes.buffer.slice(
          args.bytes.byteOffset,
          args.bytes.byteOffset + args.bytes.byteLength,
        )
      : args.bytes;

  // Graph /media upload uses multipart/form-data.
  const form = new FormData();
  const blob = new Blob([arrayBuffer as ArrayBuffer], { type: args.mimeType });
  form.append("file", blob, args.filename);
  form.append("type", args.mimeType);
  form.append("messaging_product", "whatsapp");

  let url = `${GRAPH_ROOT}/${cfg.apiVersion}/${cfg.phoneNumberId}/media`;
  if (cfg.appSecret) {
    url = appendQuery(
      url,
      "appsecret_proof",
      buildAppSecretProof(cfg.accessToken, cfg.appSecret),
    );
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
    body: form,
  });
  return graphJson<{ id: string }>(res).then((j) => {
    if (!j.id) throw new Error(`media upload returned no id (size=${byteLength})`);
    return j;
  });
}

export type SendMediaKind = "image" | "document" | "video" | "audio" | "sticker";

export interface SendMediaArgs {
  to: string;
  kind: SendMediaKind;
  mediaId: string;
  caption?: string;
  filename?: string;
}

/** Send a media message by referencing an already-uploaded Meta media id. */
export async function sendMedia(args: SendMediaArgs): Promise<GraphSendResponse> {
  const cfg = await loadRuntimeConfig();
  const mediaObj: Record<string, unknown> = { id: args.mediaId };
  if (args.caption && (args.kind === "image" || args.kind === "video" || args.kind === "document")) {
    mediaObj.caption = args.caption;
  }
  if (args.filename && args.kind === "document") {
    mediaObj.filename = args.filename;
  }
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.to,
      type: args.kind,
      [args.kind]: mediaObj,
    }),
  });
  return graphJson<GraphSendResponse>(res);
}

/**
 * Send a standalone image referenced by a publicly-reachable HTTPS URL.
 * Useful when you don't want to pre-upload to Meta (e.g. unit photos
 * already hosted on our CDN). Caption renders below the image bubble.
 */
export async function sendImageByUrl(args: {
  to: string;
  url: string;
  caption?: string;
}): Promise<GraphSendResponse> {
  const cfg = await loadRuntimeConfig();
  const image: Record<string, unknown> = { link: args.url };
  if (args.caption) image.caption = args.caption;
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.to,
      type: "image",
      image,
    }),
  });
  return graphJson<GraphSendResponse>(res);
}

export interface MediaInfo {
  url: string;
  mime_type: string;
  sha256?: string;
  file_size?: number;
  id: string;
  messaging_product?: string;
}

/**
 * Resolve a Meta media id to a short-lived signed URL. URLs expire after
 * ~5 minutes and require the bearer token on the download request.
 */
export async function getMediaInfo(mediaId: string): Promise<MediaInfo> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${encodeURIComponent(mediaId)}`);
  return graphJson<MediaInfo>(res);
}

/**
 * Fetch the raw media bytes + metadata for a given id. Returns the bearer
 * token in the headers so the proxy route can stream back to the browser
 * without buffering the whole file in memory.
 */
export async function fetchMediaStream(
  mediaId: string,
): Promise<{ response: Response; info: MediaInfo }> {
  const cfg = await loadRuntimeConfig();
  const info = await getMediaInfo(mediaId);
  if (!info.url) throw new Error("Meta لم يُرجع رابط للملف");
  const res = await fetch(info.url, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new WhatsAppApiError(res.status, txt || `media fetch ${res.status}`);
  }
  return { response: res, info };
}

// ─────────────────────────── Read receipts ───────────────────────────────

/**
 * Mark an inbound message as read on Meta's side. This turns the two-ticks
 * grey into blue for the sender. Safe to call with stale ids — Meta returns
 * 200 and ignores unknown wamids.
 */
export async function markMessageRead(wamid: string): Promise<{ success: boolean }> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: wamid,
    }),
  });
  return graphJson<{ success: boolean }>(res);
}

// ─────────────────────────── Register / Deregister ───────────────────────

export interface RegisterArgs {
  /** 6-digit two-step verification PIN (numeric string). */
  pin: string;
  /** If set, also enables Two-Step Verification with this PIN. */
  dataLocalizationRegion?: string;
}

/**
 * Register the phone number for Cloud API. Required once per number before
 * it can send/receive messages — otherwise Meta returns #133010
 * "Account not registered".
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/registration
 */
export async function registerPhoneNumber(args: RegisterArgs): Promise<{ success: true }> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/register`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      pin: args.pin,
      ...(args.dataLocalizationRegion
        ? { data_localization_region: args.dataLocalizationRegion }
        : {}),
    }),
  });
  return graphJson<{ success: true }>(res);
}

/** Optional — deregister (rarely needed). */
export async function deregisterPhoneNumber(): Promise<{ success: true }> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/deregister`, {
    method: "POST",
  });
  return graphJson<{ success: true }>(res);
}

// ──────────────────────────── Connection check ────────────────────────────

export interface PhoneNumberProbe {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  platform_type?: string;
}

/** Hit GET /{phone_number_id} — cheapest way to verify the token. */
export async function probePhoneNumber(): Promise<PhoneNumberProbe> {
  const cfg = await loadRuntimeConfig();
  const res = await graphFetch(
    cfg,
    `/${cfg.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type`,
  );
  return graphJson<PhoneNumberProbe>(res);
}

// ────────────────────────── Webhook signature check ───────────────────────

/**
 * Verify Meta's X-Hub-Signature-256 header against the raw request body using
 * the app secret. Returns true on match. Requires the RAW bytes — Next.js
 * `req.text()` before JSON.parse is the idiomatic way.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  const hmac = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  if (expected.length !== hmac.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hmac, "hex"));
  } catch {
    return false;
  }
}

// ──────────────────────────── Webhook payload types ───────────────────────

export interface WebhookChangeValue {
  messaging_product?: "whatsapp";
  metadata?: { display_phone_number: string; phone_number_id: string };
  contacts?: { profile?: { name?: string }; wa_id: string }[];
  messages?: WebhookInboundMessage[];
  statuses?: WebhookStatus[];
}

export interface WebhookInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string; mime_type?: string; sha256?: string };
  document?: {
    id: string;
    caption?: string;
    filename?: string;
    mime_type?: string;
    sha256?: string;
  };
  audio?: { id: string; mime_type?: string; sha256?: string };
  video?: { id: string; caption?: string; mime_type?: string; sha256?: string };
  sticker?: { id: string; mime_type?: string; sha256?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  /// Reply payload when the user taps a button or list item we previously
  /// sent as an `interactive` outbound message. Discriminated by `type`:
  ///   • "button_reply" → user tapped a Reply Button
  ///   • "list_reply"   → user picked a row in an Interactive List
  ///   • "nfm_reply"    → user finished a WhatsApp Flow (JSON in `response_json`)
  interactive?: {
    type: "button_reply" | "list_reply" | "nfm_reply" | string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
    nfm_reply?: { name?: string; body?: string; response_json?: string };
  };
  reaction?: { emoji: string; message_id: string };
  button?: { text?: string; payload?: string };
}

export interface WebhookStatus {
  id: string; // wamid
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  pricing?: { category?: string; pricing_model?: string };
  errors?: { code: number; title: string; message?: string }[];
}

export interface WebhookEntry {
  id: string;
  changes: { field: string; value: WebhookChangeValue }[];
}

export interface WebhookPayload {
  object: "whatsapp_business_account";
  entry: WebhookEntry[];
}
