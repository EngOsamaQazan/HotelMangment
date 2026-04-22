/**
 * International dialing codes keyed by ISO 3166-1 alpha-2 country code.
 *
 * Kept separate from `countries.ts` so the (large) phone-code table doesn't
 * weigh on every screen that only needs a nationality label. Use
 * `dialCodeFor(code)` to look up a "+XXX" string, or `dialCodeForNationality`
 * to resolve it directly from an Arabic nationality adjective (as produced by
 * our OCR pipeline and stored on reservations).
 */
import { findNationality } from "@/lib/countries";

const DIAL_CODES: Record<string, string> = {
  // GCC
  SA: "+966", AE: "+971", QA: "+974", KW: "+965", BH: "+973", OM: "+968",
  // Middle East / Arab world
  JO: "+962", PS: "+970", SY: "+963", LB: "+961", IQ: "+964", EG: "+20",
  YE: "+967", SD: "+249", LY: "+218", TN: "+216", DZ: "+213", MA: "+212",
  MR: "+222", SO: "+252", DJ: "+253", KM: "+269",
  // Türkiye / Iran
  TR: "+90", IR: "+98",
  // Asia
  AF: "+93", PK: "+92", IN: "+91", BD: "+880", LK: "+94", NP: "+977",
  BT: "+975", MV: "+960", CN: "+86", JP: "+81", KR: "+82", KP: "+850",
  MN: "+976", TW: "+886", HK: "+852", VN: "+84", LA: "+856", KH: "+855",
  TH: "+66", MM: "+95", MY: "+60", SG: "+65", ID: "+62", PH: "+63",
  BN: "+673", TL: "+670", KZ: "+7", UZ: "+998", TM: "+993", KG: "+996",
  TJ: "+992", AZ: "+994", AM: "+374", GE: "+995", IL: "+972", CY: "+357",
  // Africa
  NG: "+234", ET: "+251", ER: "+291", KE: "+254", UG: "+256", TZ: "+255",
  RW: "+250", BI: "+257", ZA: "+27", NA: "+264", BW: "+267", ZW: "+263",
  ZM: "+260", MW: "+265", MZ: "+258", MG: "+261", MU: "+230", SC: "+248",
  CI: "+225", GH: "+233", SN: "+221", ML: "+223", BF: "+226", NE: "+227",
  TD: "+235", CM: "+237", CD: "+243", CG: "+242", GA: "+241", AO: "+244",
  CF: "+236", GN: "+224", GW: "+245", LR: "+231", SL: "+232", GM: "+220",
  BJ: "+229", TG: "+228", CV: "+238", SS: "+211", ST: "+239", GQ: "+240",
  LS: "+266", SZ: "+268",
  // Europe
  GB: "+44", IE: "+353", FR: "+33", DE: "+49", IT: "+39", ES: "+34",
  PT: "+351", NL: "+31", BE: "+32", LU: "+352", CH: "+41", AT: "+43",
  LI: "+423", SE: "+46", NO: "+47", DK: "+45", FI: "+358", IS: "+354",
  EE: "+372", LV: "+371", LT: "+370", PL: "+48", CZ: "+420", SK: "+421",
  HU: "+36", RO: "+40", BG: "+359", MD: "+373", UA: "+380", BY: "+375",
  RU: "+7", GR: "+30", AL: "+355", MK: "+389", XK: "+383", RS: "+381",
  ME: "+382", BA: "+387", HR: "+385", SI: "+386", MT: "+356", AD: "+376",
  MC: "+377", SM: "+378", VA: "+379",
  // Americas
  US: "+1", CA: "+1", MX: "+52", GT: "+502", BZ: "+501", SV: "+503",
  HN: "+504", NI: "+505", CR: "+506", PA: "+507", CU: "+53", HT: "+509",
  DO: "+1-809", JM: "+1-876", TT: "+1-868", BS: "+1-242", BB: "+1-246",
  PR: "+1-787", CO: "+57", VE: "+58", EC: "+593", PE: "+51", BO: "+591",
  CL: "+56", AR: "+54", UY: "+598", PY: "+595", BR: "+55", GY: "+592",
  SR: "+597",
  // Oceania
  AU: "+61", NZ: "+64", PG: "+675", FJ: "+679", WS: "+685", TO: "+676",
  VU: "+678", SB: "+677", FM: "+691", PW: "+680", MH: "+692", NR: "+674",
  TV: "+688", KI: "+686",
};

export function dialCodeFor(isoCode: string | null | undefined): string {
  if (!isoCode) return "";
  return DIAL_CODES[isoCode.toUpperCase()] ?? "";
}

/**
 * Resolve a "+XXX" dial code from an Arabic nationality adjective
 * (e.g. "أردني" → "+962"). Returns "" when the nationality is unknown.
 */
export function dialCodeForNationality(
  nationality: string | null | undefined,
): string {
  const country = findNationality(nationality);
  if (!country) return "";
  return dialCodeFor(country.code);
}
