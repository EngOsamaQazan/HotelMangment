import { NextRequest, NextResponse } from "next/server";
import * as vision from "@google-cloud/vision";
import path from "path";

const keyPath = path.resolve(process.cwd(), "google-vision-key.json");

let client: vision.ImageAnnotatorClient | null = null;
function getClient() {
  if (!client) {
    client = new vision.ImageAnnotatorClient({ keyFilename: keyPath });
  }
  return client;
}

const CC_TO_AR: Record<string, string> = {
  JOR: "أردني", EGY: "مصري", EGP: "مصري", SAU: "سعودي", SYR: "سوري",
  IRQ: "عراقي", PSE: "فلسطيني", LBN: "لبناني", KWT: "كويتي", ARE: "إماراتي",
  BHR: "بحريني", QAT: "قطري", OMN: "عماني", YEM: "يمني", LBY: "ليبي",
  TUN: "تونسي", DZA: "جزائري", MAR: "مغربي", SDN: "سوداني", IND: "هندي",
  PAK: "باكستاني", IRN: "إيراني", ISR: "فلسطيني", TUR: "تركي",
  GBR: "بريطاني", USA: "أمريكي", FRA: "فرنسي", DEU: "ألماني",
  BGD: "بنغلاديشي", PHL: "فلبيني", IDN: "إندونيسي", NPL: "نيبالي",
  LKA: "سريلانكي", ETH: "إثيوبي",
};

const NAT_PHRASES: [string, string][] = [
  ["SYRIAN", "سوري"], ["JORDANIAN", "أردني"], ["EGYPTIAN", "مصري"],
  ["IRAQI", "عراقي"], ["PALESTINIAN", "فلسطيني"], ["LEBANESE", "لبناني"],
  ["KUWAITI", "كويتي"], ["EMIRATI", "إماراتي"], ["OMANI", "عماني"],
  ["IRANIAN", "إيراني"], ["TURKISH", "تركي"], ["ISRAELI", "فلسطيني"],
  ["SAUDI ARABIAN", "سعودي"], ["SAUDI ARABIA", "سعودي"], ["SAUDI", "سعودي"],
];

const AR_NAT_PHRASES: [string, string][] = [
  ["السورية", "سوري"], ["الأردنية", "أردني"], ["المصرية", "مصري"],
  ["العراقية", "عراقي"], ["الفلسطينية", "فلسطيني"], ["اللبنانية", "لبناني"],
  ["الكويتية", "كويتي"], ["الإماراتية", "إماراتي"], ["العمانية", "عماني"],
  ["الإيرانية", "إيراني"], ["التركية", "تركي"],
  ["أردني", "أردني"], ["مصري", "مصري"], ["سوري", "سوري"],
  ["عراقي", "عراقي"], ["فلسطيني", "فلسطيني"], ["لبناني", "لبناني"],
  ["كويتي", "كويتي"], ["إماراتي", "إماراتي"], ["عماني", "عماني"],
  ["سعودي", "سعودي"],
];

const AR_LABEL_SKIP = new Set([
  "جمهورية", "مملكة", "دولة", "جواز", "سفر", "هوية", "الجنسية",
  "تاريخ", "الميلاد", "وزارة", "الداخلية", "الأحوال", "المدنية",
  "سجل", "الأسرة", "توقيع", "صاحب", "صدور", "مكان", "محل",
  "الإصدار", "الانتهاء", "نوع", "رقم", "إسلامي", "العربية",
  "الهاشمية", "المتحدة", "الأردنية", "سلطنة", "السعودية",
  "المملكة", "جوازسفر", "إيران", "الصلاحية", "ولادة", "الحامل",
  "مدينة", "قنصلية", "سفارة", "إصدار", "النسبة", "امضاء",
  "دارنده", "گذرنامه", "کشور", "استانبول", "صادر", "کننده",
  "إمالة", "يمينا", "ويسارا", "تأثرات", "الإمالة", "تأث",
  "الأب", "الآب", "جمهور", "اسلام", "قسم", "الأم",
  "خانوادگی", "محمود", "حسنه", "حصنه",
  "الوظيفة", "المهنة", "معهد", "شعائر", "الموقف", "التجنيدى",
  "التجنيد", "العنوان", "القومي", "يشمل", "صفحة",
  "الرحمانية", "البحيرة", "الإمدار", "الإنتهاء", "مليه",
  "سلامهم", "بحيرة",
]);

function arabicToWestern(text: string): string {
  const map: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  return text.replace(/[٠-٩۰-۹]/g, ch => map[ch] || ch);
}

