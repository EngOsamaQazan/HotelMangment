import "server-only";

/**
 * Generic template-introspection helpers.
 *
 * Any template approved by Meta can be sent without changing application
 * code: feed its `components` definition into `inspectTemplate()` to learn
 * which variables it expects, collect those values from the user, then
 * pass them to `buildSendComponents()` to obtain the exact `components`
 * payload that the WhatsApp Cloud API requires.
 *
 * This file has zero runtime dependencies — it is pure data wrangling so
 * it can be reused on the server (API routes), in scripts, and in tests.
 */

// ───────────────────────────── Public types ──────────────────────────────

export type TemplateComponentType = "HEADER" | "BODY" | "FOOTER" | "BUTTONS";

export type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";

export type ButtonType = "URL" | "QUICK_REPLY" | "PHONE_NUMBER" | "COPY_CODE" | "OTP";

export interface RawButton {
  type: ButtonType | string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[];
  /** Some Meta payloads store the OTP code-copy hint here. */
  otp_type?: string;
}

export interface RawComponent {
  type: TemplateComponentType | string;
  format?: HeaderFormat | string;
  text?: string;
  buttons?: RawButton[];
  example?: {
    body_text?: string[][]; // [[ "v1", "v2" ]]
    header_text?: string[]; // [ "value" ]
    header_handle?: string[]; // media handles
  };
  /** Some footers carry a code expiration hint. */
  code_expiration_minutes?: number;
}

/** A single value the caller must supply to send the template. */
export interface TemplateVariable {
  /** Stable identifier used as React key + form field name. */
  id: string;
  /** Where the value plugs in. */
  scope: "header" | "body" | "button";
  /** 1-based variable index inside the component (matches `{{n}}`). */
  index: number;
  /** Required for `scope: "button"` — the 0-based button position. */
  buttonIndex?: number;
  /** Required for `scope: "button"` — the URL pattern needs a "url" param. */
  buttonSubType?: "url";
  /** What kind of value Meta expects. */
  paramType: "text" | "currency" | "date_time" | "image" | "video" | "document" | "location";
  /** Human label shown to the operator (Arabic). */
  label: string;
  /** Optional default — taken from the `example` block when present. */
  defaultValue?: string;
  /** Optional contextual hint, e.g. the surrounding sentence. */
  hint?: string;
}

export interface InspectedTemplate {
  variables: TemplateVariable[];
  /** Pre-rendered preview of the BODY with `{{n}}` placeholders intact. */
  bodyPreview?: string;
  /** Footer text (no variables allowed by Meta in footers). */
  footerText?: string;
  /** Header preview (text only — media headers are described in variables). */
  headerPreview?: string;
  /** Buttons summary used by the UI to render labels. */
  buttons: { index: number; type: string; text: string; hasVariable: boolean }[];
  /** True when this template needs absolutely no parameters (static body). */
  isStatic: boolean;
}

// ───────────────────────────── Internal utils ────────────────────────────

const PLACEHOLDER_RE = /\{\{\s*(\d+)\s*\}\}/g;

function extractIndices(text: string | undefined): number[] {
  if (!text) return [];
  const out = new Set<number>();
  let m: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    out.add(Number(m[1]));
  }
  return Array.from(out).sort((a, b) => a - b);
}

function paramTypeForHeaderFormat(fmt?: string): TemplateVariable["paramType"] {
  switch ((fmt ?? "").toUpperCase()) {
    case "IMAGE":
      return "image";
    case "VIDEO":
      return "video";
    case "DOCUMENT":
      return "document";
    case "LOCATION":
      return "location";
    default:
      return "text";
  }
}

function trimExample(s: string | undefined): string | undefined {
  if (s === undefined || s === null) return undefined;
  const t = String(s).trim();
  return t.length > 0 ? t : undefined;
}

// ───────────────────────────── Public API ────────────────────────────────

/**
 * Inspect any Meta template `components` definition and return the list
 * of variables a caller must provide, along with rich UI metadata.
 */
