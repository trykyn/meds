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
    // PDF-Zeilenumbrüche zuerst verbinden / PDF 줄바꿈 먼저 잇기
    text = unwrap(text);
    const N = '(\\d+|ein|eine|einen|einem|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|vierzehn|achtzehn|vierundzwanzig)';
    const U = '(Tag|Tage|Tagen|Woche|Wochen|Monat|Monate|Monaten|Jahr|Jahre|Jahren)';
    const OPEN = '(?:(?:dem|der|des)\\s+)?(?:ersten\\s+|erstmaligen\\s+)?(?:Öffnen|Öffnung|Anbruch|Anbrechen|Anbruchs|Gebrauch|Anwendung|Erstgebrauch|Erstanwendung)';
    const res = [
      new RegExp(`nach\\s+${OPEN}[^.\\n]{0,100}?${N}\\s*${U}`, 'i'),
      new RegExp(`${N}\\s*${U}[^.\\n]{0,60}?nach\\s+${OPEN}`, 'i'),
      new RegExp(`Haltbarkeit\\s+nach\\s+${OPEN}[^.\\n]{0,20}?${N}\\s*${U}`, 'i'),
      // „Angebrochene Packungen sind 3 Monate haltbar“, „geöffnete Flasche … 4 Wochen“
      new RegExp(`(?:angebrochen|geöffnet|Anbruch)\\w*[^.\\n]{0,60}?${N}\\s*${U}`, 'i'),
    ];
    for (const re of res) {
      const m = text.match(re);
      if (m) {
        const n = toNum(m[1]);
        if (n) return { days: unit(n, m[2]), text: sentence(text, m.index) };
      }
    }
    const k = text.match(/개봉\s*(?:한\s*|된\s*)?(?:후|뒤|일로부터|일부터|하면|하신 후)[^.\n]{0,25}?(\d+)\s*(일|주|개월|달|년)/);
    if (k && k[2] === '달') k[2] = '개월';
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
  // Hinweiszeilen, die kein Name sind / 이름이 아닌 안내 줄
  const NOT_NAME = /^(Wirkstoff|Lesen Sie|Zur Anwendung|Für (Kinder|Erwachsene|Säuglinge)|Körpergewicht|ab \d|Anwendung bei|\(|\d+\s*(Monate|Jahre)|\d+\.\s|Was (ist|sind|in dieser))/i;
  function nameOf(text, sec1Heading) {
    // Name aus der Überschrift „1. Was ist … und wofür“ – steht in jedem Beipackzettel / 1번 제목의 이름(모든 설명서에 있음)
    const h = String(sec1Heading || '').match(/Was ist\s+([\s\S]{2,90}?)\s+und\s+wof/i);
    const hn = h ? h[1].replace(/\s+/g, ' ').trim() : '';
    const m = text.match(/Gebrauchsinformation\s*:?\s*Information\s+für\s+(?:den\s+|die\s+)?(?:Anwender|Patienten|Anwenderinnen)[^\n]*\n+((?:[^\n]*\n){1,8})/i);
    if (m) {
      const lines = m[1].split('\n').map(x => x.trim()).filter(x => x && !NOT_NAME.test(x));
      if (lines.length) {
        let n = lines[0];
        // zweite Zeile gehört dazu, wenn sie wie Stärke/Darreichungsform aussieht / 두 번째 줄이 함량·제형이면 이어 붙임
        if (lines[1] && /\d\s*(mg|g|ml|%)|\b(Tabletten|Filmtabletten|Saft|Suspension|Tropfen|Spray|Salbe|Creme|Kapseln|Weichkapseln|Zäpfchen|Granulat|Lösung)\b/i.test(lines[1])
          && !/\b(wird|werden|ist|sind|zur|bei)\b/i.test(lines[1]) && lines[1].length < 60) n += ' ' + lines[1];
        n = n.replace(/\s+/g, ' ');
        // Passt die Zeile nicht zur Überschrift, ist die Überschrift sicherer / 제목 이름과 안 맞으면 제목 이름을 씀
        const first = (hn.split(' ')[0] || '').toLowerCase();
        if (!hn || n.toLowerCase().includes(first)) return n;
        return hn + (/\d\s*(mg|ml)/i.test(n) && !/\d\s*(mg|ml)/i.test(hn) ? ' ' + (n.match(/\d+(?:[.,]\d+)?\s*(?:mg|ml|mg\/ml)(?:\/ml)?/i) || [''])[0] : '');
      }
    }
    return hn;
  }
  // Im PDF umgebrochene Zeilen wieder zu Sätzen verbinden / PDF에서 끊긴 줄을 문장으로 다시 잇기
  const unwrap = t => String(t || '')
    .replace(/(\w)-\n(?=[a-zäöüß])/g, '$1')
    .replace(/([^\n.:!?;])\n(?![\n\-•*·]|\d+\.\s|\s*$)/g, '$1 ');
  // Tabellenzeilen (nach Höhe sortiert) mit Alter/Gewicht und Menge; zweizeilige Zellen zusammenführen
  // 높이로 맞춘 표 줄 중 나이·체중과 양이 있는 줄. 두 줄짜리 칸은 합침.
  function tableRows(rows) {
    // Zeile = Zellen „x@Text“ mit Tab dazwischen (aus pdfText) / 줄 = 'x@글' 칸들(탭 구분)
    const cellsOf = l => l.split('\t').map(c => { const m = c.match(/^(-?\d+)@([\s\S]*)$/); return m ? { x: +m[1], s: m[2].replace(/\s+/g, ' ').trim() } : { x: 0, s: c.trim() }; }).filter(c => c.s);
    const ls = String(rows).split('\n').map(cellsOf), out = [];
    for (let i = 0; i < ls.length; i++) {
      const cs = ls[i];
      for (let j = 0; j < cs.length; j++) {
        const c = cs[j];
        if (!(ageRange(c.s) || kgRange(c.s))) continue;
        // Bereich und Menge in derselben Zelle oder in den nächsten zwei Zellen / 범위와 양: 같은 칸이거나 다음 두 칸
        const tail = amountOf(c.s) ? [] : cs.slice(j + 1, j + 3).map(x => x.s);
        if (!amountOf(c.s) && !tail.some(t => amountOf(t))) continue;
        let range = c.s;
        // Zweizeilige Zelle: darunter steht an gleicher Stelle das Alter „(6 - 9 Jahre)“ / 아래 줄 같은 위치의 나이
        // (zentriert gesetzt → x leicht verschoben; erst darunter, dann darüber suchen) / 아래, 그다음 위 줄에서 찾기
        // Andere Spalten schieben sich dazwischen → bis zu 3 Zeilen weiter suchen; nur den Altersteil nehmen.
        // 다른 단의 줄이 끼어들 수 있어서 3줄까지 찾고, 나이 부분만 가져옴.
        const near = l => (l || []).find(x => Math.abs(x.x - c.x) < 45 && ageRange(x.s) && !amountOf(x.s) && !kgRange(x.s));
        const below = near(ls[i + 1]) || near(ls[i + 2]) || near(ls[i + 3]) || near(ls[i - 1]);
        if (below && !ageRange(range)) range += ` (${ageRange(below.s)[2].trim()})`;
        out.push([range, ...tail].join(' | '));
        break;
      }
    }
    return out.slice(0, 14);
  }

  // Dosierung kurz: Standardsätze am Anfang weglassen / 먹는 법 요약: 앞의 정해진 안내 문장 빼기
  function doseSummary(s) {
    let t = tidy(s)
      .replace(/^[^\n]*?(?:immer genau|genau wie in dieser Packungsbeilage|nach Absprache mit Ihrem Arzt|wie mit Ihrem Arzt)[^\n.]*\.(?:[^\n.]*Fragen Sie[^\n.]*\.)?\s*/i, '')
      .replace(/^[^\n.]*Fragen Sie bei Ihrem Arzt oder Apotheker nach[^\n.]*\.\s*/i, '');
    return cut(t, 700);
  }

  function parse(raw) {
    // PDF: hinter „\u0000ROWS“ steht derselbe Text zeilenweise nach Höhe (für Tabellen) / PDF는 뒤에 높이별 줄이 붙어 옴
    const [main, rows = ''] = String(raw || '').split('\u0000ROWS');
    const text = tidy(main);
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
    // Dosierungstabelle aus der Höhen-Fassung anhängen, wenn der Text sie zerlegt hat / 표가 흩어졌으면 높이별 줄을 붙임
    const tr = rows ? tableRows(rows) : [];
    // Leerzeile davor, damit die Tabelle nicht an den letzten Satz angehängt wird / 빈 줄로 띄워서 앞 문장에 붙지 않게
    if (tr.length && !tr.every(r => out.use.includes(r))) out.use += '\n\n' + tr.join('\n');
    const oa = openAfter(unwrap(out.store) + '\n' + unwrap(text));
    if (oa) { out.openDays = oa.days; out.openText = oa.text; }
    out.kind = kindOf(out.name) || kindOf(text.slice(0, 800));
    out.ingr = ingrText(text);
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
  // „1/2“, „½“ → „0,5“ / 분수를 소수로
  const fractions = x => String(x || '').replace(/½/g, '0,5').replace(/¼/g, '0,25').replace(/¾/g, '0,75').replace(/\b([1-3])\s*\/\s*([2-4])\b/g, (_, a, b) => String(+a / +b).replace('.', ','));
  function amountOf(line) {
    line = fractions(line);
    const units = ['ml|mL|Milliliter|Messlöffel|Dosierspritze', 'Tabletten?|Filmtabletten?|Kapseln?|Zäpfchen|Beutel|Brausetabletten?|Hub|Hübe|Sprühstoß|Sprühstöße|Tropfen|정|캡슐|포|방울|좌제|개|회분', 'mg'];
    const clean = line.replace(new RegExp(`${NUMW}${DASH}${NUMW}\\s*kg`, 'gi'), ' ').replace(/\d+(?:[.,]\d+)?\s*mg\s*\/\s*kg/gi, ' ');
    for (const u of units) {
      const m = clean.match(new RegExp(`(?:${NUMW}${DASH})?${NUMW}\\s*(${u})(?![a-zäöü])`, 'i'));
      if (m) return (m[1] ? `${m[1]}–${m[2]}` : m[2]) + ' ' + m[3];
    }
    return '';
  }
  const FREQ = /(bis zu \d+[- ]?mal (?:täglich|am Tag|pro Tag)|\d+[- ]?(?:bis \d+[- ]?)?mal (?:täglich|am Tag|pro Tag)|alle \d+(?:\s*[-–]\s*\d+)? Stunden|1일\s*\d+(?:\s*~\s*\d+)?\s*회|\d+(?:\s*[-~]\s*\d+)?\s*시간\s*(?:마다|간격)|\b\d+\s*(?:-\s*\d+\s*)?-?mal\b)/i;
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

  // ---------- Kurzfassung für die Anzeige / 화면용 짧은 요약 ----------
  // Ohne KI: aus jedem Abschnitt nur die Sätze mit dem Wesentlichen (Anwendung, Mengen/Häufigkeit, Temperatur).
  // AI 없이: 각 항목에서 핵심 문장만(무엇에 쓰나, 양·횟수, 보관 온도).
  const sents = t => unwrap(tidy(t)).split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/^\s*(?:\d+\.|[-•·])\s*/, '').trim()).filter(s => s.length > 2);
  const BOILER = /Packungsbeilage|Fragen Sie|Ihr Arzt hat|immer genau|für Kinder unzugänglich|außer Sicht- und Reichweite|nach dem auf|Verfalldatum|어린이의 손이 닿지|의사.*상의|약사.*상의/i;
  function briefEfcy(t) {
    const s = sents(t).filter(x => !BOILER.test(x) && !/^(?:주\s*)?효능[\s·・ㆍ]*효과$|^다음 질환에도/.test(x));
    const hit = s.find(x => /angewendet|zur Behandlung|zur Linderung|eingesetzt/i.test(x)) || s.find(x => /gegen\s|bei\s/i.test(x)) || s[0] || '';
    // Koreanisch: oft eine Liste in einer Zeile – die ist schon kurz / 한국어는 보통 한 줄 나열이라 그대로
    return cut(hit, 160);
  }
  function briefDose(t) {
    const amt = /\d\s*(?:ml|mL|mg|g\b|Tablette|Kapsel|Beutel|Zäpfchen|Hub|Hübe|Sprühstoß|Tropfen|정|캡슐|포|방울|회)/i;
    const scored = sents(t).map((s, i) => ({ s, i, n: (amt.test(s) ? 2 : 0) + (FREQ.test(s) ? 1 : 0) + (/Erwachsene|Jugendliche|성인|어른|만\s*\d+세\s*이상|höchstens|maximal|최대|초과/i.test(s) ? 1 : 0) - (/\|/.test(s) ? 9 : 0) - (BOILER.test(s) ? 3 : 0) }))
      .filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 3).sort((a, b) => a.i - b.i);
    return scored.map(x => cut(x.s, 110)).join('\n');
  }
  function briefStore(t) {
    const s = sents(t).filter(x => /°\s*C|Grad|Kühlschrank|kühl|Raumtemperatur|Licht|Feuchtigkeit|einfrieren|실온|냉장|차광|습기|기밀|밀폐|서늘|\d+\s*℃/i.test(x) && !BOILER.test(x));
    return s.slice(0, 2).map(x => cut(x, 110)).join('\n');
  }
  const brief = i => !i ? {} : { efcy: briefEfcy(i.efcy || ''), dose: briefDose(i.use || ''), store: briefStore(i.store || '') };

  // ---------- Wirkstoffe / 성분 ----------
  // Häufige Wirkstoffe in Haus-Apotheken, deutsch/koreanisch/Markennamen und ATC-Codes (z. B. aus der HIRA-Liste).
  // 집에 흔한 성분: 독일어·한국어·상품명·ATC 코드로 알아봄.
  const INGR = [
    ['paracetamol', '아세트아미노펜', 'Paracetamol', /paracetamol|acetaminophen|아세트아미노펜|타이레놀|tylenol|ben-u-ron|펜잘|게보린|판콜|판피린|챔프/i, /^N02BE(01|51|71)/],
    ['ibuprofen', '이부프로펜', 'Ibuprofen', /(?<!dex)ibuprofen|이부프로펜|nurofen|dolormin|dolo-?dobendan|ibu-?ratiopharm|부루펜|애드빌|advil|이지엔6/i, /^M01AE(01|51)/],
    ['dexibuprofen', '덱시부프로펜', 'Dexibuprofen', /dexibuprofen|덱시부프로펜|맥시부펜/i, /^M01AE14/],
    ['naproxen', '나프록센', 'Naproxen', /naproxen|나프록센|탁센|aleve|dolormin migräne/i, /^M01AE02/],
    ['aspirin', '아스피린(아세틸살리실산)', 'Acetylsalicylsäure', /acetylsalicyl|aspirin|아스피린|아세틸살리실산|\bASS\b/i, /^N02BA(01|51)|^B01AC06/],
    ['cetirizin', '세티리진', 'Cetirizin', /(?<!levo)cetirizin|세티리진|zyrtec|지르텍/i, /^R06AE07/],
    ['levocetirizin', '레보세티리진', 'Levocetirizin', /levocetirizin|레보세티리진|xusal|씨잘/i, /^R06AE09/],
    ['loratadin', '로라타딘', 'Loratadin', /(?<!deslo)loratadin|로라타딘|lorano|클라리틴/i, /^R06AX13/],
    ['dimetinden', '디메틴덴', 'Dimetinden', /dimetinden|디메틴덴|fenistil/i, /^R06AB03|^D04AA13/],
    ['chlorphenamin', '클로르페니라민', 'Chlorphenamin', /chlorphenamin|클로르페니라민/i, /^R06AB0[24]/],
    ['xylometazolin', '자일로메타졸린', 'Xylometazolin', /xylometazolin|자일로메타졸린|otriven|오트리빈|nasic|olynth|nasenspray ratiopharm/i, /^R01AA07|^R01AB06/],
    ['oxymetazolin', '옥시메타졸린', 'Oxymetazolin', /oxymetazolin|옥시메타졸린|nasivin|화이투벤 나잘/i, /^R01AA05/],
    ['ambroxol', '암브록솔', 'Ambroxol', /ambroxol|암브록솔|mucosolvan|뮤코솔반/i, /^R05CB06/],
    ['acetylcystein', '아세틸시스테인', 'Acetylcystein', /acetylcystein|아세틸시스테인|\bACC\b|fluimucil|뮤테란/i, /^R05CB01/],
    ['dextromethorphan', '덱스트로메토르판', 'Dextromethorphan', /dextromethorphan|덱스트로메토르판/i, /^R05DA09/],
    ['pseudoephedrin', '슈도에페드린', 'Pseudoephedrin', /pseudoephedrin|슈도에페드린/i, /^R01BA02/],
    ['phenylephrin', '페닐레프린', 'Phenylephrin', /phenylephrin|페닐레프린/i, /^R01BA03/],
    ['loperamid', '로페라미드', 'Loperamid', /loperamid|로페라미드|imodium|lopedium|로프민/i, /^A07DA03/],
    ['diphenhydramin', '디펜히드라민', 'Diphenhydramin', /diphenhydramin|디펜히드라민/i, /^R06AA02/],
    ['guaifenesin', '구아이페네신', 'Guaifenesin', /guaifenesin|구아이페네신/i, /^R05CA03/],
    ['simeticon', '시메티콘', 'Simeticon', /simeticon|dimeticon|시메티콘|lefax|sab simplex|espumisan/i, /^A03AX13/],
    ['efeu', '아이비엽(헤데라)', 'Efeublätter', /efeu|hedera|헤데라|아이비엽|prospan|프로스판/i, /^R05CA12/],
  ];
  // Wirkstoff-Zeile aus dem Beipackzettel / 설명서의 성분 줄
  function ingrText(text) {
    const m = text.match(/Wirkstoff(?:e)?\s*[:：]\s*([^\n]{2,160})|Der Wirkstoff ist\s+([^.\n]{2,120})|Die Wirkstoffe sind\s+([^.\n]{2,160})|(?:주성분|유효성분)\s*[:：]?\s*([^\n]{2,160})/i);
    return m ? (m[1] || m[2] || m[3] || m[4]).trim() : '';
  }
  // Wirkstoff-Schlüssel aus Name, Wirkstoff-Zeile, Dosierungstext und ATC / 이름·성분 줄·용법·ATC로 성분 열쇠
  function ingredients(parts, atc) {
    const t = parts.filter(Boolean).join('\n');
    return INGR.filter(([, , , re, at]) => re.test(t) || (atc && at.test(atc))).map(x => x[0]);
  }
  const ingrName = (k, lang) => { const x = INGR.find(i => i[0] === k); return x ? (lang === 'de' ? x[2] : x[1]) : k; };

  // ---------- Abstand und Höchstzahl pro Tag / 복용 간격과 하루 최대 횟수 ----------
  // „alle 6 Stunden“, „mindestens 6 Stunden Abstand“, „4-6시간 마다“, „bis zu 3-mal täglich“, „1일 5회“, „하루 최대 3번“
  function schedule(text) {
    const t = String(text || '');
    let minHours = 0, maxPerDay = 0, m;
    if ((m = t.match(/alle\s+(\d+)(?:\s*(?:[-–]|bis)\s*\d+)?\s*Stunden/i)) || (m = t.match(/(?:mindestens|frühestens nach)\s+(\d+)\s*Stunden/i))
      || (m = t.match(/Abstand[^.\n]{0,40}?(\d+)\s*Stunden/i)) || (m = t.match(/(\d+)\s*(?:[-~–]\s*\d+\s*)?시간\s*(?:마다|간격|이상)/))
      || (m = t.match(/(\d+)(?:\s*[-–]\s*\d+)?\s*Stunden\s*(?:Abstand|Pause)/i))) minHours = +m[1];
    if ((m = t.match(/Gesamtdosis von\s+(\d+)\s+(?:Kapseln|Tabletten|Zäpfchen|Beuteln|Messlöffeln|Einzeldosen)/i))
      || (m = t.match(/nicht mehr als\s+(\d+)\s+(?:Kapseln|Tabletten|Zäpfchen|Beutel|Einzeldosen)[^.]{0,50}?(?:24 Stunden|täglich|pro Tag)/i))
      || (m = t.match(/bis zu\s+(\d+)[- ]?mal\s*(?:täglich|am Tag|pro Tag|in 24)/i)) || (m = t.match(/(?:höchstens|maximal|max\.)\s+(\d+)[- ]?mal/i))
      || (m = t.match(/1일\s*(?:최대\s*)?(\d+)\s*회/)) || (m = t.match(/하루\s*(?:최대\s*)?(\d+)\s*(?:번|회)/))
      || (m = t.match(/(\d+)(?:\s*(?:[-–]|bis)\s*(\d+))?[- ]?mal\s*(?:täglich|am Tag|pro Tag)/i))
      // Tabellenspalte „Maximale Häufigkeit“: nur „3mal“ / 표의 '최대 횟수' 칸: '3mal'만 있음
      || (m = t.match(/\b(\d+)(?:\s*-\s*(\d+))?\s*-?mal\b(?!ig)/i))) maxPerDay = +(m[2] || m[1]);
    return { minHours, maxPerDay };
  }

  root.MedLeaflet = { parse, openAfter, kindOf, kidDose, brief, briefDose, ingredients, ingrText, ingrName, schedule, INGR, ageRange, amountOf, fractions, split: t => split(tidy(t), DE) };
})(typeof window !== 'undefined' ? window : globalThis);