function parseMRZ(text: string) {
  const lines = text.split("\n");
  const candidates: string[] = [];
  for (const raw of lines) {
    const stripped = raw.replace(/\s/g, "").toUpperCase();
    const clean = stripped.replace(/[^A-Z0-9<]/g, "");
    if (clean.length >= 30 && /^[A-Z0-9<]+$/.test(clean)) {
      candidates.push(clean);
    }
  }

  let l1 = "", l2 = "";
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    if (c.startsWith("P<") || (c[0] === "P" && c.length >= 40)) {
      l1 = c;
      if (l1[1] !== "<") l1 = "P<" + l1.slice(2);
      if (i + 1 < candidates.length) l2 = candidates[i + 1];
      break;
    }
  }
  if (!l1) return null;

  const result: { fullName?: string; idNumber?: string; nationality?: string } = {};
  const cc = l1.substring(2, 5).replace(/</g, "");
  if (cc.length >= 2 && cc.length <= 3) result.nationality = CC_TO_AR[cc] || cc;

  const names = l1.substring(5);
  const parts = names.split("<<").filter(p => p.length > 0);
  if (parts.length >= 1) {
    const surname = parts[0].replace(/</g, " ").trim();
    const given = parts.slice(1).map(p => p.replace(/</g, " ").trim()).join(" ");
    if (surname.length >= 2) {
      result.fullName = given ? `${given} ${surname}` : surname;
      result.fullName = result.fullName.replace(/\s+/g, " ").trim();
    }
  }

  if (l2 && l2.length >= 20) {
    const m = l2.replace(/<+$/, "").match(/^([A-Z0-9]{5,12})/);
    if (m) result.idNumber = m[1].replace(/<+$/, "");
  }

  return result;
}

