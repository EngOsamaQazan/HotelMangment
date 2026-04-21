/**
 * Comprehensive list of nationalities used across the hotel app.
 *
 * Values are Arabic adjective forms (نسبة) — e.g. "سعودي", "أردني", "مصري" —
 * which align with what our OCR pipeline (`src/app/api/ocr/route.ts`) returns
 * when it recognises a passport/ID nationality field. UI components should use
 * these Arabic strings as both the option value and the default label.
 *
 * Ordering is deliberately biased towards our primary market:
 *   1. GCC (Gulf Cooperation Council)
 *   2. Rest of the Middle East / Arab world
 *   3. Türkiye
 *   4. Iran
 *   5. Rest of Asia
 *   6. Africa → Europe → Americas → Oceania
 *
 * Adding a country? Append it to the correct bucket below and keep entries
 * unique — `ALL_NATIONALITIES` is derived automatically.
 */

export interface CountryOption {
  /** Arabic adjective (نسبة). Used as the <option> value and primary label. */
  value: string;
  /** ISO 3166-1 alpha-2 code (useful for flags / analytics). */
  code: string;
  /** English country name (for secondary search / tooltips). */
  en: string;
  /** Human-friendly Arabic group name (for <optgroup>). */
  group: string;
}

const GROUP = {
  GCC: "دول الخليج العربي",
  MIDDLE_EAST: "دول الشرق الأوسط والعالم العربي",
  TURKIYE: "تركيا",
  IRAN: "إيران",
  ASIA: "آسيا",
  AFRICA: "أفريقيا",
  EUROPE: "أوروبا",
  AMERICAS: "الأمريكيتان",
  OCEANIA: "أوقيانوسيا",
} as const;

const GCC: CountryOption[] = [
  { value: "سعودي",  code: "SA", en: "Saudi Arabia",         group: GROUP.GCC },
  { value: "إماراتي", code: "AE", en: "United Arab Emirates", group: GROUP.GCC },
  { value: "قطري",   code: "QA", en: "Qatar",                group: GROUP.GCC },
  { value: "كويتي",  code: "KW", en: "Kuwait",               group: GROUP.GCC },
  { value: "بحريني", code: "BH", en: "Bahrain",              group: GROUP.GCC },
  { value: "عُماني",  code: "OM", en: "Oman",                 group: GROUP.GCC },
];

const MIDDLE_EAST: CountryOption[] = [
  { value: "أردني",       code: "JO", en: "Jordan",       group: GROUP.MIDDLE_EAST },
  { value: "فلسطيني",     code: "PS", en: "Palestine",    group: GROUP.MIDDLE_EAST },
  { value: "سوري",        code: "SY", en: "Syria",        group: GROUP.MIDDLE_EAST },
  { value: "لبناني",      code: "LB", en: "Lebanon",      group: GROUP.MIDDLE_EAST },
  { value: "عراقي",       code: "IQ", en: "Iraq",         group: GROUP.MIDDLE_EAST },
  { value: "مصري",        code: "EG", en: "Egypt",        group: GROUP.MIDDLE_EAST },
  { value: "يمني",        code: "YE", en: "Yemen",        group: GROUP.MIDDLE_EAST },
  { value: "سوداني",      code: "SD", en: "Sudan",        group: GROUP.MIDDLE_EAST },
  { value: "ليبي",        code: "LY", en: "Libya",        group: GROUP.MIDDLE_EAST },
  { value: "تونسي",       code: "TN", en: "Tunisia",      group: GROUP.MIDDLE_EAST },
  { value: "جزائري",      code: "DZ", en: "Algeria",      group: GROUP.MIDDLE_EAST },
  { value: "مغربي",       code: "MA", en: "Morocco",      group: GROUP.MIDDLE_EAST },
  { value: "موريتاني",    code: "MR", en: "Mauritania",   group: GROUP.MIDDLE_EAST },
  { value: "صومالي",      code: "SO", en: "Somalia",      group: GROUP.MIDDLE_EAST },
  { value: "جيبوتي",      code: "DJ", en: "Djibouti",     group: GROUP.MIDDLE_EAST },
  { value: "قمري",        code: "KM", en: "Comoros",      group: GROUP.MIDDLE_EAST },
];

