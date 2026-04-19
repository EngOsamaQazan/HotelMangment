import vision from "@google-cloud/vision";
import fs from "fs";
import path from "path";

const docsDir = "C:\\Users\\PC\\Desktop\\hoteldocs";
const files = fs.readdirSync(docsDir).filter(f => /\.(jpeg|jpg|png)$/i.test(f));

const keyPath = path.resolve("google-vision-key.json");
const client = new vision.ImageAnnotatorClient({ keyFilename: keyPath });

const CC_TO_AR = {
  JOR: "أردني", EGY: "مصري", EGP: "مصري", SAU: "سعودي", SYR: "سوري",
  IRQ: "عراقي", PSE: "فلسطيني", LBN: "لبناني", KWT: "كويتي", ARE: "إماراتي",
  BHR: "بحريني", QAT: "قطري", OMN: "عماني", YEM: "يمني", LBY: "ليبي",
  TUN: "تونسي", DZA: "جزائري", MAR: "مغربي", SDN: "سوداني", IND: "هندي",
  PAK: "باكستاني", IRN: "إيراني", ISR: "فلسطيني", TUR: "تركي",
};
const NAT_EN = {
  JORDANIAN: "أردني", EGYPTIAN: "مصري", SAUDI: "سعودي", SYRIAN: "سوري",
  IRAQI: "عراقي", PALESTINIAN: "فلسطيني", LEBANESE: "لبناني", KUWAITI: "كويتي",
  EMIRATI: "إماراتي", OMANI: "عماني", IRANIAN: "إيراني", ISRAELI: "فلسطيني",
  TURKISH: "تركي", "SAUDI ARABIAN": "سعودي", "SAUDI ARABIA": "سعودي",
};
const AR_NAT = [
  "أردني", "أردنية", "مصري", "مصرية", "سعودي", "سعودية", "سوري", "سورية",
  "عراقي", "عراقية", "فلسطيني", "فلسطينية", "لبناني", "لبنانية",
  "كويتي", "كويتية", "إماراتي", "عماني", "عمانية", "بحريني", "قطري", "يمني",
  "إسرائيلية", "يشرائيلית",
];

function parseMRZ(text) {
  const lines = text.split("\n");
  const candidates = [];
  for (const raw of lines) {
    const stripped = raw.replace(/\s/g, "");
    if (stripped.length < 30) continue;
    const upper = stripped.toUpperCase();
    const clean = upper.replace(/[^A-Z0-9<]/g, "");
    if (clean.length >= 30 && /^[A-Z0-9<]+$/.test(clean)) {
      candidates.push(clean);
    }
  }

  let l1 = "", l2 = "";
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (candidates[i].startsWith("P<") || (candidates[i][0] === "P" && candidates[i].length >= 40)) {
      l1 = candidates[i];
      if (l1[1] !== "<") l1 = "P<" + l1.slice(2);
      if (i + 1 < candidates.length) l2 = candidates[i + 1];
      break;
    }
  }
  if (!l1) return null;

  const result = {};
  const cc = l1.substring(2, 5).replace(/</g, "");
  if (cc.length >= 2) result.nationality = CC_TO_AR[cc] || cc;

  const names = l1.substring(5);
  const parts = names.split("<<").filter(p => p.length > 0);
  if (parts.length >= 1) {
    const surname = parts[0].replace(/</g, " ").trim();
    const given = parts.slice(1).map(p => p.replace(/</g, " ").trim()).join(" ");
    if (surname.length >= 2) {
      result.fullName = given ? `${given} ${surname}` : surname;
    }
  }

  if (l2 && l2.length >= 20) {
    const m = l2.replace(/<+$/, "").match(/^([A-Z0-9]{5,12})/);
    if (m) {
      const id = m[1].replace(/<+$/, "");
      if (id.length >= 5) result.idNumber = id;
    }
  }

  return result;
}

