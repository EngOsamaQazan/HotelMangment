const XLSX = require("xlsx");
const path = require("path");

const file = process.argv[2] || path.resolve(__dirname, "..", "tmp-import", "guests-register.xlsx");
const wb = XLSX.readFile(file);

console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  console.log("\n=== Sheet:", name, "rows:", rows.length, "===");
  rows.forEach((r, i) => {
    console.log(`[${i}]`, JSON.stringify(r));
  });
}