const TURKIYE: CountryOption[] = [
  { value: "تركي", code: "TR", en: "Türkiye", group: GROUP.TURKIYE },
];

const IRAN: CountryOption[] = [
  { value: "إيراني", code: "IR", en: "Iran", group: GROUP.IRAN },
];

const ASIA: CountryOption[] = [
  { value: "أفغاني",       code: "AF", en: "Afghanistan",  group: GROUP.ASIA },
  { value: "باكستاني",     code: "PK", en: "Pakistan",     group: GROUP.ASIA },
  { value: "هندي",         code: "IN", en: "India",        group: GROUP.ASIA },
  { value: "بنغلاديشي",    code: "BD", en: "Bangladesh",   group: GROUP.ASIA },
  { value: "سريلانكي",     code: "LK", en: "Sri Lanka",    group: GROUP.ASIA },
  { value: "نيبالي",       code: "NP", en: "Nepal",        group: GROUP.ASIA },
  { value: "بوتاني",       code: "BT", en: "Bhutan",       group: GROUP.ASIA },
  { value: "ملديفي",       code: "MV", en: "Maldives",     group: GROUP.ASIA },
  { value: "صيني",         code: "CN", en: "China",        group: GROUP.ASIA },
  { value: "ياباني",       code: "JP", en: "Japan",        group: GROUP.ASIA },
  { value: "كوري جنوبي",   code: "KR", en: "South Korea",  group: GROUP.ASIA },
  { value: "كوري شمالي",   code: "KP", en: "North Korea",  group: GROUP.ASIA },
  { value: "منغولي",       code: "MN", en: "Mongolia",     group: GROUP.ASIA },
  { value: "تايواني",      code: "TW", en: "Taiwan",       group: GROUP.ASIA },
  { value: "هونغ كونغي",   code: "HK", en: "Hong Kong",    group: GROUP.ASIA },
  { value: "فيتنامي",      code: "VN", en: "Vietnam",      group: GROUP.ASIA },
  { value: "لاوسي",        code: "LA", en: "Laos",         group: GROUP.ASIA },
  { value: "كمبودي",       code: "KH", en: "Cambodia",     group: GROUP.ASIA },
  { value: "تايلندي",      code: "TH", en: "Thailand",     group: GROUP.ASIA },
  { value: "ميانماري",     code: "MM", en: "Myanmar",      group: GROUP.ASIA },
  { value: "ماليزي",       code: "MY", en: "Malaysia",     group: GROUP.ASIA },
  { value: "سنغافوري",     code: "SG", en: "Singapore",    group: GROUP.ASIA },
  { value: "إندونيسي",     code: "ID", en: "Indonesia",    group: GROUP.ASIA },
  { value: "فلبيني",       code: "PH", en: "Philippines",  group: GROUP.ASIA },
  { value: "بروني",        code: "BN", en: "Brunei",       group: GROUP.ASIA },
  { value: "تيموري",       code: "TL", en: "Timor-Leste",  group: GROUP.ASIA },
  { value: "كازاخستاني",   code: "KZ", en: "Kazakhstan",   group: GROUP.ASIA },
  { value: "أوزبكي",       code: "UZ", en: "Uzbekistan",   group: GROUP.ASIA },
  { value: "تركمانستاني",  code: "TM", en: "Turkmenistan", group: GROUP.ASIA },
  { value: "قرغيزي",       code: "KG", en: "Kyrgyzstan",   group: GROUP.ASIA },
  { value: "طاجيكي",       code: "TJ", en: "Tajikistan",   group: GROUP.ASIA },
  { value: "أذربيجاني",    code: "AZ", en: "Azerbaijan",   group: GROUP.ASIA },
  { value: "أرمني",        code: "AM", en: "Armenia",      group: GROUP.ASIA },
  { value: "جورجي",        code: "GE", en: "Georgia",      group: GROUP.ASIA },
  { value: "إسرائيلي",     code: "IL", en: "Israel",       group: GROUP.ASIA },
  { value: "قبرصي",        code: "CY", en: "Cyprus",       group: GROUP.ASIA },
];