function extractFromText(text) {
  const result = {};
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const upper = text.toUpperCase();

  // --- ARABIC NAME (from labeled field "الاسم" or "الإسم") ---
  for (const line of lines) {
    if (!/[\u0621-\u064A]/.test(line)) continue;
    for (const label of ["الاسم", "الإسم"]) {
      const idx = line.indexOf(label);
      if (idx === -1) continue;
      const after = line.substring(idx + label.length)
        .replace(/[/:：_\-=|,]/g, " ")
        .replace(/[^\u0621-\u064A\u0660-\u0669\s]/g, " ")
        .replace(/\s+/g, " ").trim();
      const words = after.split(/\s+/).filter(w => w.length >= 2);
      if (words.length >= 2 && words.length <= 8) {
        result.arabicName = words.join(" ");
        break;
      }
    }
    if (result.arabicName) break;
  }

  // --- ARABIC NAME (search for Arabic text near name-like patterns) ---
  if (!result.arabicName) {
    const skipWords = [
      "جمهورية", "مملكة", "دولة", "جواز", "سفر", "هوية", "الجنسية",
      "تاريخ", "الميلاد", "وزارة", "الداخلية", "الأحوال", "المدنية",
      "سجل", "الأسرة", "توقيع", "صاحب", "صدور", "مكان", "محل",
      "الإصدار", "الانتهاء", "نوع", "رقم", "اسلامي", "العربية",
      "الهاشمية", "المتحدة", "الأردنية", "سلطنة", "السعودية",
      "المملكة", "جوازسفر", "إسلامي", "إيران", "الصلاحية",
      "مدينة", "قنصلية", "سفارة", "إصدار", "ولادة", "الحامل",
    ];

    const candidates = [];
    for (const line of lines) {
      if (!/[\u0621-\u064A]/.test(line)) continue;
      const cleaned = line.replace(/[^\u0621-\u064A\s]/g, " ").replace(/\s+/g, " ").trim();
      const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
      if (words.length < 2 || words.length > 7 || cleaned.length < 6) continue;
      const arabicRatio = (cleaned.match(/[\u0621-\u064A]/g) || []).length / cleaned.replace(/\s/g, "").length;
      if (arabicRatio < 0.8) continue;
      if (skipWords.some(w => cleaned.includes(w))) continue;
      const singleChars = cleaned.split(/\s+/).filter(w => w.length === 1).length;
      if (singleChars > 1) continue;
      candidates.push({ text: cleaned, len: cleaned.length, words: words.length });
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.len - a.len);
      result.arabicName = candidates[0].text;
    }
  }

  // --- ENGLISH NAME ---
  let surname = "", given = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\bSurname\b|\burname\b/i.test(line) && !surname) {
      const after = line.replace(/.*(?:Surname|urname)\s*[/:]?\s*/i, "").replace(/[^\u0621-\u064Aa-zA-Z\s]/g, "").trim();
      const engPart = after.replace(/[\u0621-\u064A]/g, "").trim();
      if (engPart.length >= 2 && /^[A-Z\s]+$/i.test(engPart)) surname = engPart.toUpperCase();
      else if (i + 1 < lines.length) {
        const n = lines[i + 1].replace(/[^a-zA-Z\s]/g, "").trim();
        if (n.length >= 2 && /^[A-Z\s]+$/i.test(n)) surname = n.toUpperCase();
      }
    }
    if (/Given\s*name|iven\s*name/i.test(line) && !given) {
      const after = line.replace(/.*(?:Given\s*name|iven\s*name)\s*[/:]?\s*/i, "").replace(/[^\u0621-\u064Aa-zA-Z\s]/g, "").trim();
      const engPart = after.replace(/[\u0621-\u064A]/g, "").trim();
      if (engPart.length >= 2 && /^[A-Z\s]+$/i.test(engPart)) given = engPart.toUpperCase();
      else if (i + 1 < lines.length) {
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
      if (/\bName\b/i.test(line) && !/Surname|Given|Father|Mother|Place/i.test(line)) {
        const after = line.replace(/.*\bName\b\s*[/:]?\s*/i, "").replace(/[^a-zA-Z,\s]/g, "").trim();
        if (after.length >= 4 && /^[A-Z,\s]+$/i.test(after)) {
          result.engName = after.toUpperCase();
          break;
        }
      }
    }
  }

  // --- PASSPORT / ID NUMBER ---
  for (let i = 0; i < lines.length; i++) {
    if (/Passport\s*No|رقم\s*الجواز/i.test(lines[i])) {
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
      if (/\b(ISR|SYR|IRN|JOR|SAU|OMN|EGY|IRQ)\b/i.test(line)) {
        const m = line.match(/\b([A-Z]{0,3}\d{5,12})\b/i);
        if (m && !/\d{2}\/\d{2}\/\d{4}/.test(m[0])) {
          result.idNumber = m[1].toUpperCase(); break;
        }
      }
    }
  }
  if (!result.idNumber) {
    for (const line of lines) {
      const m = line.match(/\b([A-Z]{1,2}\d{6,10})\b/);
      if (m && !/date|birth|issue|expir/i.test(line) && !/\d{2}\/\d{2}/.test(line)) {
        result.idNumber = m[1]; break;
      }
    }
  }
  if (!result.idNumber) {
    for (const line of lines) {
      if (/الرقم|I\.?D\.?\s*No|National.*No|رقم.*وطني|رقم.*شخصي/i.test(line)) {
        const m = line.match(/(\d[\d-]{6,14}\d)/);
        if (m) { result.idNumber = m[1].replace(/-/g, ""); break; }
      }
    }
  }

  // --- NATIONALITY ---
  for (const [kw, ar] of Object.entries(NAT_EN)) {
    if (upper.includes(kw)) { result.nationality = ar; break; }
  }
  if (!result.nationality) {
    for (const line of lines) {
      const m = line.match(/\b(ISR|SYR|IRN|JOR|SAU|OMN|EGY|IRQ|PSE|LBN|KWT|ARE|BHR|QAT|TUR|PAK|IND)\b/);
      if (m && CC_TO_AR[m[1]]) { result.nationality = CC_TO_AR[m[1]]; break; }
    }
  }
  if (!result.nationality) {
    for (const nat of AR_NAT) {
      if (text.includes(nat)) { result.nationality = nat; break; }
    }
  }

  return result;
}

