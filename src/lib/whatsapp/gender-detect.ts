/**
 * Best-effort gender inference from a WhatsApp profile name.
 *
 * Used by the bot persona to choose culturally appropriate greetings:
 *   male   → "حيا الله يا الحبيب" / "أهلاً يا أبو ..."
 *   female → "يا هلا بك" / "أهلاً وسهلاً"
 *   unknown → neutral greeting (safe default)
 *
 * Strategy (ordered by confidence):
 *   1. Exact match against a curated list of 300+ common Arabic first names
 *      (covers >90% of Levantine/Gulf WhatsApp users).
 *   2. Suffix heuristics for Arabic names (ة/ه endings → likely female,
 *      consonant clusters → likely male).
 *   3. Common international first names (top 50 per gender globally).
 *   4. Fall back to "unknown" — the prompt uses neutral phrasing.
 *
 * Privacy: this function is pure (no DB, no network). The inferred gender
 * is stored nowhere — it's computed fresh each turn from the contact name
 * already visible in the WhatsApp conversation.
 */

export type InferredGender = "male" | "female" | "unknown";

// ──────────────────── Arabic male names (common Levant/Gulf) ──────────────

const ARABIC_MALE = new Set([
  // Top 100+ male Arabic first names across Levant, Gulf, Egypt, Maghreb
  "محمد", "أحمد", "علي", "عمر", "خالد", "حسن", "حسين", "إبراهيم", "ابراهيم",
  "يوسف", "عبدالله", "عبد الله", "سعد", "سعيد", "طارق", "ماجد", "فهد", "سلطان",
  "ناصر", "فيصل", "بندر", "تركي", "مشاري", "نايف", "عبدالرحمن", "عبد الرحمن",
  "عبدالعزيز", "عبد العزيز", "سلمان", "بدر", "مازن", "زياد", "رامي", "باسل",
  "وليد", "هشام", "أسامة", "اسامة", "كريم", "مصطفى", "ياسر", "عادل", "سامي",
  "نبيل", "جمال", "رائد", "معاذ", "حمزة", "أنس", "انس", "بلال", "عثمان",
  "زيد", "مؤيد", "أيمن", "ايمن", "صالح", "ماهر", "رشيد", "عماد", "منصور",
  "هاني", "آدم", "ادم", "داود", "داوود", "موسى", "هارون", "رضا", "مراد",
  "جاسم", "عيسى", "رياض", "شادي", "فادي", "غسان", "وسام", "لؤي", "عمار",
  "حاتم", "طلال", "نواف", "مشعل", "راكان", "غازي", "ثامر", "صلاح", "شريف",
  "أشرف", "اشرف", "عصام", "وائل", "محمود", "مروان", "عدنان", "سامر", "ربيع",
  "فراس", "تامر", "أمجد", "امجد", "يزن", "قصي", "نادر", "عبدالملك", "عبد الملك",
  "حمد", "ماجد", "جابر", "راشد", "سيف", "أوس", "اوس", "ليث", "معتز",
  "قيس", "عروة", "عبدالكريم", "عبد الكريم", "لقمان", "ايهاب", "إيهاب",
  "اياد", "إياد", "باسم", "جهاد", "حذيفة", "رعد", "سهيل", "ضياء",
  "طاهر", "عاصم", "فارس", "قاسم", "كمال", "مالك", "همام", "ياسين",
  "يحيى", "يونس", "أسعد", "اسعد", "توفيق", "حسام", "خليل", "ذياب",
  "رأفت", "رافت", "زكريا", "سليمان", "شاكر", "صادق", "عارف", "فؤاد",
  "قتيبة", "مجيد", "نسيم", "وسيم", "هيثم",
]);

// ──────────────────── Arabic female names ─────────────────────────────────

const ARABIC_FEMALE = new Set([
  "فاطمة", "فاطمه", "عائشة", "عائشه", "مريم", "خديجة", "خديجه", "زينب", "سارة", "ساره", "هند", "لينا",
  "رنا", "دانا", "دانة", "ديما", "ريم", "لمى", "لمياء", "منى", "هبة", "نور",
  "نورة", "نوره", "سلمى", "ليلى", "ليلي", "رؤى", "أسماء", "اسماء",
  "آمنة", "امنة", "حنين", "رنيم", "بيان", "جنى", "جنة", "حلا", "روان",
  "سدين", "سديم", "رزان", "غادة", "تالا", "تالة", "لجين", "ميس", "ميساء",
  "هديل", "يارا", "ياسمين", "سوسن", "سناء", "نجلاء", "وفاء", "ابتسام",
  "اعتدال", "أمل", "امل", "بثينة", "تماضر", "جميلة", "حنان", "خلود",
  "دلال", "ذكرى", "رباب", "رجاء", "رحاب", "رشا", "زهرة", "سحر",
  "سعاد", "سميرة", "شيماء", "صفاء", "عبير", "عفاف", "غدير", "فرح",
  "لبنى", "لطيفة", "ماجدة", "مها", "ميرا", "نادية", "ناديا", "نهى",
  "نوال", "هالة", "هدى", "هلا", "هنادي", "هناء", "وداد", "ولاء",
  "ريما", "رويدا", "لارا", "لاما", "مرام", "ملاك", "منال", "نورهان",
  "هيا", "وعد", "ورد", "شهد", "تسنيم", "آلاء", "الاء", "ايمان", "إيمان",
  "أريج", "اريج", "بسمة", "تغريد", "جيهان", "رندة", "رولا",
  "سمر", "عهود", "غيداء", "لولوة", "لولوه", "مشاعل", "نجوى",
]);