function extractFromText(text: string) {
  const result: {
    arabicName?: string;
    engName?: string;
    idNumber?: string;
    nationality?: string;
  } = {};

  const westernText = arabicToWestern(text);
  const lines = westernText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const upper = westernText.toUpperCase();

  // ── ARABIC NAME (labeled "الاسم" / "الإسم") ──
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/[\u0621-\u064A]/.test(line)) continue;
    for (const label of ["الاسم", "الإسم"]) {
      const idx = line.indexOf(label);
      if (idx === -1) continue;
      const after = line.substring(idx + label.length)
        .replace(/[/:：_\-=|,]/g, " ")
        .replace(/[^\u0621-\u064A\s]/g, " ")
        .replace(/\s+/g, " ").trim();
      const words = after.split(/\s+/).filter(w => w.length >= 2);
      if (words.length >= 2 && words.length <= 8) {
        result.arabicName = words.join(" ");
        break;
      }

      // Label on its own line → look at next Arabic lines
      if (words.length < 2) {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          if (!/[\u0621-\u064A]/.test(lines[j])) continue;
          const nextCleaned = lines[j]
            .replace(/[^\u0621-\u064A\s]/g, " ")
            .replace(/\s+/g, " ").trim();
          const nextWords = nextCleaned.split(/\s+/).filter(w => w.length >= 2);
          if (nextWords.length >= 2 && nextWords.length <= 8) {
            result.arabicName = nextWords.join(" ");
            break;
          }
        }
      }
    }
    if (result.arabicName) break;
  }

  // ── ARABIC NAME (candidate from text) ──
  if (!result.arabicName) {
    const candidates: { text: string; len: number }[] = [];
    for (const line of lines) {
      if (!/[\u0621-\u064A]/.test(line)) continue;
      const cleaned = line.replace(/[^\u0621-\u064A\s]/g, " ").replace(/\s+/g, " ").trim();
      const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
      if (words.length < 2 || words.length > 7 || cleaned.length < 6) continue;

      const arabicChars = (cleaned.match(/[\u0621-\u064A]/g) || []).length;
      const totalChars = cleaned.replace(/\s/g, "").length;
      if (totalChars === 0 || arabicChars / totalChars < 0.8) continue;

      const singleChars = cleaned.split(/\s+/).filter(w => w.length === 1).length;
      if (singleChars > 1) continue;

      const hasSkip = words.some(w => AR_LABEL_SKIP.has(w));
      if (hasSkip) continue;

      candidates.push({ text: cleaned, len: cleaned.length });
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.len - a.len);
      result.arabicName = candidates[0].text;
    }
  }

  // ── ENGLISH NAME (Surname + Given name) ──
  let surname = "", given = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\bSurname\b|\burname\b|\bSumme\b/i.test(line) && !surname) {
      const after = line.replace(/.*(?:Surname|urname|Summe)\s*[/:]?\s*/i, "")
        .replace(/[\u0621-\u064A\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g, "")
        .replace(/[^a-zA-Z\s]/g, "").trim();
      if (after.length >= 2 && /^[A-Z\s]+$/i.test(after)) {
        surname = after.toUpperCase();
      } else if (i + 1 < lines.length) {
        const n = lines[i + 1].replace(/[^a-zA-Z\s]/g, "").trim();
        if (n.length >= 2 && /^[A-Z\s]+$/i.test(n)) surname = n.toUpperCase();
      }
    }
    if (/Given\s*name|iven\s*name/i.test(line) && !given) {
      const after = line.replace(/.*(?:Given\s*name|iven\s*name)\s*[/:]?\s*/i, "")
        .replace(/[\u0621-\u064A\u0600-\u06FF]/g, "")
        .replace(/[^a-zA-Z\s]/g, "").trim();
      if (after.length >= 2 && /^[A-Z\s]+$/i.test(after)) {
        given = after.toUpperCase();
      } else if (i + 1 < lines.length) {
        const n = lines[i + 1].replace(/[^a-zA-Z\s]/g, "").trim();
        if (n.length >= 2 && /^[A-Z\s]+$/i.test(n)) given = n.toUpperCase();
      }
    }
  }
  if (surname || given) {
    result.engName = [given, surname].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  if (!result.engName) {
    for (const line of lines) {
      if (/\bName\b/i.test(line) && !/Surname|Given|Father|Mother|Place|Mether/i.test(line)) {
        const after = line.replace(/.*\bName\b\s*[/:]?\s*/i, "").replace(/[^a-zA-Z,\s]/g, "").trim();
        if (after.length >= 4 && /^[A-Z,\s]+$/i.test(after)) {
          result.engName = after.toUpperCase();
          break;
        }
      }
    }
  }

  // ── PASSPORT / ID NUMBER ──
  for (let i = 0; i < lines.length; i++) {
    if (/Passport\s*No|رقم\s*الجواز|رقم\s*الجوال/i.test(lines[i])) {
      let m = lines[i].match(/([A-Z]{0,3}\d{5,12})/i);
      if (m) { result.idNumber = m[1].toUpperCase(); break; }
      if (i + 1 < lines.length) {
        m = lines[i + 1].match(/([A-Z]{0,3}\d{5,12})/i);
        if (m) { result.idNumber = m[1].toUpperCase(); break; }
      }
    }
  }

  if (!result.idNumber) {
    for (const line of lines) {
      if (/\b(ISR|SYR|IRN|JOR|SAU|OMN|EGY|IRQ|PSE|LBN|KWT)\b/i.test(line)) {
        const m = line.match(/\b([A-Z]{0,3}\d{5,12})\b/i);
        if (m && !/\d{2}\/\d{2}\/\d{4}/.test(m[0])) {
          result.idNumber = m[1].toUpperCase();
          break;
        }
      }
    }
  }

  if (!result.idNumber) {
    for (const line of lines) {
      const m = line.match(/\b([A-Z]{1,2}\d{6,10})\b/);
      if (m && !/date|birth|issue|expir|تاريخ/i.test(line) && !/\d{2}\/\d{2}/.test(line)) {
        result.idNumber = m[1];
        break;
      }
    }
  }

  // ID from Arabic labeled fields
  if (!result.idNumber) {
    for (const line of lines) {
      if (/الرقم\s*(الوطني)?|I\.?D\.?\s*No|National.*No|رقم.*هوية/i.test(line)) {
        const m = line.match(/(\d{7,14})/);
        if (m) { result.idNumber = m[1]; break; }
      }
    }
  }

  // ── NATIONALITY ──
  // Check labeled nationality field first (most reliable)
  for (let i = 0; i < lines.length; i++) {
    if (/\bNationality\b|\bالجنسية\b/i.test(lines[i])) {
      const after = lines[i].replace(/.*(?:Nationality|الجنسية)\s*[/:]?\s*/i, "").trim();
      for (const [kw, ar] of NAT_PHRASES) {
        if (after.toUpperCase().includes(kw)) { result.nationality = ar; break; }
      }
      if (result.nationality) break;

      for (const [kw, ar] of AR_NAT_PHRASES) {
        if (after.includes(kw)) { result.nationality = ar; break; }
      }
      if (result.nationality) break;

      if (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        for (const [kw, ar] of NAT_PHRASES) {
          if (next.toUpperCase().includes(kw)) { result.nationality = ar; break; }
        }
        if (result.nationality) break;
        for (const [kw, ar] of AR_NAT_PHRASES) {
          if (next.includes(kw)) { result.nationality = ar; break; }
        }
        if (result.nationality) break;
      }
    }
  }

  // Check country name in header
  if (!result.nationality) {
    for (const [phrase, ar] of [
      ["SYRIAN ARAB REPUBLIC", "سوري"], ["RIAN ARAB REPUBLIC", "سوري"],
      ["HASHEMITE KINGDOM OF JORDAN", "أردني"],
      ["KINGDOM OF SAUDI ARABIA", "سعودي"],
      ["ISLAMIC REPUBLIC OF IRAN", "إيراني"],
      ["SULTANATE OF OMAN", "عماني"],
      ["STATE OF ISRAEL", "فلسطيني"],
      ["ARAB REPUBLIC OF EGYPT", "مصري"],
      ["UBLIC OF EGYPT", "مصري"],
      ["REPUBLIC OF IRAQ", "عراقي"],
      ["REPUBLIC OF TURKEY", "تركي"],
    ] as [string, string][]) {
      if (upper.includes(phrase)) { result.nationality = ar; break; }
    }
  }
  if (!result.nationality) {
    for (const [phrase, ar] of [
      ["الجمهورية العربية السورية", "سوري"],
      ["المملكة الأردنية الهاشمية", "أردني"],
      ["جمهورية مصر العربية", "مصري"],
      ["جمهورية العراق", "عراقي"],
      ["سلطنة عمان", "عماني"],
      ["جمهوري اسلامي ايران", "إيراني"],
      ["جمهورى اسلامى ايران", "إيراني"],
      ["المملكة العربية السعودية", "سعودي"],
      ["المملكة العربية السعو", "سعودي"],
    ] as [string, string][]) {
      if (westernText.includes(phrase)) { result.nationality = ar; break; }
    }
  }

  // Fallback: keyword search (ordered so specific words come before ambiguous ones)
  if (!result.nationality) {
    for (const [kw, ar] of NAT_PHRASES) {
      if (kw !== "SAUDI" && upper.includes(kw)) { result.nationality = ar; break; }
    }
  }
  if (!result.nationality) {
    if (upper.includes("SAUDI")) result.nationality = "سعودي";
  }

  // Country codes
  if (!result.nationality) {
    for (const line of lines) {
      const m = line.match(/\b(ISR|SYR|IRN|JOR|SAU|OMN|EGY|IRQ|PSE|LBN|KWT|ARE|BHR|QAT|TUR|PAK|IND)\b/);
      if (m && CC_TO_AR[m[1]]) { result.nationality = CC_TO_AR[m[1]]; break; }
    }
  }

  return result;
}

