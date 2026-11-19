// node meds/tests/leaflet-test.mjs — Beipackzettel-Zerleger prüfen / 설명서 해석기 확인
// Die Beispieltexte sind selbst geschrieben und folgen nur der EU-Gliederung. / 예시 글은 직접 쓴 것(EU 목차 형식만 따름).
import '../leaflet.js';
const { parse, openAfter } = globalThis.MedLeaflet;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fail++; console.log('FAIL', name, '\n  got ', g, '\n  want', w); } else console.log('ok  ', name);
};
const has = (name, s, part) => eq(name, String(s).includes(part), true);

const DE = `Gebrauchsinformation: Information für Anwender
Fiebersaft Junior 40 mg/ml
Suspension zum Einnehmen
Wirkstoff: Ibuprofen
Lesen Sie die gesamte Packungsbeilage sorgfältig durch.
Was in dieser Packungsbeilage steht
1. Was ist Fiebersaft Junior und wofür wird es angewendet?
2. Was sollten Sie vor der Einnahme von Fiebersaft Junior beachten?
3. Wie ist Fiebersaft Junior einzunehmen?
4. Welche Nebenwirkungen sind möglich?
5. Wie ist Fiebersaft Junior aufzubewahren?
6. Inhalt der Packung und weitere Informationen
1. Was ist Fiebersaft Junior und wofür wird es
angewendet?
Fiebersaft Junior ist ein Arzneimittel gegen Fieber und Schmerzen.
Es wird angewendet zur kurzzeitigen Behandlung von Fieber sowie leichten bis mäßig starken Schmerzen.
2. Was sollten Sie vor der Einnahme von Fiebersaft Junior beachten?
Nicht einnehmen, wenn Ihr Kind allergisch gegen Ibuprofen ist.
3. Wie ist Fiebersaft Junior einzunehmen?
Geben Sie dieses Arzneimittel immer genau wie in dieser Packungsbeilage beschrieben. Fragen Sie bei Ihrem Arzt oder Apotheker nach, wenn Sie sich nicht sicher sind.
Kinder 6 – 9 Jahre (20 – 29 kg): 7,5 ml bis zu 3-mal täglich.
Kinder 3 – 5 Jahre (15 – 19 kg): 5 ml bis zu 3-mal täglich.
Zwischen den Gaben mindestens 6 Stunden Abstand.
4. Welche Nebenwirkungen sind möglich?
Wie alle Arzneimittel kann auch dieses Nebenwirkungen haben. Häufig: Bauchschmerzen.
5. Wie ist Fiebersaft Junior aufzubewahren?
Bewahren Sie dieses Arzneimittel für Kinder unzugänglich auf.
Nicht über 25 °C lagern.
Nach dem ersten Öffnen ist die Suspension 6 Monate haltbar.
6. Inhalt der Packung und weitere Informationen
Was Fiebersaft Junior enthält: Der Wirkstoff ist Ibuprofen.`;

const p = parse(DE);
eq('lang', p.lang, 'de');
eq('name', p.name, 'Fiebersaft Junior 40 mg/ml Suspension zum Einnehmen');
eq('kind', p.kind, 'syrup');
eq('open days', p.openDays, 182);
has('open sentence', p.openText, '6 Monate haltbar');
has('efcy body not TOC', p.efcy, 'gegen Fieber und Schmerzen');
has('dose keeps table lines', p.dose, 'Kinder 6 – 9 Jahre (20 – 29 kg): 7,5 ml');
eq('dose drops boilerplate', p.dose.includes('Packungsbeilage beschrieben'), false);
has('store', p.store, 'Nicht über 25 °C');
has('side effects', p.se, 'Bauchschmerzen');

// Varianten / 여러 표현
eq('Wochen nach Anbruch', openAfter('Nach Anbruch innerhalb von 4 Wochen verbrauchen.').days, 28);
eq('Wort-Zahl', openAfter('Nach dem ersten Öffnen sechs Monate verwendbar.').days, 182);
eq('umgekehrt', openAfter('Innerhalb von 14 Tagen nach dem Öffnen aufbrauchen.').days, 14);
eq('Haltbarkeit nach Anbruch:', openAfter('Haltbarkeit nach Anbruch: 12 Monate').days, 365);
eq('Korean', openAfter('개봉 후 1개월 이내에 사용하십시오.').days, 30);
eq('nothing', openAfter('Nicht über 25 °C lagern.'), null);

const KO = `효능효과
1. 주효능·효과
감기로 인한 발열 및 동통(통증), 두통
용법용량
만 12세 이하의 소아: 1회 권장용량을 4-6시간 마다 필요시 복용한다.
만 2~3세 | 12 ~ 15.9kg | 5mL
사용상의주의사항
1. 경고: 매일 세잔 이상 술을 마시는 사람은 의사와 상의할 것.
저장방법
기밀용기, 실온보관`;
const k = parse(KO);
eq('ko lang', k.lang, 'ko');
has('ko efcy', k.efcy, '발열 및 동통');
has('ko use', k.use, '4-6시간 마다');
has('ko warn', k.warn, '세잔 이상');
eq('ko store', k.store, '기밀용기, 실온보관');
eq('not a leaflet', parse('Hallo Welt, das ist kein Beipackzettel.'), null);

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
