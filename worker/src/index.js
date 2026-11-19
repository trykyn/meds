// Hausapotheke: holt Beipackzettel-Seiten und -PDFs für die App (Browser dürfen fremde Seiten nicht direkt lesen).
//   GET /fetch?url=https://…      Authorization: Bearer <Firebase-ID-Token>
// Nur angemeldete Familienmitglieder (users/{uid}.house gesetzt), nur https, nur Text/HTML/PDF/XML, höchstens 10 MB.
// Der Server liest nichts aus und speichert nichts; die App zerlegt den Inhalt selbst.
//
// 약상자: 설명서 웹페이지·PDF를 대신 가져옴(브라우저는 다른 사이트 글을 직접 못 읽음).
// 로그인한 가족(users/{uid}.house 가 있는 사람)만, https만, 글·HTML·PDF·XML만, 10MB까지. 저장은 하지 않음.
// 배포: meds/worker 폴더에서  ../../weekly-meals/worker/node_modules/.bin/wrangler deploy

const FIREBASE_PROJECT = "shopping-list-ae06d";
const ORIGINS = ["https://trykyn.github.io", "http://localhost:8774"];
const MAX = 10 * 1024 * 1024;
const TYPES = /^(text\/|application\/(pdf|xhtml\+xml|xml|json|download|octet-stream))/i;

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Headers": "Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Expose-Headers": "X-Final-Url, Content-Type",
      Vary: "Origin",
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const u = new URL(request.url);
    if (request.method !== "GET" || u.pathname !== "/fetch") return json({ error: "not_found" }, 404);

    try {
      await whoAmI((request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
    } catch (e) {
      return json({ error: e.message === "no_house" ? "no_house" : "unauthorized" }, 401);
    }

    let target;
    try { target = new URL(u.searchParams.get("url") || ""); } catch (e) { return json({ error: "bad_url" }, 400); }
    // Nur öffentliche https-Adressen mit Namen (keine IP-Adressen). / 이름 있는 공개 https 주소만.
    if (target.protocol !== "https:" || /^[\d.]+$|^\[|^localhost$/i.test(target.hostname)) return json({ error: "bad_url" }, 400);

    let r;
    try {
      r = await fetch(target.href, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9,ko;q=0.8,en;q=0.5",
        },
        cf: { cacheTtl: 3600 },
      });
    } catch (e) {
      return json({ error: "unreachable" }, 502);
    }
    if (!r.ok) return json({ error: "upstream", status: r.status }, 502);
    const type = r.headers.get("Content-Type") || "application/octet-stream";
    if (!TYPES.test(type)) return json({ error: "type", type }, 415);
    const len = Number(r.headers.get("Content-Length") || 0);
    if (len > MAX) return json({ error: "too_big" }, 413);
    const body = await r.arrayBuffer();
    if (body.byteLength > MAX) return json({ error: "too_big" }, 413);
    return new Response(body, { headers: { ...cors, "Content-Type": type, "X-Final-Url": r.url, "Cache-Control": "private, max-age=600" } });
  },
};

/* ---------- Firebase-Anmeldung prüfen (wie travel/worker) / 로그인 확인 ---------- */

let keyCache = { keys: null, until: 0 };
async function googleKeys() {
  if (keyCache.keys && Date.now() < keyCache.until) return keyCache.keys;
  const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  const { keys } = await r.json();
  const maxAge = Number(((r.headers.get("Cache-Control") || "").match(/max-age=(\d+)/) || [])[1] || 3600);
  keyCache = { keys, until: Date.now() + maxAge * 1000 };
  return keys;
}
const importedKeys = new Map();
const b64url = (s) => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b + "=".repeat((4 - (b.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
async function verifyFirebaseToken(token) {
  const [h, p, sig] = String(token).split(".");
  if (!h || !p || !sig) throw new Error("malformed");
  const dec = new TextDecoder();
  const header = JSON.parse(dec.decode(b64url(h)));
  const payload = JSON.parse(dec.decode(b64url(p)));
  if (header.alg !== "RS256") throw new Error("alg");
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("kid");
  let key = importedKeys.get(jwk.kid);
  if (!key) {
    key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    importedKeys.set(jwk.kid, key);
  }
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("signature");
  const now = Date.now() / 1000;
  if (payload.aud !== FIREBASE_PROJECT || payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT}`) throw new Error("audience");
  if (!payload.sub || payload.exp < now - 60 || payload.iat > now + 300) throw new Error("expired");
  return payload;
}
// Nur wer zu einer Familie gehört (users/{uid}.house), darf abrufen. / 가족 코드가 있는 사람만.
const houseCache = new Map();
async function whoAmI(idToken) {
  const user = await verifyFirebaseToken(idToken);
  const cached = houseCache.get(user.sub);
  if (cached && cached.until > Date.now()) return { uid: user.sub, house: cached.house };
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/users/${encodeURIComponent(user.sub)}`,
    { headers: { Authorization: `Bearer ${idToken}` } });
  const doc = r.ok ? await r.json() : null;
  const house = doc && doc.fields && doc.fields.house && doc.fields.house.stringValue;
  if (!house) throw new Error("no_house");
  houseCache.set(user.sub, { house, until: Date.now() + 10 * 60 * 1000 });
  return { uid: user.sub, house };
}
