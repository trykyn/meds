// Baut aus der HIRA-Liste „약가마스터_의약품표준코드“ (CSV, EUC-KR) kleine JSON-Dateien kd/NNN.json:
// Barcode (Standardcode 880…) → Name, Firma, Artikel-Nr. (품목기준코드), Darreichungsform, Rx/OTC.
// Aufgeteilt nach den Ziffern 4–6 des Barcodes, damit die App nur ein kleines Stück laden muss.
// 심평원 「약가마스터_의약품표준코드」 CSV(EUC-KR)를 작은 JSON(kd/NNN.json)으로 나눔:
// 바코드(표준코드) → 제품명, 업체, 품목기준코드, 제형, 전문/일반. 바코드 4~6번째 자리로 나눠 필요한 조각만 받음.
// 사용: node tools/build-kd.mjs <다운로드한 CSV> <출력 폴더(kd)>
// 원본: https://www.data.go.kr/data/15067462/fileData.do (공공누리 출처표시)
import fs from 'node:fs';
import path from 'node:path';
const [src, out] = process.argv.slice(2);
const txt = new TextDecoder('euc-kr').decode(fs.readFileSync(src));
function* rows(s) {
  let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); yield row; row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); yield row; }
}
const it = rows(txt), head = it.next().value, ix = n => head.indexOf(n);
const KEEP = { '전문의약품': 'R', '전문,희귀': 'R', '일반의약품': 'O', '': '' };
const shards = {};
let n = 0;
for (const r of it) {
  const kind = r[ix('전문일반구분')].trim();
  if (!(kind in KEEP)) continue;
  const cancel = r[ix('취소일자')].trim();
  // Abgemeldete Packungen bis 2019 zurück behalten: alte Schachteln liegen oft noch im Schrank.
  // 취소된 코드도 2019년 이후 것은 남김(집에 예전 상자가 남아 있을 수 있음).
  if (cancel && cancel < '2019') continue;
  const code = r[ix('표준코드')].trim();
  if (!/^880\d{10}$/.test(code)) continue;
  const seq = r[ix('품목기준코드')].trim();
  const sh = code.slice(3, 6), s = shards[sh] || (shards[sh] = { i: {}, c: {} });
  if (!s.i[seq] || !cancel) s.i[seq] = [r[ix('한글상품명')].trim(), r[ix('업체명')].trim(), r[ix('제형구분')].trim(), KEEP[kind], r[ix('국제표준코드(ATC코드)')].trim()];
  if (!s.c[code.slice(6)] || !cancel) s.c[code.slice(6)] = seq;
  n++;
}
fs.mkdirSync(out, { recursive: true });
let bytes = 0, max = 0;
for (const [k, v] of Object.entries(shards)) {
  const j = JSON.stringify(v);
  fs.writeFileSync(path.join(out, k + '.json'), j);
  bytes += j.length; max = Math.max(max, j.length);
}
console.log({ codes: n, shards: Object.keys(shards).length, totalKB: Math.round(bytes / 1024), maxKB: Math.round(max / 1024) });
