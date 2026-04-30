import "server-only";
import {
  ASSISTANT_TOOL_NAMES,
  type AssistantToolContext,
  type AssistantToolDef,
  type AssistantToolName,
  type AssistantToolResult,
} from "../types";
import { searchAccount, searchAccountSchema, type SearchAccountInput, type SearchAccountOutput } from "./searchAccount";
import { searchParty, searchPartySchema, type SearchPartyInput, type SearchPartyOutput } from "./searchParty";
import {
  searchCostCenter,
  searchCostCenterSchema,
  type SearchCostCenterInput,
  type SearchCostCenterOutput,
} from "./searchCostCenter";
import { searchUnit, searchUnitSchema, type SearchUnitInput, type SearchUnitOutput } from "./searchUnit";
import {
  listAvailableUnits,
  listAvailableUnitsSchema,
  type ListAvailableUnitsInput,
  type ListAvailableUnitsOutput,
} from "./listAvailableUnits";
import {
  getPartyBalance,
  getPartyBalanceSchema,
  type GetPartyBalanceInput,
  type GetPartyBalanceOutput,
} from "./getPartyBalance";
import {
  listOpenReservations,
  listOpenReservationsSchema,
  type ListOpenReservationsInput,
  type ListOpenReservationsOutput,
} from "./listOpenReservations";
import {
  getGuestProfile,
  getGuestProfileSchema,
  type GetGuestProfileInput,
  type GetGuestProfileOutput,
} from "./getGuestProfile";
import {
  runSqlQuery,
  runSqlQuerySchema,
  type RunSqlQueryInput,
  type RunSqlQueryOutput,
} from "./runSqlQuery";
import {
  proposeJournalEntry,
  proposeJournalEntrySchema,
  type ProposeJournalEntryInput,
} from "./proposeJournalEntry";
import {
  proposeReservation,
  proposeReservationSchema,
  type ProposeReservationInput,
} from "./proposeReservation";
import {
  proposeMaintenanceRequest,
  proposeMaintenanceRequestSchema,
  type ProposeMaintenanceInput,
} from "./proposeMaintenanceRequest";
import {
  proposeTaskCard,
  proposeTaskCardSchema,
  type ProposeTaskCardInput,
} from "./proposeTaskCard";
import {
  proposePayrollAdvance,
  proposePayrollAdvanceSchema,
  type ProposePayrollAdvanceInput,
} from "./proposePayrollAdvance";
import {
  proposeUnitStatusChange,
  proposeUnitStatusChangeSchema,
  type ProposeUnitStatusChangeInput,
} from "./proposeUnitStatusChange";
import {
  proposeChange,
  proposeChangeSchema,
  type ProposeChangeInput,
} from "./proposeChange";
import { WRITABLE_RESOURCES } from "../control/registry";
import type { ProposedActionPayload } from "../types";

export type {
  AssistantToolContext,
  AssistantToolName,
  AssistantToolResult,
  AssistantToolDef,
} from "../types";
export { ASSISTANT_TOOL_NAMES } from "../types";

interface ToolIO {
  searchAccount: { input: SearchAccountInput; output: SearchAccountOutput };
  searchParty: { input: SearchPartyInput; output: SearchPartyOutput };
  searchCostCenter: { input: SearchCostCenterInput; output: SearchCostCenterOutput };
  searchUnit: { input: SearchUnitInput; output: SearchUnitOutput };
  listAvailableUnits: { input: ListAvailableUnitsInput; output: ListAvailableUnitsOutput };
  getPartyBalance: { input: GetPartyBalanceInput; output: GetPartyBalanceOutput };
  listOpenReservations: { input: ListOpenReservationsInput; output: ListOpenReservationsOutput };
  getGuestProfile: { input: GetGuestProfileInput; output: GetGuestProfileOutput };
  runSqlQuery: { input: RunSqlQueryInput; output: RunSqlQueryOutput };
  proposeJournalEntry: { input: ProposeJournalEntryInput; output: ProposedActionPayload };
  proposeReservation: { input: ProposeReservationInput; output: ProposedActionPayload };
  proposeMaintenanceRequest: { input: ProposeMaintenanceInput; output: ProposedActionPayload };
  proposeTaskCard: { input: ProposeTaskCardInput; output: ProposedActionPayload };
  proposePayrollAdvance: { input: ProposePayrollAdvanceInput; output: ProposedActionPayload };
  proposeUnitStatusChange: { input: ProposeUnitStatusChangeInput; output: ProposedActionPayload };
  proposeChange: { input: ProposeChangeInput; output: ProposedActionPayload };
}

type ToolImpl<Name extends AssistantToolName> = (
  input: ToolIO[Name]["input"],
  ctx: AssistantToolContext,
) => Promise<AssistantToolResult<ToolIO[Name]["output"]>>;

