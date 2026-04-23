import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();

async function main() {
  const token = (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "").trim();
  const challenge = `probe_${Date.now()}`;
  const base = process.argv[2] ?? "https://mafhotel.com/api/whatsapp/webhook";
  const url = new URL(base);
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", token);
  url.searchParams.set("hub.challenge", challenge);

  console.log("URL       :", url.toString());
  console.log("TOKEN_LEN :", token.length);

  const res = await fetch(url, { redirect: "manual" });
  const body = await res.text();
  console.log("STATUS    :", res.status);
  console.log("LOCATION  :", res.headers.get("location") ?? "(none)");
  console.log("CT        :", res.headers.get("content-type"));
  console.log("BODY      :", body.slice(0, 200));
  console.log("MATCH     :", body === challenge ? "✅ ok" : "✗ mismatch");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
