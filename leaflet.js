// Beipackzettel-Text → Abschnitte und Werte (ohne KI, nur nach der festen EU-Gliederung bzw. den koreanischen Überschriften).
// EU-Gebrauchsinformationen haben immer: 1. Was ist … wofür wird es angewendet? 2. Was sollten Sie … beachten?
// 3. Wie ist … einzunehmen/anzuwenden? 4. Welche Nebenwirkungen sind möglich? 5. Wie ist … aufzubewahren? 6. Inhalt der Packung.
// Die Überschriften stehen oben im Inhaltsverzeichnis noch einmal; genommen wird jeweils die Stelle mit dem längsten Text.
//
// 설명서 글 → 항목과 값(AI 없이). EU 설명서는 목차가 법으로 정해져 있음(1 무엇에 쓰나 · 2 주의 · 3 사용법 · 4 부작용 ·
// 5 보관 · 6 포장). 맨 위 목차에도 같은 제목이 있어서, 각 번호마다 뒤 내용이 가장 긴 곳을 본문으로 씀.
// 한국 설명서(의약품안전나라 등)는 효능효과 · 용법용량 · 사용상의 주의사항 · 저장방법 제목으로 나눔.
(function (root) {
  const W = '[\\s\\S]{1,160}?';
  const DE = [
    [1, new RegExp(`(?:^|\\n)[ \\t]*1\\.?[ \\t]+Was[ \\t]+(?:ist|sind)${W}wof(?:ü|ue)r[\\s\\S]{0,40}?(?:angewendet|eingenommen|verwendet|benutzt|gebraucht)[^\\n]*`, 'gi')],
    [2, new RegExp(`(?:^|\\n)[ \\t]*2\\.?[ \\t]+Was[ \\t]+(?:sollten|müssen|muss)[ \\t]+Sie${W}beachten[^\\n]*`, 'gi')],
    [3, new RegExp(`(?:^|\\n)[ \\t]*3\\.?[ \\t]+Wie[ \\t]+(?:ist|sind|wird|werden)${W}(?:einzunehmen|anzuwenden|zu[ \\t]+verwenden|zu[ \\t]+geben|zu[ \\t]+nehmen|einzusetzen|angewendet|eingenommen)[^\\n]*`, 'gi')],
    [4, /(?:^|\n)[ \t]*4\.?[ \t]+Welche[ \t]+Nebenwirkungen[ \t]+sind[ \t]+möglich[^\n]*/gi],
    [5, new RegExp(`(?:^|\\n)[ \\t]*5\\.?[ \\t]+Wie[ \\t]+(?:ist|sind)${W}aufzubewahren[^\\n]*`, 'gi')],
    [6, /(?:^|\n)[ \t]*6\.?[ \t]+Inhalt[ \t]+der[ \t]+Packung[^\n]*/gi],
  ];
  const KO = [
    ['efcy', /(?:^|\n)[ \t]*(?:\d+\.\s*)?(?:주\s*)?효능[\s·・ㆍ,]*효과[^\n]*/g],
    ['use', /(?:^|\n)[ \t]*(?:\d+\.\s*)?용법[\s·・ㆍ,]*용량[^\n]*/g],
    ['warn', /(?:^|\n)[ \t]*(?:\d+\.\s*)?사용상의?\s*주의\s*사항[^\n]*/g],
    ['store', /(?:^|\n)[ \t]*(?:\d+\.\s*)?(?:저장\s*방법|보관\s*방법)[^\n]*/g],
  ];
  const NUM = { ein: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, 'zwölf': 12, vierzehn: 14, achtzehn: 18, 'vierundzwanzig': 24 };
  const LIMIT = { efcy: 1500, use: 3000, warn: 2000, se: 1500, store: 800 };

  const tidy = s => String(s || '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const cut = (s, n) => s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n) > n * 0.8 ? s.lastIndexOf(' ', n) : n) + ' …';

  // Abschnitte suchen: jede Überschrift-Fundstelle, dann pro Nummer die mit dem längsten Inhalt.
  // 제목 위치를 모두 찾고, 번호마다 내용이 가장 긴 곳을 고름.
  function split(text, defs) {
    const hits = [];
    for (const [k, re] of defs) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) hits.push({ k, start: m.index, end: m.index + m[0].length });
    }
    hits.sort((a, b) => a.start - b.start);
    const best = {};
    hits.forEach((h, i) => {
      const next = hits.slice(i + 1).find(x => x.start >= h.end);
      const body = text.slice(h.end, next ? next.start : text.length).trim();
      if (!best[h.k] || body.length > best[h.k].length) best[h.k] = body;
    });
    return best;
  }

  const unit = (n, u) => {
    u = u.toLowerCase();
    if (/^tag/.test(u) || u === '일') return n;
    if (/^woche/.test(u) || u === '주') return n * 7;
    if (/^jahr/.test(u) || u === '년') return n * 365;
    // Monate: auf die Auswahl der App runden (3 → 90, 6 → 182, 12 → 365) / 개월
    return n === 12 ? 365 : n === 6 ? 182 : n === 3 ? 90 : n * 30;
  };
  const toNum = w => /^\d+$/.test(w) ? +w : NUM[w.toLowerCase()] || 0;

  // „Nach Anbruch 6 Monate haltbar“, „innerhalb von 4 Wochen nach dem ersten Öffnen“, „개봉 후 1개월“
  function openAfter(text) {
    const N = '(\\d+|ein|eine|einen|einem|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|vierzehn|achtzehn|vierundzwanzig)';
    const U = '(Tag|Tage|Tagen|Woche|Wochen|Monat|Monate|Monaten|Jahr|Jahre|Jahren)';
    const OPEN = '(?:(?:dem|der)\\s+)?(?:ersten\\s+)?(?:Öffnen|Öffnung|Anbruch|Anbrechen|Anbruchs)';
    const res = [
      new RegExp(`nach\\s+${OPEN}[^.\\n]{0,100}?${N}\\s*${U}`, 'i'),
      new RegExp(`${N}\\s*${U}[^.\\n]{0,60}?nach\\s+${OPEN}`, 'i'),
      new RegExp(`Haltbarkeit\\s+nach\\s+${OPEN}[^.\\n]{0,20}?${N}\\s*${U}`, 'i'),
    ];
    for (const re of res) {
      const m = text.match(re);
      if (m) {
        const n = toNum(m[1]);
        if (n) return { days: unit(n, m[2]), text: sentence(text, m.index) };
      }
    }
    const k = text.match(/개봉\s*(?:한\s*)?(?:후|뒤)[^.\n]{0,20}?(\d+)\s*(일|주|개월|년)/);
    if (k) return { days: unit(+k[1], k[2] === '개월' ? 'monat' : k[2]), text: sentence(text, k.index) };
    return null;
  }
  // Ganzen Satz um eine Fundstelle herum / 찾은 곳이 들어 있는 문장 전체
  function sentence(text, i) {
    const s = Math.max(text.lastIndexOf('.', i), text.lastIndexOf('\n', i)) + 1;
    let e = text.slice(i).search(/[.\n]/);
    e = e < 0 ? text.length : i + e + 1;
    return tidy(text.slice(s, e));
  }

  function kindOf(s) {
    s = String(s || '');
    if (/Augentropfen|Nasentropfen|Ohrentropfen|Augen-?\s*und\s*Nasen|점안|점비|점이|안약/i.test(s)) return 'drops';
    if (/Spray|Dosierspray|Sprühlösung|스프레이|분무/i.test(s)) return 'spray';
    if (/Zäpfchen|Suppositori|좌제|좌약/i.test(s)) return 'supp';
    if (/Salbe|Creme|Gel\b|Paste|Lotion|Pflaster|연고|크림|겔|로션|패치/i.test(s)) return 'cream';
    if (/Saft|Sirup|Suspension|Lösung zum Einnehmen|Tropfen zum Einnehmen|Granulat|시럽|현탁|내용액/i.test(s)) return 'syrup';
    if (/Tablette|Kapsel|Dragee|Lutschtablette|정\b|캡슐/i.test(s)) return 'tab';
    return '';
  }

  // Name: Zeile(n) nach „Gebrauchsinformation: Information für …“ / 이름: „Gebrauchsinformation …“ 다음 줄
  function nameOf(text, sec1Heading) {
    const m = text.match(/Gebrauchsinformation\s*:?\s*Information\s+für\s+(?:den\s+|die\s+)?(?:Anwender|Patienten|Anwenderinnen)[^\n]*\n+([^\n]{3,90})(?:\n([^\n]{2,60}))?/i);
    if (m) {
      let n = m[1].trim();
      // zweite Zeile gehört dazu, wenn sie wie Stärke/Darreichungsform aussieht / 두 번째 줄이 함량·제형이면 이어 붙임
      if (m[2] && /\d\s*(mg|g|ml|%)|Tabletten|Saft|Suspension|Tropfen|Spray|Salbe|Creme|Kapseln|Zäpfchen|für Kinder/i.test(m[2]) && !/^(Wirkstoff|Zur Anwendung|Lesen Sie)/i.test(m[2])) n += ' ' + m[2].trim();
      if (!/^(Wirkstoff|Lesen Sie)/i.test(n)) return n.replace(/\s+/g, ' ');
    }
    const h = String(sec1Heading || text).match(/Was ist\s+([\s\S]{2,80}?)\s+und\s+wof/i);
    return h ? h[1].replace(/\s+/g, ' ').trim() : '';
  }

  // Dosierung kurz: Standardsätze am Anfang weglassen / 먹는 법 요약: 앞의 정해진 안내 문장 빼기
  function doseSummary(s) {
    let t = tidy(s)
      .replace(/^[^\n]*?(?:immer genau|genau wie in dieser Packungsbeilage|nach Absprache mit Ihrem Arzt|wie mit Ihrem Arzt)[^\n.]*\.(?:[^\n.]*Fragen Sie[^\n.]*\.)?\s*/i, '')
      .replace(/^[^\n.]*Fragen Sie bei Ihrem Arzt oder Apotheker nach[^\n.]*\.\s*/i, '');
    return cut(t, 700);
  }

  function parse(raw) {
    const text = tidy(raw);
    if (!text) return null;
    const out = { lang: '', name: '', kind: '', efcy: '', use: '', warn: '', se: '', store: '', openDays: 0, openText: '', dose: '' };
    const de = split(text, DE);
    if (de[1] || de[3] || de[5]) {
      out.lang = 'de';
      out.efcy = de[1] || ''; out.warn = de[2] || ''; out.use = de[3] || ''; out.se = de[4] || ''; out.store = de[5] || '';
      const h = text.match(DE[0][1]);
      out.name = nameOf(text, h && h[0]);
    } else {
      const ko = split(text, KO);
      if (!ko.efcy && !ko.use) return null;
      out.lang = 'ko';
      Object.assign(out, { efcy: ko.efcy || '', use: ko.use || '', warn: ko.warn || '', store: ko.store || '' });
    }
    for (const k of Object.keys(LIMIT)) out[k] = cut(tidy(out[k]), LIMIT[k]);
    const oa = openAfter(out.store + '\n' + text);
    if (oa) { out.openDays = oa.days; out.openText = oa.text; }
    out.kind = kindOf(out.name) || kindOf(text.slice(0, 800));
    out.dose = out.lang === 'de' ? doseSummary(out.use) : cut(out.use, 700);
    return out;
  }

  // ---------- Dosis für ein Kind aus der Dosierungstabelle / 용량표에서 아이 한 명의 용량 ----------
  // kid = { months: Alter in Monaten, kg: Gewicht oder 0 }. Gesucht wird die Zeile, deren Alters- (oder Gewichts-)
  // Bereich passt; „nicht anwenden“ bei passendem Alter wird als Warnung zurückgegeben.
  // kid = { months: 개월 수, kg: 몸무게(모르면 0) }. 나이(또는 몸무게) 범위가 맞는 줄을 찾음.
  // 그 나이에 "쓰지 말라"는 줄이면 경고로 돌려줌.
  const NUMW = '(\\d+(?:[.,]\\d+)?)';
  const DASH = '\\s*(?:[-–—~〜]|bis(?:\\s+unter)?|bis\\s+zu|부터)\\s*';
  const AGEU = '(Jahre|Jahren|Jahr|J\\.|세|살|Monate|Monaten|Monat|개월)';
  const num = s => parseFloat(String(s).replace(',', '.'));
  const inMonths = (n, u) => /^(Monat|개월)/i.test(u) ? n : n * 12;
  function ageRange(line) {
    let m;
    // „6 – 9 Jahre“, „만 4세~6세“, „7개월~23개월“, „von 2 bis 5 Jahren“
    if ((m = line.match(new RegExp(`(?:만\\s*)?(\\d+)\\s*(세|살|개월|Monate|Monaten|Monat|Jahre|Jahren)?${DASH}(?:만\\s*)?(\\d+)\\s*${AGEU}`, 'i')))) {
      const unitA = m[2] || m[4], excl = /bis\s+unter/i.test(m[0]);
      const hi = excl ? inMonths(+m[3], m[4]) - 0.01 : inMonths(+m[3], m[4]) + (/^(Monat|개월)/i.test(m[4]) ? 0.99 : 11.99);
      return [inMonths(+m[1], unitA), hi, m[0]];
    }
    // „ab 12 Jahren“, „12세 이상“ / 이상
    if ((m = line.match(new RegExp(`(?:ab|über|älter als)\\s+(\\d+)\\s*${AGEU}`, 'i'))) || (m = line.match(new RegExp(`(?:만\\s*)?(\\d+)\\s*${AGEU}\\s*이상`))))
      return [inMonths(+m[1], m[2]), Infinity, m[0]];
    // „unter 6 Jahren“, „6세 미만“ / 미만
    if ((m = line.match(new RegExp(`(?:unter|jünger als)\\s+(\\d+)\\s*${AGEU}`, 'i'))) || (m = line.match(new RegExp(`(?:만\\s*)?(\\d+)\\s*${AGEU}\\s*미만`))))
      return [0, inMonths(+m[1], m[2]) - 0.01, m[0]];
    // „bis 6 Jahre“, „6세 이하“
    if ((m = line.match(new RegExp(`(?:bis|bis zu)\\s+(\\d+)\\s*${AGEU}`, 'i'))) || (m = line.match(new RegExp(`(?:만\\s*)?(\\d+)\\s*${AGEU}\\s*이하`))))
      return [0, inMonths(+m[1], m[2]) + 11.99, m[0]];
    return null;
  }
  function kgRange(line) {
    const m = line.match(new RegExp(`${NUMW}${DASH}${NUMW}\\s*kg`, 'i'));
    return m ? [num(m[1]), num(m[2]), m[0]] : null;
  }
  // Menge des Arzneimittels (ml/Tabletten vor mg, weil mg oft die Wirkstoffmenge ist) / 약의 양(mg보다 ml·정 우선)
  function amountOf(line) {
    const units = ['ml|mL|Milliliter|Messlöffel|Dosierspritze', 'Tabletten?|Filmtabletten?|Kapseln?|Zäpfchen|Beutel|Brausetabletten?|Hub|Hübe|Sprühstoß|Sprühstöße|Tropfen|정|캡슐|포|방울|좌제|개|회분', 'mg'];
    const clean = line.replace(new RegExp(`${NUMW}${DASH}${NUMW}\\s*kg`, 'gi'), ' ').replace(/\d+(?:[.,]\d+)?\s*mg\s*\/\s*kg/gi, ' ');
    for (const u of units) {
      const m = clean.match(new RegExp(`(?:${NUMW}${DASH})?${NUMW}\\s*(${u})(?![a-zäöü])`, 'i'));
      if (m) return (m[1] ? `${m[1]}–${m[2]}` : m[2]) + ' ' + m[3];
    }
    return '';
  }
  const FREQ = /(bis zu \d+[- ]?mal (?:täglich|am Tag|pro Tag)|\d+[- ]?(?:bis \d+[- ]?)?mal (?:täglich|am Tag|pro Tag)|alle \d+(?:\s*[-–]\s*\d+)? Stunden|1일\s*\d+(?:\s*~\s*\d+)?\s*회|\d+(?:\s*[-~]\s*\d+)?\s*시간\s*(?:마다|간격))/i;
  const NO = /nicht (?:anwenden|einnehmen|geben|verwenden|geeignet)|darf nicht|sollen nicht|kontraindiziert|투여하지\s*(?:말|않)|사용하지\s*(?:말|않)|복용하지\s*(?:말|않)/i;
  function kidDose(section, kid) {
    if (!section || !kid || !(kid.months >= 0)) return null;
    const lines = tidy(section).split('\n').flatMap(l => l.split(/(?<=\.)\s+(?=[A-ZÄÖÜ가-힣])|;\s*/)).map(s => s.trim()).filter(Boolean);
    const general = (tidy(section).match(FREQ) || [])[0] || '';
    let best = null;
    for (const line of lines) {
      const ar = ageRange(line), kr = kgRange(line);
      if (!ar && !kr) continue;
      const byKg = kid.kg > 0 && kr && kid.kg >= kr[0] && kid.kg <= kr[1];
      const byAge = ar && kid.months >= ar[0] && kid.months <= ar[1];
      if (!byKg && !(byAge && !(kid.kg > 0 && kr))) continue;
      const score = (byKg ? 2 : 0) + (byAge ? 1 : 0) + (ar && ar[1] !== Infinity ? 0.5 : 0);
      if (best && best.score >= score) continue;
      if (NO.test(line)) { best = { score, warn: true, text: line }; continue; }
      const amt = amountOf(line);
      if (!amt) continue;
      const freq = (line.match(FREQ) || [])[0] || general;
      const range = [ar && ar[2], kr && kr[2]].filter(Boolean).map(s => s.replace(/\s+/g, ' ').trim()).join(', ');
      best = { score, amount: amt, freq, range, text: line };
    }
    return best;
  }

  root.MedLeaflet = { parse, openAfter, kindOf, kidDose, ageRange, amountOf, split: t => split(tidy(t), DE) };
})(typeof window !== 'undefined' ? window : globalThis);