const AFRICA: CountryOption[] = [
  { value: "نيجيري",           code: "NG", en: "Nigeria",                    group: GROUP.AFRICA },
  { value: "إثيوبي",           code: "ET", en: "Ethiopia",                   group: GROUP.AFRICA },
  { value: "إريتري",           code: "ER", en: "Eritrea",                    group: GROUP.AFRICA },
  { value: "كيني",             code: "KE", en: "Kenya",                      group: GROUP.AFRICA },
  { value: "أوغندي",           code: "UG", en: "Uganda",                     group: GROUP.AFRICA },
  { value: "تنزاني",           code: "TZ", en: "Tanzania",                   group: GROUP.AFRICA },
  { value: "رواندي",           code: "RW", en: "Rwanda",                     group: GROUP.AFRICA },
  { value: "بوروندي",          code: "BI", en: "Burundi",                    group: GROUP.AFRICA },
  { value: "جنوب إفريقي",      code: "ZA", en: "South Africa",               group: GROUP.AFRICA },
  { value: "ناميبي",           code: "NA", en: "Namibia",                    group: GROUP.AFRICA },
  { value: "بوتسواني",         code: "BW", en: "Botswana",                   group: GROUP.AFRICA },
  { value: "زيمبابوي",         code: "ZW", en: "Zimbabwe",                   group: GROUP.AFRICA },
  { value: "زامبي",            code: "ZM", en: "Zambia",                     group: GROUP.AFRICA },
  { value: "مالاوي",           code: "MW", en: "Malawi",                     group: GROUP.AFRICA },
  { value: "موزمبيقي",         code: "MZ", en: "Mozambique",                 group: GROUP.AFRICA },
  { value: "مدغشقري",          code: "MG", en: "Madagascar",                 group: GROUP.AFRICA },
  { value: "موريشي",           code: "MU", en: "Mauritius",                  group: GROUP.AFRICA },
  { value: "سيشلي",            code: "SC", en: "Seychelles",                 group: GROUP.AFRICA },
  { value: "ساحل عاجي",        code: "CI", en: "Côte d'Ivoire",              group: GROUP.AFRICA },
  { value: "غاني",             code: "GH", en: "Ghana",                      group: GROUP.AFRICA },
  { value: "سنغالي",           code: "SN", en: "Senegal",                    group: GROUP.AFRICA },
  { value: "مالي",             code: "ML", en: "Mali",                       group: GROUP.AFRICA },
  { value: "بوركيني",          code: "BF", en: "Burkina Faso",               group: GROUP.AFRICA },
  { value: "نيجري",            code: "NE", en: "Niger",                      group: GROUP.AFRICA },
  { value: "تشادي",            code: "TD", en: "Chad",                       group: GROUP.AFRICA },
  { value: "كاميروني",         code: "CM", en: "Cameroon",                   group: GROUP.AFRICA },
  { value: "كونغولي ديمقراطي", code: "CD", en: "DR Congo",                   group: GROUP.AFRICA },
  { value: "كونغولي",          code: "CG", en: "Congo",                      group: GROUP.AFRICA },
  { value: "غابوني",           code: "GA", en: "Gabon",                      group: GROUP.AFRICA },
  { value: "أنغولي",           code: "AO", en: "Angola",                     group: GROUP.AFRICA },
  { value: "إفريقي وسطى",      code: "CF", en: "Central African Republic",   group: GROUP.AFRICA },
  { value: "غيني",             code: "GN", en: "Guinea",                     group: GROUP.AFRICA },
  { value: "غيني بيساوي",      code: "GW", en: "Guinea-Bissau",              group: GROUP.AFRICA },
  { value: "ليبيري",           code: "LR", en: "Liberia",                    group: GROUP.AFRICA },
  { value: "سيراليوني",        code: "SL", en: "Sierra Leone",               group: GROUP.AFRICA },
  { value: "غامبي",            code: "GM", en: "Gambia",                     group: GROUP.AFRICA },
  { value: "بنيني",            code: "BJ", en: "Benin",                      group: GROUP.AFRICA },
  { value: "توغولي",           code: "TG", en: "Togo",                       group: GROUP.AFRICA },
  { value: "رأس أخضر",         code: "CV", en: "Cape Verde",                 group: GROUP.AFRICA },
  { value: "جنوب سوداني",      code: "SS", en: "South Sudan",                group: GROUP.AFRICA },
  { value: "سان تومي",         code: "ST", en: "São Tomé and Príncipe",      group: GROUP.AFRICA },
  { value: "غيني استوائي",     code: "GQ", en: "Equatorial Guinea",          group: GROUP.AFRICA },
  { value: "لسوتو",            code: "LS", en: "Lesotho",                    group: GROUP.AFRICA },
  { value: "إسواتيني",         code: "SZ", en: "Eswatini",                   group: GROUP.AFRICA },
];

