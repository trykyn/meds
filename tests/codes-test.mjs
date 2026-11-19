// node meds/tests/codes-test.mjs — Barcode-Parser prüfen / 바코드 해석기 확인
import '../codes.js';
const { parse, key, pznOk, gtinOk } = globalThis.MedCode;
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fail++; console.log('FAIL', name, '\n  got ', g, '\n  want', w); } else console.log('ok  ', name);
};
const pick = (o, ks) => o && Object.fromEntries(ks.map(k => [k, o[k]]));
const GS = '\x1d', RS = '\x1e', EOT = '\x04';
const gtinCheck = b => { let s = 0; b.split('').reverse().forEach((d, i) => s += +d * (i % 2 ? 1 : 3)); return b + (10 - s % 10) % 10; };

eq('pzn check 01234562', pznOk('01234562'), true);
eq('pzn check wrong', pznOk('01234563'), false);
const gtin = gtinCheck('0415001234562');
eq('gtin check', gtinOk(gtin), true);

// Securpharm IFA
eq('IFA datamatrix', pick(parse(`[)>${RS}06${GS}9N110123456207${GS}1TCH4711${GS}D270600${GS}SABC123XYZ${RS}${EOT}`), ['pzn', 'exp', 'batch', 'serial', 'country', 'kind']),
  { pzn: '01234562', exp: '2027-06-30', batch: 'CH4711', serial: 'ABC123XYZ', country: 'de', kind: 'ifa' });
eq('IFA, D mit Tag', parse(`[)>${RS}06${GS}9N110123456207${GS}D261115${GS}1TX9${GS}S1`).exp, '2026-11-15');
// GS1 mit NTIN
eq('GS1 NTIN', pick(parse(`01${gtin}17280228${'10'}LOT55${GS}21SER9`), ['pzn', 'exp', 'batch', 'serial', 'kind']),
  { pzn: '01234562', exp: '2028-02-28', batch: 'LOT55', serial: 'SER9', kind: 'gs1' });
eq('GS1 symbology prefix + serial first', pick(parse(`]d201${gtin}21SER9${GS}17280200${'10'}LOT55`), ['pzn', 'exp', 'batch', 'serial']),
  { pzn: '01234562', exp: '2028-02-29', batch: 'LOT55', serial: 'SER9' });
eq('GS1 with leading FNC1 (zxing plain text)', pick(parse(`${GS}01${gtin}17280228${'10'}LOT55${GS}21SER9`), ['pzn', 'exp', 'batch', 'serial']),
  { pzn: '01234562', exp: '2028-02-28', batch: 'LOT55', serial: 'SER9' });
eq('GS1 parentheses', pick(parse(`(01)${gtin}(17)271231(10)A1(21)B2`), ['pzn', 'exp', 'batch', 'serial']),
  { pzn: '01234562', exp: '2027-12-31', batch: 'A1', serial: 'B2' });
// Korea: GS1 DataMatrix mit 0880…
const kr = gtinCheck('880123456789').slice(0);
const krGtin = '0' + kr;
eq('Korea GS1', pick(parse(`01${krGtin}17290131${'10'}K1${GS}21S`), ['ean', 'pzn', 'exp', 'country']),
  { ean: kr, pzn: '', exp: '2029-01-31', country: 'kr' });
eq('Korea EAN-13', pick(parse(kr), ['ean', 'country', 'kind']), { ean: kr, country: 'kr', kind: 'ean' });
// Code 39 PZN
eq('Code39 -PZN', pick(parse('-01234562'), ['pzn', 'kind']), { pzn: '01234562', kind: 'pzn' });
eq('typed PZN-…', parse('PZN-01234562').pzn, '01234562');
eq('typed PZN 7', parse('1234562').pzn, '01234562');
eq('typed with spaces', parse(' pzn 0123 4562 ').pzn, '01234562');
eq('bad 8 digits', parse('01234563').kind, 'pzn?');
eq('empty', parse('  '), null);
eq('key pzn', key(parse('-01234562')), 'pzn:01234562');
eq('key ean', key(parse(kr)), 'ean:' + kr);
eq('bad date', parse(`[)>${RS}06${GS}9N110123456207${GS}D271340`).exp, '');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
