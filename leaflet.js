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

  root.MedLeaflet = { parse, openAfter, kindOf, split: t => split(tidy(t), DE) };
})(typeof window !== 'undefined' ? window : globalThis);