const EUROPE: CountryOption[] = [
  { value: "بريطاني",   code: "GB", en: "United Kingdom",         group: GROUP.EUROPE },
  { value: "أيرلندي",   code: "IE", en: "Ireland",                group: GROUP.EUROPE },
  { value: "فرنسي",     code: "FR", en: "France",                 group: GROUP.EUROPE },
  { value: "ألماني",    code: "DE", en: "Germany",                group: GROUP.EUROPE },
  { value: "إيطالي",    code: "IT", en: "Italy",                  group: GROUP.EUROPE },
  { value: "إسباني",    code: "ES", en: "Spain",                  group: GROUP.EUROPE },
  { value: "برتغالي",   code: "PT", en: "Portugal",               group: GROUP.EUROPE },
  { value: "هولندي",    code: "NL", en: "Netherlands",            group: GROUP.EUROPE },
  { value: "بلجيكي",    code: "BE", en: "Belgium",                group: GROUP.EUROPE },
  { value: "لوكسمبورغي", code: "LU", en: "Luxembourg",            group: GROUP.EUROPE },
  { value: "سويسري",    code: "CH", en: "Switzerland",            group: GROUP.EUROPE },
  { value: "نمساوي",    code: "AT", en: "Austria",                group: GROUP.EUROPE },
  { value: "ليختنشتايني", code: "LI", en: "Liechtenstein",        group: GROUP.EUROPE },
  { value: "سويدي",     code: "SE", en: "Sweden",                 group: GROUP.EUROPE },
  { value: "نرويجي",    code: "NO", en: "Norway",                 group: GROUP.EUROPE },
  { value: "دنماركي",   code: "DK", en: "Denmark",                group: GROUP.EUROPE },
  { value: "فنلندي",    code: "FI", en: "Finland",                group: GROUP.EUROPE },
  { value: "آيسلندي",   code: "IS", en: "Iceland",                group: GROUP.EUROPE },
  { value: "إستوني",    code: "EE", en: "Estonia",                group: GROUP.EUROPE },
  { value: "لاتفي",     code: "LV", en: "Latvia",                 group: GROUP.EUROPE },
  { value: "ليتواني",   code: "LT", en: "Lithuania",              group: GROUP.EUROPE },
  { value: "بولندي",    code: "PL", en: "Poland",                 group: GROUP.EUROPE },
  { value: "تشيكي",     code: "CZ", en: "Czech Republic",         group: GROUP.EUROPE },
  { value: "سلوفاكي",   code: "SK", en: "Slovakia",               group: GROUP.EUROPE },
  { value: "مجري",      code: "HU", en: "Hungary",                group: GROUP.EUROPE },
  { value: "روماني",    code: "RO", en: "Romania",                group: GROUP.EUROPE },
  { value: "بلغاري",    code: "BG", en: "Bulgaria",               group: GROUP.EUROPE },
  { value: "مولدوفي",   code: "MD", en: "Moldova",                group: GROUP.EUROPE },
  { value: "أوكراني",   code: "UA", en: "Ukraine",                group: GROUP.EUROPE },
  { value: "بيلاروسي",  code: "BY", en: "Belarus",                group: GROUP.EUROPE },
  { value: "روسي",      code: "RU", en: "Russia",                 group: GROUP.EUROPE },
  { value: "يوناني",    code: "GR", en: "Greece",                 group: GROUP.EUROPE },
  { value: "ألباني",    code: "AL", en: "Albania",                group: GROUP.EUROPE },
  { value: "مقدوني",    code: "MK", en: "North Macedonia",        group: GROUP.EUROPE },
  { value: "كوسوفي",    code: "XK", en: "Kosovo",                 group: GROUP.EUROPE },
  { value: "صربي",      code: "RS", en: "Serbia",                 group: GROUP.EUROPE },
  { value: "مونتنيغري", code: "ME", en: "Montenegro",             group: GROUP.EUROPE },
  { value: "بوسني",     code: "BA", en: "Bosnia and Herzegovina", group: GROUP.EUROPE },
  { value: "كرواتي",    code: "HR", en: "Croatia",                group: GROUP.EUROPE },
  { value: "سلوفيني",   code: "SI", en: "Slovenia",               group: GROUP.EUROPE },
  { value: "مالطي",     code: "MT", en: "Malta",                  group: GROUP.EUROPE },
  { value: "أندوري",    code: "AD", en: "Andorra",                group: GROUP.EUROPE },
  { value: "موناكي",    code: "MC", en: "Monaco",                 group: GROUP.EUROPE },
  { value: "سان ماريني", code: "SM", en: "San Marino",            group: GROUP.EUROPE },
  { value: "فاتيكاني",  code: "VA", en: "Vatican City",           group: GROUP.EUROPE },
];