const EXPECTED = [
  { file: "03-30", name: "سعود بن مفيض بن رحيل الدغماني الرويلي", id: "1014640609", nat: "سعودي" },
  { file: "04-03", name: "موسى السعودي", id: "N01108061", nat: "سوري" },
  { file: "04-04", name: "برهان كريمي", id: "T97665329", nat: "إيراني" },
  { file: "04-05", name: "سعيد أبو كف", id: "35101848", nat: "فلسطيني" },
  { file: "04-06", name: "حسين أبو كف", id: "32797026", nat: "فلسطيني" },
  { file: "1.21", name: "بركات نبهان سيف نبهان البراشدي", id: "ZV0275376", nat: "عماني" },
  { file: "11.08", name: "أثير غازي مفلح المعيدي", id: "U0067943", nat: "أردني" },
  { file: "12.25", name: "سطام عشوي العنزي", id: "AZ47148", nat: "سعودي" },
  { file: "4.36", name: "خالد بن محمد بن صالح المري", id: "BG88653", nat: "سعودي" },
];

(async () => {
  let total = 0, nH = 0, iH = 0, jH = 0;
  for (const file of files) {
    const fp = path.join(docsDir, file);
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📄 ${file}`);
    total++;
    const exp = EXPECTED.find(e => file.includes(e.file));

    const imageBuffer = fs.readFileSync(fp);
    const [result] = await client.textDetection({ image: { content: imageBuffer } });
    const fullText = result.fullTextAnnotation?.text || "";

    console.log(`  📝 Text length: ${fullText.length} chars`);
    console.log(`  📝 First 300 chars:\n${fullText.substring(0, 300)}`);

    const mrz = parseMRZ(fullText);
    const extracted = extractFromText(fullText);

    // Merge
    const final = {};
    if (extracted.arabicName) final.fullName = extracted.arabicName;
    else if (extracted.engName) final.fullName = extracted.engName;
    else if (mrz?.fullName) final.fullName = mrz.fullName;

    final.idNumber = extracted.idNumber || mrz?.idNumber;
    final.nationality = extracted.nationality || mrz?.nationality;

    if (final.fullName) nH++;
    if (final.idNumber) iH++;
    if (final.nationality) jH++;

    console.log(`\n  ${final.fullName?"✅":"❌"} اسم: ${final.fullName||"—"}`);
    console.log(`  ${final.idNumber?"✅":"❌"} رقم: ${final.idNumber||"—"}`);
    console.log(`  ${final.nationality?"✅":"❌"} جنس: ${final.nationality||"—"}`);
    if (exp) console.log(`  📋 توقع: ${exp.name} | ${exp.id} | ${exp.nat}`);
    if (mrz) console.log(`  🔬 MRZ: ${JSON.stringify(mrz)}`);
    console.log(`  🔬 EXT: arName=${extracted.arabicName||"—"} engName=${extracted.engName||"—"} id=${extracted.idNumber||"—"} nat=${extracted.nationality||"—"}`);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 GOOGLE VISION - ${total} وثائق: اسم ${nH}/${total}(${Math.round(nH/total*100)}%) رقم ${iH}/${total}(${Math.round(iH/total*100)}%) جنسية ${jH}/${total}(${Math.round(jH/total*100)}%)`);
})();
