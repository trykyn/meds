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

// Kinderdosis nach Alter / 나이별 아이 용량 (예: 83개월 아이, 56개월 아이)
const { kidDose } = globalThis.MedLeaflet;
const kidA = { months: 83 }, kidB = { months: 56 };
const d1 = kidDose(p.use, kidA), a1 = kidDose(p.use, kidB);
eq('DE kidA amount', d1 && d1.amount, '7,5 ml');
has('DE kidA freq', d1 && d1.freq, 'bis zu 3-mal täglich');
eq('DE kidB amount', a1 && a1.amount, '5 ml');
const KTAB = `만 12세 이하의 소아:
다음 1회 권장용량을 4-6시간 마다 필요시 복용한다.
연령 | 몸무게 | 아세트아미노펜으로서 1회 권장 용량 | 이 약 1회 권장용량
4개월~6개월 | 7 ~ 7.9kg | 80mg | 2.5mL
7개월~23개월 | 8 ~ 11.9kg | 120mg | 3.5mL
만 2~3세 | 12 ~ 15.9kg | 160mg | 5mL
만 4세~6세 | 16 ~ 22.9kg | 240mg | 7.5mL
만 7세~8세 | 23 ~ 29.9kg | 320mg | 10mL`;
const d2 = kidDose(KTAB, kidA), a2 = kidDose(KTAB, kidB);
eq('KO 6세', d2 && d2.amount, '7.5 mL');
eq('KO 4세', a2 && a2.amount, '7.5 mL');
has('KO general freq', d2 && d2.freq, '4-6시간 마다');
eq('KO by weight wins', kidDose(KTAB, { months: 83, kg: 24 }).amount, '10 mL');
eq('KO baby months', kidDose(KTAB, { months: 10 }).amount, '3.5 mL');
const NOKID = `Erwachsene und Jugendliche ab 12 Jahren: 1 Tablette bis zu 3-mal täglich.
Kinder unter 12 Jahren: Nicht anwenden.`;
eq('DE not for kids → warning', kidDose(NOKID, kidA).warn, true);
eq('DE adult row not for kid', kidDose('Erwachsene ab 12 Jahren: 2 Tabletten.', kidB), null);
eq('DE ab 6 Jahren', kidDose('Kinder ab 6 Jahren: 1 Hub 3-mal täglich.', kidA).amount, '1 Hub');
eq('DE 2-5 Jahre tabs', kidDose('Kinder von 2 bis 5 Jahren: ½ bis 1 Tablette; Kinder von 6 bis 11 Jahren: 1–2 Tabletten', kidA).amount, '1–2 Tabletten');
eq('DE bis unter 6', kidDose('Kinder bis unter 6 Jahre: 2,5 ml 2-mal täglich', { months: 72 }), null);

// Kurzfassung / 짧은 요약
const { brief } = globalThis.MedLeaflet;
const b = brief(p);
eq('brief efcy', b.efcy, 'Es wird angewendet zur kurzzeitigen Behandlung von Fieber sowie leichten bis mäßig starken Schmerzen.');
eq('brief dose no boilerplate', b.dose.includes('Packungsbeilage'), false);
has('brief dose has amount', b.dose, '7,5 ml');
eq('brief dose ≤ 3 lines', b.dose.split('\n').length <= 3, true);
eq('brief store', b.store, 'Nicht über 25 °C lagern.');
const kb = brief(k);
has('ko brief efcy', kb.efcy, '발열 및 동통');
eq('ko brief store', kb.store, '기밀용기, 실온보관');

// Wirkstoffe / 성분
const { ingredients, schedule } = globalThis.MedLeaflet;
eq('ingr line', p.ingr, 'Ibuprofen');
eq('ingr DE', ingredients(['Fiebersaft Junior', p.ingr]), ['ibuprofen']);
eq('ingr brand', ingredients(['ben-u-ron Zäpfchen 250']), ['paracetamol']);
eq('ingr KO name', ingredients(['타이레놀정500밀리그람(아세트아미노펜)']), ['paracetamol']);
eq('ingr ATC combo', ingredients(['판콜에이내복액'], 'N02BE51'), ['paracetamol']);
eq('dexibuprofen not ibuprofen', ingredients(['맥시부펜시럽(덱시부프로펜)']), ['dexibuprofen']);
eq('nothing', ingredients(['Bepanthen Wundsalbe']), []);
// Abstand / 간격·횟수
eq('sched DE', schedule('Kinder 6 – 9 Jahre: 7,5 ml bis zu 3-mal täglich. Zwischen den Gaben mindestens 6 Stunden Abstand.'), { minHours: 6, maxPerDay: 3 });
eq('sched alle', schedule('alle 4 – 6 Stunden 1 Tablette, höchstens 4-mal täglich'), { minHours: 4, maxPerDay: 4 });
eq('sched KO', schedule('1회 권장용량을 4-6시간 마다 필요시 복용한다. 1일 5회를 초과하지 않는다.'), { minHours: 4, maxPerDay: 5 });
eq('sched KO short', schedule('7.5 mL · 하루 최대 3번'), { minHours: 0, maxPerDay: 3 });
eq('sched none', schedule('morgens 1 Tablette'), { minHours: 0, maxPerDay: 0 });

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
