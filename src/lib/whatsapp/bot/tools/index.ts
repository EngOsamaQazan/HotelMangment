import "server-only";
import {
  searchAvailability,
  searchAvailabilitySchema,
  type SearchAvailabilityInput,
  type SearchAvailabilityOutput,
} from "./searchAvailability";
import { getQuote, getQuoteSchema, type GetQuoteInput, type GetQuoteOutput } from "./getQuote";
import {
  createHold,
  createHoldSchema,
  type CreateHoldInput,
  type CreateHoldOutput,
} from "./createHold";
import {
  cancelHold,
  cancelHoldSchema,
  type CancelHoldInput,
  type CancelHoldOutput,
} from "./cancelHold";
import {
  createPaymentLink,
  createPaymentLinkSchema,
  type CreatePaymentLinkInput,
  type CreatePaymentLinkOutput,
} from "./createPaymentLink";
import {
  lookupReservation,
  lookupReservationSchema,
  type LookupReservationInput,
  type LookupReservationOutput,
} from "./lookupReservation";
import {
  escalateToHuman,
  escalateToHumanSchema,
  type EscalateInput,
  type EscalateOutput,
} from "./escalateToHuman";
import type { ToolContext, ToolJsonSchema, ToolName, ToolResult } from "./types";
export type { ToolContext, ToolJsonSchema, ToolName, ToolResult } from "./types";
export { TOOL_NAMES } from "./types";

/**
 * Single dispatch surface used by the engine and the LLM adapter. Keeping
 * the per-tool implementations and JSON schemas behind one map lets us:
 *   • Loop over `ALL_TOOL_SCHEMAS` to build the LLM `tools` array.
 *   • Call `runTool(name, input, ctx)` from the engine without long
 *     switch statements.
 *   • Strongly type each tool's input/output via `ToolIO` below so callers
 *     get autocomplete and the engine's runtime adapter stays type-safe.
 */

export interface ToolIO {
  searchAvailability: { input: SearchAvailabilityInput; output: SearchAvailabilityOutput };
  getQuote:           { input: GetQuoteInput;           output: GetQuoteOutput };
  createHold:         { input: CreateHoldInput;         output: CreateHoldOutput };
  cancelHold:         { input: CancelHoldInput;         output: CancelHoldOutput };
  createPaymentLink:  { input: CreatePaymentLinkInput;  output: CreatePaymentLinkOutput };
  lookupReservation:  { input: LookupReservationInput;  output: LookupReservationOutput };
  escalateToHuman:    { input: EscalateInput;           output: EscalateOutput };
}

/** Ordered list of all tool JSON schemas — used by every LLM adapter. */
export const ALL_TOOL_SCHEMAS: ToolJsonSchema[] = [
  searchAvailabilitySchema,
  getQuoteSchema,
  createHoldSchema,
  cancelHoldSchema,
  createPaymentLinkSchema,
  lookupReservationSchema,
  escalateToHumanSchema,
];

type ToolImpl<Name extends ToolName> = (
  input: ToolIO[Name]["input"],
  ctx: ToolContext,
) => Promise<ToolResult<ToolIO[Name]["output"]>>;

const REGISTRY: { [K in ToolName]: ToolImpl<K> } = {
  searchAvailability,
  getQuote,
  createHold,
  cancelHold,
  createPaymentLink,
  lookupReservation,
  escalateToHuman,
};

/**
 * Run a tool by name. The input is `unknown` because it comes from an LLM
 * (the schema-strict mode does most of the validation; each tool also
 * validates its own fields). Returns the same `ToolResult` shape every
 * tool produces.
 */
export async function runTool<Name extends ToolName>(
  name: Name,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult<ToolIO[Name]["output"]>> {
  const impl = REGISTRY[name];
  if (!impl) {
    return {
      ok: false,
      error: { code: "internal", message: `unknown tool: ${name}` },
    };
  }
  try {
    return await impl(input as ToolIO[Name]["input"], ctx);
  } catch (e) {
    console.error(`[bot/tools/${name}] uncaught`, e);
    return {
      ok: false,
      error: {
        code: "internal",
        message: e instanceof Error ? e.message : "internal error",
      },
    };
  }
}
