/* Inspect all .xlsx files in "سجل مصاريف الفندق" desktop folder */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const FOLDER = "C:\\Users\\PC\\Desktop\\سجل مصاريف الفندق";

function inspect(file) {
  const full = path.join(FOLDER, file);
  const wb = XLSX.readFile(full, { cellDates: true });
  console.log("══════════════════════════════════════════════");
  console.log("FILE:", file);
  console.log("Sheets:", wb.SheetNames.join(" | "));
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    console.log(`\n────── Sheet: ${sn} (rows=${rows.length}) ──────`);
    const preview = rows.slice(0, 40);
    preview.forEach((r, i) => {
      const cells = r.map((c) => (c === "" || c == null ? "" : String(c))).join(" | ");
      console.log(String(i + 1).padStart(3), "│", cells);
    });
    if (rows.length > 40) console.log(`... (${rows.length - 40} row(s) more)`);
  }
}

const files = fs.readdirSync(FOLDER).filter((f) => f.toLowerCase().endsWith(".xlsx"));
if (!files.length) {
  console.log("No .xlsx files found in:", FOLDER);
  process.exit(0);
}
for (const f of files) inspect(f);