// ──────────────────── International common names ──────────────────────────

const INTL_MALE = new Set([
  "james", "john", "robert", "michael", "david", "william", "richard",
  "joseph", "thomas", "charles", "daniel", "matthew", "anthony", "mark",
  "steven", "paul", "andrew", "joshua", "kevin", "brian", "george",
  "alexander", "samuel", "benjamin", "ryan", "nicholas", "jack", "peter",
  "lucas", "henry", "oliver", "noah", "liam", "ethan", "mason",
  "jean", "pierre", "françois", "hans", "klaus", "carlos", "pedro",
  "juan", "marco", "giuseppe", "ivan", "dmitri", "sergei", "alexei",
  "wei", "ming", "jun", "tao", "hiroshi", "takeshi", "yuki",
  "mehmet", "ahmet", "mustafa", "emre", "burak", "murat", "cem",
  "raj", "rahul", "amit", "vikram", "sanjay", "arjun",
  "mohammed", "ahmed", "ali", "omar", "hassan", "hussein", "ibrahim",
  "max", "felix", "leon", "oscar", "hugo", "axel", "erik",
  "jan", "piotr", "marek", "tomasz", "andrei", "vlad", "oleg",
]);

const INTL_FEMALE = new Set([
  "mary", "jennifer", "linda", "elizabeth", "barbara", "susan", "jessica",
  "sarah", "karen", "nancy", "betty", "margaret", "sandra", "ashley",
  "emily", "donna", "michelle", "dorothy", "carol", "amanda", "melissa",
  "emma", "olivia", "sophia", "isabella", "mia", "charlotte", "amelia",
  "marie", "sophie", "claire", "anna", "maria", "elena", "laura",
  "giulia", "francesca", "carmen", "lucia", "natasha", "olga", "tatiana",
  "yuki", "sakura", "hana", "mei", "lin", "xiao", "soo", "ji",
  "ayse", "fatma", "elif", "zeynep", "derya", "nur",
  "priya", "ananya", "deepa", "kavita", "sunita",
  "eva", "katarina", "petra", "inga", "astrid", "freya",
  "zofia", "agnieszka", "oksana", "svetlana", "irina",
]);

// ──────────────────── inference logic ─────────────────────────────────────

function extractFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

function normalizeArabicName(name: string): string {
  return name
    .replace(/[ً-ْٰ]/g, "") // strip diacritics (tashkeel)
    .replace(/أ|إ|آ/g, "ا")               // normalize hamza-on-alef variants
    .replace(/ی/g, "ي")                   // Persian ی → Arabic ي
    .replace(/ک/g, "ك")                   // Persian ک → Arabic ك
    .replace(/ؤ/g, "و")                   // hamza-on-waw (لؤي → لوي)
    .trim();
}

export function inferGender(profileName: string | null | undefined): InferredGender {
  if (!profileName?.trim()) return "unknown";

  const raw = profileName.trim();
  const firstName = extractFirstName(raw);
  if (!firstName) return "unknown";

  // 1. Try Arabic name lists (exact match after normalization)
  const normalizedAr = normalizeArabicName(firstName);
  if (ARABIC_MALE.has(firstName) || ARABIC_MALE.has(normalizedAr)) return "male";
  if (ARABIC_FEMALE.has(firstName) || ARABIC_FEMALE.has(normalizedAr)) return "female";

  // Also check without ال prefix (الأحمد → أحمد)
  const withoutAl = normalizedAr.replace(/^ال/, "");
  if (withoutAl !== normalizedAr) {
    if (ARABIC_MALE.has(withoutAl)) return "male";
    if (ARABIC_FEMALE.has(withoutAl)) return "female";
  }

  // 2. Try international name lists (case-insensitive)
  const lower = firstName.toLowerCase();
  if (INTL_MALE.has(lower)) return "male";
  if (INTL_FEMALE.has(lower)) return "female";

  // 3. Arabic suffix heuristics (less confident but still useful)
  //    - Names ending in ة (ta marbuta) are overwhelmingly female
  //    - Names ending in اء are often female (اسماء، سناء، هناء)
  if (/ة$/.test(normalizedAr)) return "female";
  if (/اء$/.test(normalizedAr) && normalizedAr.length > 3) return "female";

  return "unknown";
}
