/**
 * Legacy "room" | "apartment" string derivation.
 *
 * Background: the `Unit` table used to carry a denormalized `unit_type`
 * column whose only valid values were `"room"` or `"apartment"`. Phase 4
 * of the unit-types redesign drops that column entirely; the canonical
 * source is now `Unit.unitTypeId → UnitType.category`.
 *
 * Several legacy API responses, contracts and PDFs still expose the
 * coarse "room/apartment" classification (it is more readable than a
 * full UnitType code). To keep those payloads stable we derive the
 * value here from `category`.
 *
 * Mapping rule:
 *   - UnitType.category === "apartment"  → "apartment"
 *   - anything else (hotel_room, suite, studio, null/unknown) → "room"
 *
 * The fallback to `"room"` is intentional: pre-migration the column
 * defaulted to `"room"` for unknown rows, and downstream label maps
 * (`unitTypeLabels`, `unitTypeLabel`) only know about those two keys.
 */
export type LegacyUnitType = "room" | "apartment";

/** Derive the legacy two-value classification from a UnitType-like input. */
export function legacyTypeFromCategory(
  category: string | null | undefined,
): LegacyUnitType {
  return category === "apartment" ? "apartment" : "room";
}

/** Shape we minimally need from a UnitType row to derive the legacy value. */
type UnitTypeRefLite = { category?: string | null } | null | undefined;

/** Convenience overload accepting `{ category }`-shaped objects (or null). */
export function legacyTypeFromUnitTypeRef(
  ref: UnitTypeRefLite,
): LegacyUnitType {
  return legacyTypeFromCategory(ref?.category);
}

/**
 * Re-shape a Unit (or any record carrying `unitTypeRef`) so callers that
 * expect the historical `unitType: "room" | "apartment"` field keep
 * working after the column is dropped from the schema. The relation
 * **must** already be included by the caller (via `include` or `select`)
 * — we don't re-fetch.
 */
export function withLegacyUnitType<
  U extends { unitTypeRef?: UnitTypeRefLite },
>(unit: U): U & { unitType: LegacyUnitType } {
  return { ...unit, unitType: legacyTypeFromUnitTypeRef(unit.unitTypeRef) };
}

/**
 * Re-shape a reservation-like record by attaching a derived `unit.unitType`
 * field. Returns a shallow copy when the reservation has a unit; otherwise
 * passes the input through unchanged.
 */
export function withLegacyUnitTypeOnReservation<
  R extends {
    unit?: { unitTypeRef?: UnitTypeRefLite } | null;
  },
>(reservation: R): R {
  if (!reservation.unit) return reservation;
  return {
    ...reservation,
    unit: withLegacyUnitType(reservation.unit),
  };
}
