/*
 * Generate a one-off VAPID keypair for Web Push.
 *
 * Run once, then paste the output into your `.env`:
 *
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_CONTACT_EMAIL=mailto:admin@yourdomain.com
 *
 * Usage: npx ts-node --project tsconfig.scripts.json scripts/generate-vapid.ts
 */

import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("VAPID_CONTACT_EMAIL=mailto:admin@mafhotel.com");