export function inspectTemplate(components: unknown): InspectedTemplate {
  const comps = (Array.isArray(components) ? components : []) as RawComponent[];
  const variables: TemplateVariable[] = [];
  let bodyPreview: string | undefined;
  let footerText: string | undefined;
  let headerPreview: string | undefined;
  const buttonSummaries: InspectedTemplate["buttons"] = [];

  for (const c of comps) {
    const ctype = String(c.type ?? "").toUpperCase();

    if (ctype === "HEADER") {
      const fmt = String(c.format ?? "TEXT").toUpperCase();
      headerPreview = c.text;
      const paramType = paramTypeForHeaderFormat(fmt);

      if (paramType === "text") {
        const indices = extractIndices(c.text);
        for (const i of indices) {
          variables.push({
            id: `header:${i}`,
            scope: "header",
            index: i,
            paramType: "text",
            label: `قيمة الترويسة (Header) #${i}`,
            defaultValue: trimExample(c.example?.header_text?.[i - 1]),
            hint: c.text,
          });
        }
      } else {
        // Media header — exactly one parameter regardless of format.
        variables.push({
          id: `header:media`,
          scope: "header",
          index: 1,
          paramType,
          label:
            paramType === "image"
              ? "صورة الترويسة (رابط)"
              : paramType === "video"
                ? "فيديو الترويسة (رابط)"
                : paramType === "document"
                  ? "مستند الترويسة (رابط)"
                  : "إحداثيات الترويسة",
          defaultValue: trimExample(c.example?.header_handle?.[0]),
          hint: `Header format: ${fmt}`,
        });
      }
      continue;
    }

    if (ctype === "BODY") {
      bodyPreview = c.text;
      const indices = extractIndices(c.text);
      const examples = c.example?.body_text?.[0] ?? [];
      for (const i of indices) {
        variables.push({
          id: `body:${i}`,
          scope: "body",
          index: i,
          paramType: "text",
          label: `قيمة المتن (Body) #${i}`,
          defaultValue: trimExample(examples[i - 1]),
          hint: c.text,
        });
      }
      continue;
    }

    if (ctype === "FOOTER") {
      footerText = c.text;
      continue;
    }

    if (ctype === "BUTTONS") {
      const buttons = c.buttons ?? [];
      buttons.forEach((btn, idx) => {
        const btype = String(btn.type ?? "").toUpperCase();
        const urlIndices = extractIndices(btn.url);
        // Quick-reply buttons currently take no parameter on send.
        // URL buttons that contain `{{n}}` accept exactly one URL param,
        // even if Meta numbers them with {{1}} only — anything beyond
        // {{1}} is unsupported. We follow that contract.
        const hasVar = urlIndices.length > 0 || btype === "COPY_CODE" || btype === "OTP";
        buttonSummaries.push({
          index: idx,
          type: btype,
          text: btn.text ?? btype,
          hasVariable: hasVar,
        });
        if (hasVar) {
          variables.push({
            id: `button:${idx}`,
            scope: "button",
            index: 1,
            buttonIndex: idx,
            buttonSubType: "url",
            paramType: "text",
            label:
              btype === "COPY_CODE" || btype === "OTP"
                ? `قيمة زرّ نسخ الرمز "${btn.text ?? "Copy code"}"`
                : `قيمة زرّ الرابط "${btn.text ?? "URL"}"`,
            defaultValue:
              trimExample(btn.example?.[0])
                ?.replace(/.*[?&/=]/, "")
                ?.replace(/^otp/i, "") ?? undefined,
            hint: btn.url,
          });
        }
      });
      continue;
    }
  }

  // Variables go in deterministic order: header → body → buttons, with
  // each scope sorted by index.
  variables.sort((a, b) => {
    const order: Record<TemplateVariable["scope"], number> = {
      header: 0,
      body: 1,
      button: 2,
    };
    if (order[a.scope] !== order[b.scope]) return order[a.scope] - order[b.scope];
    if (a.scope === "button")
      return (a.buttonIndex ?? 0) - (b.buttonIndex ?? 0);
    return a.index - b.index;
  });

  return {
    variables,
    bodyPreview,
    footerText,
    headerPreview,
    buttons: buttonSummaries,
    isStatic: variables.length === 0,
  };
}

/**
 * Render a body/header preview by substituting `{{n}}` with the values
 * the operator entered (used for the "before sending" preview).
 */
export function renderTemplateText(
  text: string | undefined,
  values: Record<string, string>,
): string {
  if (!text) return "";
  return text.replace(PLACEHOLDER_RE, (_, n) => values[String(n)] ?? `{{${n}}}`);
}

// ────────────────────── Build outbound Meta payload ──────────────────────

interface BuildArgs {
  /** The template's `components` array, as stored locally / received from Meta. */
  components: unknown;
  /** Map keyed by `TemplateVariable.id` → user-entered value. */
  values: Record<string, string>;
  /** Optional per-variable metadata. Currently used to override the
   *  filename Meta surfaces in the WhatsApp client for `document` /
   *  `image` / `video` headers (otherwise Meta defaults to a generic
   *  "document.pdf"). Key is the same `TemplateVariable.id`. */
  valueMeta?: Record<string, { filename?: string }>;
}

interface SendComponent {
  type: "header" | "body" | "button";
  sub_type?: "url" | "quick_reply";
  index?: string;
  parameters: SendParameter[];
}

type MediaRef = { link: string; filename?: string } | { id: string; filename?: string };

type SendParameter =
  | { type: "text"; text: string }
  | { type: "image"; image: MediaRef }
  | { type: "video"; video: MediaRef }
  | { type: "document"; document: MediaRef }
  | { type: "currency"; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: "date_time"; date_time: { fallback_value: string } };