function cleanArabicName(name: string): string {
  let clean = name
    .replace(/^(الدسم|الأسم|الاسم|الإسم)\s+/i, "")
    .replace(/\s+$/, "")
    .trim();
  const words = clean.split(/\s+/).filter(w => w.length >= 2);
  return words.join(" ");
}

function isLikelyGarbage(name: string): boolean {
  if (!name || name.length < 4) return true;
  const hasArabic = /[\u0621-\u064A]/.test(name);
  if (!hasArabic) return false;
  const garbageIndicators = [
    "جمهور", "اسلام", "امضاء", "دارنده", "ذرنامه",
    "گذرنامه", "کشور", "تأث", "إمالة", "قسم الآب",
    "النسبة", "صادر", "محل", "توقيع",
  ];
  return garbageIndicators.some(g => name.includes(g));
}

function mergeResults(
  mrz: ReturnType<typeof parseMRZ>,
  ext: ReturnType<typeof extractFromText>,
) {
  const result: { fullName?: string; idNumber?: string; nationality?: string } = {};

  const arName = ext.arabicName ? cleanArabicName(ext.arabicName) : undefined;
  const arOk = arName && arName.length >= 6 && !isLikelyGarbage(arName);

  if (arOk) {
    result.fullName = arName;
  } else if (mrz?.fullName && mrz.fullName.length >= 4) {
    result.fullName = mrz.fullName;
  } else if (ext.engName) {
    result.fullName = ext.engName;
  } else if (arName && arName.length >= 4) {
    result.fullName = arName;
  }

  result.idNumber = ext.idNumber || mrz?.idNumber;
  result.nationality = ext.nationality || mrz?.nationality;

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    const visionClient = getClient();
    const [visionResult] = await visionClient.textDetection({
      image: { content: imageBuffer },
    });

    const fullText = visionResult.fullTextAnnotation?.text || "";

    if (!fullText || fullText.length < 10) {
      return NextResponse.json({
        fullName: null,
        idNumber: null,
        nationality: null,
        rawText: fullText,
        warning: "لم يتم التعرف على أي نص في الصورة",
      });
    }

    const mrz = parseMRZ(fullText);
    const extracted = extractFromText(fullText);
    const merged = mergeResults(mrz, extracted);

    return NextResponse.json({
      ...merged,
      rawText: fullText,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("OCR API Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
