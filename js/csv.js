// 퀴즈 실험실 v1 — 독립적인 CSV 파서와 블루킷 템플릿 검증기
// 브라우저/Node 양쪽에서 동작. CSV 표준 인용부호, 쉼표, 여러 줄 셀, BOM 지원.
export function parseCSV(source) {
  const text = String(source).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let columns = [], cell = '', line = 1, startLine = 1;
  let quoted = false, afterQuote = false;
  function field() { columns.push(cell); cell = ''; afterQuote = false; }
  function record() {
    field();
    if (columns.some(value => value.trim() !== '')) rows.push({ line: startLine, fields: columns });
    columns = []; startLine = line + 1;
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else {
        cell += ch;
        if (ch === '\n') line++;
      }
      continue;
    }
    if (afterQuote) {
      if (ch === ',') { field(); continue; }
      if (ch === '\n') { record(); line++; continue; }
      // CSV 내 인용 필드 뒤 허용 가능한 공백은 무시한다.
      if (ch === ' ' || ch === '\t') continue;
      throw new Error(`${line}행: 닫는 따옴표 뒤에 예상하지 못한 문자(${ch})가 있습니다.`);
    }
    if (ch === ',') { field(); continue; }
    if (ch === '\n') { record(); line++; continue; }
    if (ch === '"') {
      if (cell.length) throw new Error(`${line}행: 필드 중간의 따옴표는 두 번 반복하거나 인용부호로 감싸야 합니다.`);
      quoted = true;
    } else cell += ch;
  }
  if (quoted) throw new Error(`${startLine}행에서 시작한 따옴표가 닫히지 않았습니다.`);
  if (columns.length || cell !== '' || afterQuote || text.endsWith(',')) {
    field();
    if (columns.some(value => value.trim() !== '')) rows.push({ line: startLine, fields: columns });
  }
  return rows;
}

export function isHeader(fields) {
  const a = (fields[0] || '').trim().toLowerCase();
  const b = (fields[1] || '').trim().toLowerCase();
  return ['번호', 'no', 'no.', 'question #', 'question number', 'number', '#'].includes(a) ||
    (a === '' && ['문제', 'question', 'question text'].includes(b));
}

export function makeDraftRows(parsed) {
  const input = parsed.length && isHeader(parsed[0].fields) ? parsed.slice(1) : parsed;
  return input.map(row => ({
    line: row.line,
    fields: row.fields.slice(0, 10).concat(Array(Math.max(0, 10 - row.fields.length)).fill('')),
    columnCount: row.fields.length,
    acknowledged: row.fields.length === 10
  }));
}

export function validateRows(draftRows) {
  const issues = [];
  const problems = [];
  const seen = new Set();
  if (draftRows.length === 0) issues.push({ line: 1, message: '문항이 없습니다.' });
  if (draftRows.length > 500) issues.push({ line: 1, message: '한 세트에 최대 500문항까지만 저장할 수 있습니다.' });
  draftRows.forEach((row, idx) => {
    const add = message => issues.push({ line: row.line, message });
    if (row.columnCount !== 10 && !row.acknowledged) add(`원본 CSV가 ${row.columnCount}열입니다. 10열이 필요합니다. 원본을 수정하거나 '열 수 보정'을 명시적으로 눌러주세요.`);
    const f = row.fields.map(v => String(v ?? ''));
    const n = f[0].trim();
    if (!/^\d+$/.test(n) || Number(n) < 1) add('A열 문항 번호는 1부터 시작하는 양의 정수여야 합니다.');
    else {
      const num = Number(n);
      if (seen.has(num)) add(`A열 문항 번호 ${num}이 중복되었습니다.`);
      seen.add(num);
      if (num !== idx + 1) add(`A열 문항 번호는 ${idx + 1}이어야 합니다(현재 ${num}).`);
    }
    const prompt = f[1].trim();
    if (!prompt) add('B열 문제가 비어 있습니다.');
    if (prompt.length > 1500) add('B열 문제 길이는 최대 1,500자입니다.');
    const options = f.slice(2, 6).map(v => v.trim());
    const timeValue = f[6].trim();
    if (!/^\d+$/.test(timeValue) || Number(timeValue) < 1 || Number(timeValue) > 600) add('G열 제한 시간은 1~600 사이의 정수(초)여야 합니다.');
    if (f[8].trim()) add('I열은 비워두어야 합니다.');
    const marker = f[9].trim();
    if (marker !== '' && marker !== 'typing') add('J열은 객관식 공란 또는 주관식 typing만 허용합니다.');
    let type, correctIndex;
    if (marker === 'typing') {
      type = 'typing'; correctIndex = 0;
      if (f[7].trim()) add('주관식의 H열 정답 번호는 공란이어야 합니다.');
      if (!options[0]) add('주관식은 C열에 하나 이상의 허용 정답이 필요합니다.');
    } else {
      type = 'multiple_choice';
      if (!/^[1-4]$/.test(f[7].trim())) add('객관식의 H열 정답 번호는 1~4여야 합니다. 주관식이라면 J열에 typing을 입력하세요.');
      options.forEach((value, i) => { if (!value) add(`${'CDEF'[i]}열 보기 ${i+1}이 비어 있습니다.`); });
      correctIndex = Number(f[7]);
    }
    if (options.some(v => v.length > 500)) add('보기/허용 정답은 항목당 최대 500자입니다.');
    problems.push({ number: Number(n), prompt, options, timeLimit: Number(timeValue), type, correctIndex });
  });
  return { issues, problems: issues.length ? null : problems };
}

export function questionToDraft(question, index) {
  return {
    line: index + 1, columnCount: 10, acknowledged: true,
    fields: [
      String(question.number), question.prompt, ...(question.options || ['', '', '', '']).slice(0, 4),
      String(question.timeLimit), question.type === 'typing' ? '' : String(question.correctIndex),
      '', question.type === 'typing' ? 'typing' : ''
    ]
  };
}

export function toCSV(rows) {
  const escape = val => {
    const s = String(val ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return '\uFEFF' + rows.map(row => row.fields.map(escape).join(',')).join('\r\n') + '\r\n';
}

export async function decodeFile(file) {
  const bytes = await file.arrayBuffer();
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' }; }
  catch { return { text: new TextDecoder('euc-kr', { fatal: true }).decode(bytes), encoding: 'EUC-KR/CP949' }; }
}