const AMERICAS: CountryOption[] = [
  { value: "أمريكي",            code: "US", en: "United States",                 group: GROUP.AMERICAS },
  { value: "كندي",              code: "CA", en: "Canada",                        group: GROUP.AMERICAS },
  { value: "مكسيكي",            code: "MX", en: "Mexico",                        group: GROUP.AMERICAS },
  { value: "غواتيمالي",         code: "GT", en: "Guatemala",                     group: GROUP.AMERICAS },
  { value: "بليزي",             code: "BZ", en: "Belize",                        group: GROUP.AMERICAS },
  { value: "سلفادوري",          code: "SV", en: "El Salvador",                   group: GROUP.AMERICAS },
  { value: "هندوراسي",          code: "HN", en: "Honduras",                      group: GROUP.AMERICAS },
  { value: "نيكاراغوي",         code: "NI", en: "Nicaragua",                     group: GROUP.AMERICAS },
  { value: "كوستاريكي",         code: "CR", en: "Costa Rica",                    group: GROUP.AMERICAS },
  { value: "بنمي",              code: "PA", en: "Panama",                        group: GROUP.AMERICAS },
  { value: "كوبي",              code: "CU", en: "Cuba",                          group: GROUP.AMERICAS },
  { value: "هايتي",             code: "HT", en: "Haiti",                         group: GROUP.AMERICAS },
  { value: "دومينيكي",          code: "DO", en: "Dominican Republic",            group: GROUP.AMERICAS },
  { value: "جامايكي",           code: "JM", en: "Jamaica",                       group: GROUP.AMERICAS },
  { value: "ترينيدادي",         code: "TT", en: "Trinidad and Tobago",           group: GROUP.AMERICAS },
  { value: "باهامي",            code: "BS", en: "Bahamas",                       group: GROUP.AMERICAS },
  { value: "بربادوسي",          code: "BB", en: "Barbados",                      group: GROUP.AMERICAS },
  { value: "بورتوريكي",         code: "PR", en: "Puerto Rico",                   group: GROUP.AMERICAS },
  { value: "كولومبي",           code: "CO", en: "Colombia",                      group: GROUP.AMERICAS },
  { value: "فنزويلي",           code: "VE", en: "Venezuela",                     group: GROUP.AMERICAS },
  { value: "إكوادوري",          code: "EC", en: "Ecuador",                       group: GROUP.AMERICAS },
  { value: "بيروفي",            code: "PE", en: "Peru",                          group: GROUP.AMERICAS },
  { value: "بوليفي",            code: "BO", en: "Bolivia",                       group: GROUP.AMERICAS },
  { value: "شيلي",              code: "CL", en: "Chile",                         group: GROUP.AMERICAS },
  { value: "أرجنتيني",          code: "AR", en: "Argentina",                     group: GROUP.AMERICAS },
  { value: "أوروغواياني",       code: "UY", en: "Uruguay",                       group: GROUP.AMERICAS },
  { value: "باراغواياني",       code: "PY", en: "Paraguay",                      group: GROUP.AMERICAS },
  { value: "برازيلي",           code: "BR", en: "Brazil",                        group: GROUP.AMERICAS },
  { value: "غياني",             code: "GY", en: "Guyana",                        group: GROUP.AMERICAS },
  { value: "سورينامي",          code: "SR", en: "Suriname",                      group: GROUP.AMERICAS },
];

