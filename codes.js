// Barcode-Text → { pzn, ean, gtin, exp, batch, serial, country, kind }
// Versteht: Securpharm-DataMatrix im IFA-Format (9N PPN, 1T Charge, D Verfall, S Seriennummer),
// GS1-DataMatrix (01 GTIN, 17 Verfall, 10 Charge, 21 Seriennummer, 710 PZN), PZN-Strichcode (Code 39),
// EAN-13 (Korea: 880…) und von Hand getippte Nummern.
//
// 바코드 글자 → { pzn, ean, gtin, exp(유효기간), batch(로트), serial(일련번호), country, kind }
// 독일 처방약 DataMatrix(IFA 형식과 GS1 형식), PZN 줄 바코드, 한국 약 880… 바코드, 손으로 친 번호를 읽음.
(function (root) {
  const GS = '\x1d', RS = '\x1e', EOT = '\x04';

  // PZN-8: Ziffern 1–7 mal 1…7, Summe mod 11 = 8. Ziffer (Rest 10 ist ungültig).
  // PZN 8자리 검사 숫자: 앞 7자리에 1~7을 곱해 더한 값을 11로 나눈 나머지가 마지막 자리.
  function pznOk(p) {
    if (!/^\d{8}$/.test(p)) return false;
    let s = 0;
    for (let i = 0; i < 7; i++) s += +p[i] * (i + 1);
    return s % 11 !== 10 && s % 11 === +p[7];
  }
  // Alte 7-stellige PZN → 8-stellig (vorne 0, Prüfziffer bleibt gleich). / 옛 7자리 PZN → 앞에 0.
  const pzn7to8 = p => (/^\d{7}$/.test(p) && pznOk('0' + p) ? '0' + p : '');

  function gtinOk(g) {
    if (!/^\d{8}$|^\d{12,14}$/.test(g)) return false;
    let s = 0;
    const d = g.split('').reverse();
    for (let i = 1; i < d.length; i++) s += +d[i] * (i % 2 ? 3 : 1);
    return (10 - (s % 10)) % 10 === +d[0];
  }

  // JJMMTT → JJJJ-MM-TT; TT = 00 heißt „Ende des Monats“. / 일이 00이면 그 달 마지막 날.
  function ymd(s) {
    if (!/^\d{6}$/.test(s)) return '';
    const y = 2000 + +s.slice(0, 2), m = +s.slice(2, 4);
    let d = +s.slice(4, 6);
    if (m < 1 || m > 12) return '';
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d === 0) d = last;
    if (d > last) return '';
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // GTIN-14 → PZN (Deutschland: 0 4150 + PZN + Prüfziffer) oder EAN-13. / GTIN에서 PZN 또는 EAN-13 꺼내기.
  function fromGtin(out, g) {
    out.gtin = g;
    if (/^04150\d{9}$/.test(g) && pznOk(g.slice(5, 13))) out.pzn = g.slice(5, 13);
    else if (g.length === 14 && g[0] === '0') out.ean = g.slice(1);
    else out.ean = g;
  }

  // Feste Längen der GS1-Datenbezeichner, die auf Packungen vorkommen. / GS1 고정 길이 항목.
  const FIXED = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6 };
  const VAR = ['10', '21', '22', '240', '241', '30', '710', '711', '712', '713', '714', '91', '92', '93', '94', '95', '96', '97', '98', '99'];

  function gs1(text) {
    const f = {};
    let s = text;
    if (/^\(\d{2,4}\)/.test(s)) {
      // Klartext mit Klammern: (01)…(17)… / 괄호로 쓴 형태
      const re = /\((\d{2,4})\)([^(]*)/g;
      let m;
      while ((m = re.exec(s))) f[m[1]] = m[2].trim();
      return f;
    }
    let i = 0;
    while (i < s.length) {
      if (s[i] === GS) { i++; continue; }
      let ai = s.slice(i, i + 2);
      if (FIXED[ai]) {
        f[ai] = s.slice(i + 2, i + 2 + FIXED[ai]);
        i += 2 + FIXED[ai];
        continue;
      }
      ai = VAR.find(a => s.startsWith(a, i));
      if (!ai) break;
      const end = s.indexOf(GS, i + ai.length);
      f[ai] = s.slice(i + ai.length, end < 0 ? s.length : end);
      i = end < 0 ? s.length : end + 1;
    }
    return f;
  }

  // IFA-Format (ASC MH10): [)>␞06␝9N11PZNPP␝1TCharge␝D261231␝SSerie␞␄
  function ifa(text) {
    const f = {};
    const body = text.replace(/^\[\)>/, '').split(RS).find(p => /^06/.test(p)) || text;
    for (let part of body.replace(/^06/, '').split(GS)) {
      part = part.replace(EOT, '');
      for (const di of ['16D', '9N', '8P', '1T', 'D', 'S']) {
        if (part.startsWith(di)) { f[di] = part.slice(di.length); break; }
      }
    }
    return f;
  }

  function parse(raw) {
    const out = { raw: String(raw || ''), pzn: '', ean: '', gtin: '', exp: '', batch: '', serial: '', country: '', kind: '', url: '' };
    // Vorne: Symbologie-Kennung (]d2) und das FNC1-Zeichen, das manche Leser als ␝ ausgeben.
    // 앞에 붙는 ]d2 표시와 FNC1(␝) 글자 제거.
    let t = out.raw.trim().replace(/^\][A-Za-z]\d/, '').replace(/^\x1d+/, '').replace(/[\r\n]+$/, '');
    if (!t) return null;

    if (/^https?:\/\//i.test(t)) {
      // QR-Code mit Adresse: GS1 Digital Link (…/01/GTIN/10/Charge/21/Serie?17=JJMMTT) oder sonst ein Link
      // (z. B. koreanische e-Label-Seite des Herstellers). / QR 주소: GS1 디지털 링크면 풀어 읽고, 아니면 링크로 보관.
      out.kind = 'url'; out.url = t;
      let u; try { u = new URL(t); } catch (e) { u = null; }
      const p = u ? decodeURIComponent(u.pathname) : t;
      const g = p.match(/\/(?:01|gtin)\/(\d{8,14})(?=\/|$)/);
      if (g && gtinOk(g[1])) {
        fromGtin(out, g[1].padStart(14, '0'));
        const seg = k => { const m = p.match(new RegExp('/' + k + '/([^/]+)')); return m ? m[1] : ''; };
        out.batch = seg('10'); out.serial = seg('21');
        out.exp = ymd((u && u.searchParams.get('17')) || seg('17'));
        out.kind = 'gs1link';
      } else {
        const k = t.match(/(?:^|\D)(880\d{10})(?:\D|$)/);
        if (k && gtinOk(k[1])) out.ean = k[1];
      }
    } else if (t.startsWith('[)>') || /^06\x1d/.test(t)) {
      out.kind = 'ifa';
      const f = ifa(t);
      if (f['9N'] && /^11\d{8}/.test(f['9N']) && pznOk(f['9N'].slice(2, 10))) out.pzn = f['9N'].slice(2, 10);
      if (f['8P']) fromGtin(out, f['8P']);
      out.exp = ymd(f['D'] || '');
      out.batch = f['1T'] || '';
      out.serial = f['S'] || '';
    } else if (/^\(\d{2}\)/.test(t) || (/^0[12]\d{14}/.test(t) && gtinOk(t.slice(2, 16)))) {
      out.kind = 'gs1';
      const f = gs1(t);
      if (f['01'] && gtinOk(f['01'])) fromGtin(out, f['01']);
      if (f['710'] && pznOk(f['710'])) out.pzn = f['710'];
      out.exp = ymd(f['17'] || '');
      out.batch = f['10'] || '';
      out.serial = f['21'] || '';
    } else {
      // Strichcode oder Eingabe von Hand / 줄 바코드 또는 직접 입력
      const d = t.toUpperCase().replace(/^PZN/, '').replace(/[\s\-:]/g, '');
      if (/^\d{8}$/.test(d) && pznOk(d)) { out.pzn = d; out.kind = 'pzn'; }
      else if (/^\d{7}$/.test(d) && pzn7to8(d)) { out.pzn = pzn7to8(d); out.kind = 'pzn'; }
      else if (/^\d{13}$/.test(d) && gtinOk(d)) { out.ean = d; out.kind = 'ean'; }
      else if (/^\d{14}$/.test(d) && gtinOk(d)) { fromGtin(out, d); out.kind = 'ean'; }
      else if (/^\d{8}$/.test(d) && gtinOk(d)) { out.ean = d; out.kind = 'ean'; }
      else if (/^\d{8}$/.test(d)) { out.pzn = d; out.kind = 'pzn?'; } // Tippfehler möglich / 오타일 수 있음
      else out.kind = 'text';
    }
    if (out.pzn) out.country = 'de';
    else if (/^880/.test(out.ean)) out.country = 'kr';
    else if (/^4[0-4]/.test(out.ean)) out.country = 'de';
    return out;
  }

  // Schlüssel, unter dem dasselbe Produkt wiedererkannt wird. / 같은 제품을 알아보는 열쇠.
  const key = c => !c ? '' : c.pzn ? 'pzn:' + c.pzn : c.ean ? 'ean:' + c.ean : c.raw ? 'raw:' + c.raw.slice(0, 60) : '';

  root.MedCode = { parse, key, pznOk, gtinOk, ymd };
})(typeof window !== 'undefined' ? window : globalThis);
