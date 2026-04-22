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
  if (init.body && !headers.has("Content-Type")) {
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
  image?: { id: string; caption?: string; mime_type?: string };
  document?: { id: string; caption?: string; filename?: string; mime_type?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; caption?: string; mime_type?: string };
  sticker?: { id: string; mime_type?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: unknown;
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