/**
 * Convert the inspected variables + caller-supplied values into the
 * exact `components` array the Cloud API expects.
 *
 * Throws when a non-optional value is missing.
 */
export function buildSendComponents({
  components,
  values,
  valueMeta,
}: BuildArgs): SendComponent[] {
  const inspected = inspectTemplate(components);
  const out: SendComponent[] = [];

  // Group variables by component for cleaner output.
  const headerVars = inspected.variables.filter((v) => v.scope === "header");
  const bodyVars = inspected.variables.filter((v) => v.scope === "body");
  const buttonVars = inspected.variables.filter((v) => v.scope === "button");

  if (headerVars.length > 0) {
    const params: SendParameter[] = [];
    for (const v of headerVars.sort((a, b) => a.index - b.index)) {
      params.push(toSendParameter(v, values, valueMeta?.[v.id]));
    }
    out.push({ type: "header", parameters: params });
  }

  if (bodyVars.length > 0) {
    const params: SendParameter[] = [];
    for (const v of bodyVars.sort((a, b) => a.index - b.index)) {
      params.push(toSendParameter(v, values, valueMeta?.[v.id]));
    }
    out.push({ type: "body", parameters: params });
  }

  for (const v of buttonVars.sort(
    (a, b) => (a.buttonIndex ?? 0) - (b.buttonIndex ?? 0),
  )) {
    out.push({
      type: "button",
      sub_type: v.buttonSubType ?? "url",
      index: String(v.buttonIndex ?? 0),
      parameters: [toSendParameter(v, values, valueMeta?.[v.id])],
    });
  }

  return out;
}

function toSendParameter(
  v: TemplateVariable,
  values: Record<string, string>,
  meta?: { filename?: string },
): SendParameter {
  const raw = values[v.id];
  if (raw === undefined || raw === "") {
    if (v.defaultValue !== undefined) {
      return paramFromString(v, v.defaultValue, meta);
    }
    throw new Error(`قيمة مفقودة للمتغيّر "${v.label}" (${v.id})`);
  }
  return paramFromString(v, raw, meta);
}

/**
 * Heuristic: anything starting with `http://` or `https://` is treated as
 * a public URL (`link`); everything else is treated as a Meta media ID
 * (`id`) — produced by `/api/whatsapp/media/upload`. Callers can also
 * pass an explicit `mediaId:<id>` or `url:<url>` prefix to force the
 * choice when a media ID happens to look like a URL (rare).
 */
function asMediaRef(raw: string, fileName?: string): {
  link?: string;
  id?: string;
  filename?: string;
} {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith("url:"))
    return { link: trimmed.slice(4), filename: fileName };
  if (lower.startsWith("mediaid:"))
    return { id: trimmed.slice(8), filename: fileName };

  if (lower.startsWith("http://") || lower.startsWith("https://"))
    return { link: trimmed, filename: fileName };
  return { id: trimmed, filename: fileName };
}

function paramFromString(
  v: TemplateVariable,
  raw: string,
  meta?: { filename?: string },
): SendParameter {
  switch (v.paramType) {
    case "image": {
      const { link, id } = asMediaRef(raw);
      const image = link
        ? meta?.filename
          ? { link, filename: meta.filename }
          : { link }
        : meta?.filename
          ? { id: id!, filename: meta.filename }
          : { id: id! };
      return { type: "image", image } as SendParameter;
    }
    case "video": {
      const { link, id } = asMediaRef(raw);
      const video = link
        ? meta?.filename
          ? { link, filename: meta.filename }
          : { link }
        : meta?.filename
          ? { id: id!, filename: meta.filename }
          : { id: id! };
      return { type: "video", video } as SendParameter;
    }
    case "document": {
      // Filename priority: explicit `meta.filename` (caller override) →
      // filename inferred from URL pathname → fallback `document.pdf`.
      const inferredName = (() => {
        try {
          const u = new URL(raw);
          const last = u.pathname.split("/").filter(Boolean).pop();
          return last && last.includes(".") ? decodeURIComponent(last) : undefined;
        } catch {
          return undefined;
        }
      })();
      const { link, id, filename } = asMediaRef(raw, inferredName);
      const finalName = meta?.filename ?? filename ?? inferredName ?? "document.pdf";
      return {
        type: "document",
        document: link
          ? { link, filename: finalName }
          : { id: id!, filename: finalName },
      } as SendParameter;
    }
    case "currency":
      // Soft fallback: callers wanting full control should use `text`.
      return {
        type: "currency",
        currency: { fallback_value: raw, code: "USD", amount_1000: 0 },
      };
    case "date_time":
      return { type: "date_time", date_time: { fallback_value: raw } };
    case "location":
    case "text":
    default:
      return { type: "text", text: raw };
  }
}