const OCEANIA: CountryOption[] = [
  { value: "أسترالي",      code: "AU", en: "Australia",        group: GROUP.OCEANIA },
  { value: "نيوزيلندي",    code: "NZ", en: "New Zealand",      group: GROUP.OCEANIA },
  { value: "بابواني",      code: "PG", en: "Papua New Guinea", group: GROUP.OCEANIA },
  { value: "فيجي",         code: "FJ", en: "Fiji",             group: GROUP.OCEANIA },
  { value: "ساموي",        code: "WS", en: "Samoa",            group: GROUP.OCEANIA },
  { value: "تونغي",        code: "TO", en: "Tonga",            group: GROUP.OCEANIA },
  { value: "فانواتي",      code: "VU", en: "Vanuatu",          group: GROUP.OCEANIA },
  { value: "سليماني",      code: "SB", en: "Solomon Islands",  group: GROUP.OCEANIA },
  { value: "ميكرونيزي",    code: "FM", en: "Micronesia",       group: GROUP.OCEANIA },
  { value: "بالاوي",       code: "PW", en: "Palau",            group: GROUP.OCEANIA },
  { value: "مارشالي",      code: "MH", en: "Marshall Islands", group: GROUP.OCEANIA },
  { value: "ناوروي",       code: "NR", en: "Nauru",            group: GROUP.OCEANIA },
  { value: "توفالوي",      code: "TV", en: "Tuvalu",           group: GROUP.OCEANIA },
  { value: "كيريباتي",     code: "KI", en: "Kiribati",         group: GROUP.OCEANIA },
];

/**
 * All nationalities, ordered so that common options for this hotel's market
 * appear first. Within each region, the list retains the hand-picked order
 * above (primary neighbours first) rather than strict alphabetical.
 */
export const ALL_NATIONALITIES: readonly CountryOption[] = [
  ...GCC,
  ...MIDDLE_EAST,
  ...TURKIYE,
  ...IRAN,
  ...ASIA,
  ...AFRICA,
  ...EUROPE,
  ...AMERICAS,
  ...OCEANIA,
];

/**
 * Nationalities grouped by region for rendering as <optgroup> blocks.
 * The iteration order of the Map is the display order.
 */
export const NATIONALITIES_BY_GROUP: ReadonlyMap<string, CountryOption[]> = (() => {
  const map = new Map<string, CountryOption[]>();
  for (const c of ALL_NATIONALITIES) {
    const arr = map.get(c.group);
    if (arr) arr.push(c);
    else map.set(c.group, [c]);
  }
  return map;
})();

/** Look up a country by its Arabic adjective (case-sensitive exact match). */
export function findNationality(value: string | null | undefined): CountryOption | null {
  if (!value) return null;
  const trimmed = value.trim();
  return ALL_NATIONALITIES.find((c) => c.value === trimmed) ?? null;
}