const REGISTRY: { [K in AssistantToolName]: ToolImpl<K> } = {
  searchAccount,
  searchParty,
  searchCostCenter,
  searchUnit,
  listAvailableUnits,
  getPartyBalance,
  listOpenReservations,
  getGuestProfile,
  runSqlQuery,
  proposeJournalEntry,
  proposeReservation,
  proposeMaintenanceRequest,
  proposeTaskCard,
  proposePayrollAdvance,
  proposeUnitStatusChange,
  proposeChange,
};

/**
 * Master catalogue. The `requiredPermission` field drives the tool-gating
 * layer in the engine: a staff member who lacks the permission never sees
 * the corresponding tool schema sent to the LLM.
 *
 * Read tools are open to anyone with `assistant:use` (the API entry guard
 * already enforces that), so their permission is null.
 */
export const ALL_ASSISTANT_TOOLS: AssistantToolDef[] = [
  { name: "searchAccount",       schema: searchAccountSchema,       requiredPermission: null,                          kind: "read" },
  { name: "searchParty",         schema: searchPartySchema,         requiredPermission: null,                          kind: "read" },
  { name: "searchCostCenter",    schema: searchCostCenterSchema,    requiredPermission: null,                          kind: "read" },
  { name: "searchUnit",          schema: searchUnitSchema,          requiredPermission: null,                          kind: "read" },
  { name: "listAvailableUnits",  schema: listAvailableUnitsSchema,  requiredPermission: null,                          kind: "read" },
  { name: "getPartyBalance",     schema: getPartyBalanceSchema,     requiredPermission: null,                          kind: "read" },
  { name: "listOpenReservations",schema: listOpenReservationsSchema,requiredPermission: null,                          kind: "read" },
  { name: "getGuestProfile",     schema: getGuestProfileSchema,     requiredPermission: "guests:view",                 kind: "read" },
  { name: "runSqlQuery",         schema: runSqlQuerySchema,         requiredPermission: "assistant:run_sql",           kind: "read" },
  { name: "proposeJournalEntry", schema: proposeJournalEntrySchema, requiredPermission: "accounting.journal:create",   kind: "propose" },
  { name: "proposeReservation",  schema: proposeReservationSchema,  requiredPermission: "reservations:create",         kind: "propose" },
  { name: "proposeMaintenanceRequest", schema: proposeMaintenanceRequestSchema, requiredPermission: "maintenance:create", kind: "propose" },
  { name: "proposeTaskCard",     schema: proposeTaskCardSchema,     requiredPermission: "tasks.cards:create",          kind: "propose" },
  { name: "proposePayrollAdvance", schema: proposePayrollAdvanceSchema, requiredPermission: "accounting.parties:advance", kind: "propose" },
  { name: "proposeUnitStatusChange", schema: proposeUnitStatusChangeSchema, requiredPermission: "rooms:edit",          kind: "propose" },
  // proposeChange has no fixed required permission — its per-(target, operation)
  // gating is enforced inside the tool itself via WRITABLE_RESOURCES. The
  // engine still drops the tool entirely if the user can't run *any* of
  // the registered ops; see filterToolsByPermissions below.
  { name: "proposeChange",       schema: proposeChangeSchema,       requiredPermission: null,                          kind: "propose" },
];

/** Return only the tool defs the user is permitted to invoke. */
export function filterToolsByPermissions(
  permissions: ReadonlySet<string>,
): AssistantToolDef[] {
  return ALL_ASSISTANT_TOOLS.filter((t) => {
    if (t.name === "proposeChange") {
      // Surface only when at least one writable (target, operation) pair
      // is permitted — otherwise the model would see a powerful tool it
      // can't actually invoke and waste hops.
      return userHasAnyWritableOp(permissions);
    }
    return t.requiredPermission == null || permissions.has(t.requiredPermission);
  });
}

function userHasAnyWritableOp(permissions: ReadonlySet<string>): boolean {
  for (const target of Object.values(WRITABLE_RESOURCES)) {
    for (const op of Object.values(target.operations)) {
      if (permissions.has(op.permission)) return true;
    }
  }
  return false;
}

/**
 * Run a tool by name. The input is `unknown` because it comes from an LLM;
 * each tool validates its own fields. Returns the same `AssistantToolResult`
 * shape every tool produces. Unknown tool names yield an internal error
 * the engine surfaces back to the model.
 */
export async function runAssistantTool(
  name: string,
  input: unknown,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<unknown>> {
  if (!(ASSISTANT_TOOL_NAMES as readonly string[]).includes(name)) {
    return { ok: false, error: { code: "internal", message: `أداة غير معروفة: ${name}` } };
  }
  const impl = REGISTRY[name as AssistantToolName] as ToolImpl<AssistantToolName>;
  try {
    return await impl(input as never, ctx);
  } catch (e) {
    console.error(`[assistant/tools/${name}] uncaught`, e);
    return {
      ok: false,
      error: { code: "internal", message: e instanceof Error ? e.message : "internal error" },
    };
  }
}
