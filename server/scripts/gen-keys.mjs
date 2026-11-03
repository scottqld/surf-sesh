// Generate a fresh VAPID keypair + AUTH_SECRET for the NAS backend.
// The Cloudflare originals are write-only secrets and can't be read back, so the
// cutover uses new ones:
//   • VAPID_PUBLIC_KEY  → paste into .env AND into index.html's VAPID_PUBLIC_KEY
//     const. Everyone re-enables notifications once (one tap in Settings).
//   • AUTH_SECRET       → paste into .env. Everyone re-logs-in once with their
//     existing name + PIN (accounts migrate; only the signed token changes).
//
// Run:  node scripts/gen-keys.mjs
import { webcrypto as crypto } from 'node:crypto';

const b64u = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
);
const rawPub  = await crypto.subtle.exportKey('raw', pair.publicKey);   // 65-byte point
const jwkPriv = await crypto.subtle.exportKey('jwk', pair.privateKey);  // includes d,x,y
const authSecret = b64u(crypto.getRandomValues(new Uint8Array(32)));

console.log('\n# ─── paste into server/.env ───────────────────────────────');
console.log(`VAPID_PUBLIC_KEY=${b64u(rawPub)}`);
console.log(`VAPID_PRIVATE_KEY_JWK=${JSON.stringify(jwkPriv)}`);
console.log(`AUTH_SECRET=${authSecret}`);
console.log('\n# ─── paste into index.html (VAPID_PUBLIC_KEY const) ───────');
console.log(`const VAPID_PUBLIC_KEY = '${b64u(rawPub)}';`);
console.log('');
