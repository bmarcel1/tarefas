// Rodar: node --test   (Node 18+, sem instalar nada)
const fs = require('fs'), path = require('path'), vm = require('vm');
const test = require('node:test'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const block = script.slice(script.indexOf('// ---------- agenda'), script.indexOf('// ---------- week number'));

// carrega o motor de agenda do próprio index.html, com stubs no lugar do navegador
function engine() {
  return new Function(`let db={tasks:[],cats:[],hist:[],pend:[]};
  const C=id=>db.cats.find(c=>c.id==id&&!c.deleted),live=()=>db.tasks.filter(t=>!t.deleted),T=id=>db.tasks.find(t=>t.id==id);
  const mark=()=>{},log=()=>{},commit=()=>{};
  ${block}
  return {db:()=>db,DN,segs,sgOf,move,relayout,fillGap,repDates}`)();
}
const D = (day, h, m = 0) => new Date(2026, 9, day, h, m);          // out/2026: dia 26 = segunda
const iso = (day, h, m = 0) => D(day, h, m).toISOString();
const mask = (...n) => n.reduce((m, x) => m | 1 << DNn.indexOf(x), 0);   // máscara de dias pelo nome (independe da ordem usada no app)
const DNn = engine().DN;
const TR = { id: 'tr', start_m: 420, end_m: 960, days: mask('Seg', 'Ter', 'Qua', 'Qui', 'Sex') };         // Trabalho 07–16, seg–sex
const CA = { id: 'ca', start_m: 1020, end_m: 1380, days: 127 };      // Casa 17–23
const PE = { id: 'pe', start_m: 1381, end_m: 300, days: 127 };       // Pessoal 23:01–05:00
const task = (id, dur, start, cat_id = 'tr', extra = {}) => ({ id, title: id, dur, start: start ? start.toISOString() : null, cat_id, done: false, deleted: false, fixed: false, ...extra });
function setup(cats, tasks) { const e = engine(); e.db().cats.push(...cats); e.db().tasks.push(...tasks); return e; }
const span = (e, id) => e.sgOf(e.db().tasks.find(t => t.id == id)).map(([a, b]) => [new Date(a).getTime(), new Date(b).getTime()]);
const eq = (e, id, expected) => assert.deepEqual(span(e, id), expected.map(([a, b]) => [+a, +b]));

// ---------- agenda ----------
test('tarefa solta antes da janela começa na abertura da janela', () => {
  const e = setup([TR], [task('A', 60, null)]); e.move('A', +D(26, 5));
  eq(e, 'A', [[D(26, 7), D(26, 8)]]);
});
test('tarefa maior que a janela é dividida nos dias seguintes', () => {
  const e = setup([TR], [task('A', 600, null)]); e.move('A', +D(26, 9));
  eq(e, 'A', [[D(26, 9), D(26, 16)], [D(27, 7), D(27, 10)]]);
});
test('janela de seg–sex pula o fim de semana', () => {
  const e = setup([TR], [task('A', 540, null)]); e.move('A', +D(30, 9));
  eq(e, 'A', [[D(30, 9), D(30, 16)], [new Date(2026, 10, 2, 7), new Date(2026, 10, 2, 9)]]);
});
test('janela que vira a meia-noite (23:01–05:00)', () => {
  const e = setup([PE], [task('A', 120, null, 'pe')]); e.move('A', +D(26, 23, 30));
  eq(e, 'A', [[D(26, 23, 30), D(27, 1, 30)]]);
});
test('tarefa grande empurra a seguinte em vez de pulá-la', () => {
  const e = setup([TR], [task('B', 60, D(26, 10)), task('A', 120, null)]); e.move('A', +D(26, 9));
  eq(e, 'A', [[D(26, 9), D(26, 11)]]); eq(e, 'B', [[D(26, 11), D(26, 12)]]);
});
test('inadiável nunca se move e a tarefa nova é dividida antes/depois dela', () => {
  const e = setup([TR], [task('F', 60, D(26, 10), 'tr', { fixed: true }), task('N', 180, null)]); e.move('N', +D(26, 9));
  eq(e, 'F', [[D(26, 10), D(26, 11)]]);
  eq(e, 'N', [[D(26, 9), D(26, 10)], [D(26, 11), D(26, 13)]]);
});
const finish = (e, id, mins) => { const t = e.db().tasks.find(x => x.id == id), o = t.dur; t.dur = mins; t.done = true; e.fillGap(t, o - mins); };
test('concluir antes: todas as seguintes da categoria sobem, inclusive em outros dias, mantendo folgas', () => {
  const e = setup([TR, CA], [task('A', 60, D(26, 14)), task('B', 60, D(26, 15)), task('C', 60, D(27, 7)), task('D', 60, D(27, 9)),
    task('Y', 60, D(26, 17), 'ca'), task('R', 60, D(27, 12), 'tr', { series_id: 's1' })]);
  finish(e, 'A', 30);
  eq(e, 'B', [[D(26, 14, 30), D(26, 15, 30)]]);
  eq(e, 'C', [[D(26, 15, 30), D(26, 16)], [D(27, 7), D(27, 7, 30)]]);
  eq(e, 'D', [[D(27, 8, 30), D(27, 9, 30)]]);          // folga de 1h antes dele é mantida
  eq(e, 'Y', [[D(26, 17), D(26, 18)]]);                // outra categoria: não mexe
  eq(e, 'R', [[D(27, 12), D(27, 13)]]);                // recorrente: mantém o horário
});
test('concluir antes: a tarefa seguinte aproveita o tempo antes de uma inadiável', () => {
  const e = setup([TR], [task('A', 60, D(26, 14)), task('F', 30, D(26, 15), 'tr', { fixed: true }), task('B', 60, D(26, 15, 30))]);
  finish(e, 'A', 30);
  eq(e, 'F', [[D(26, 15), D(26, 15, 30)]]);
  eq(e, 'B', [[D(26, 14, 30), D(26, 15)], [D(26, 15, 30), D(26, 16)]]);
});

// ---------- tarefa sem categoria ----------
test('sem categoria: nunca invade a janela de outra categoria e pula fendas de 1 minuto', () => {
  const e = setup([TR, CA, PE], [task('N', 120, null, null)]); e.move('N', +new Date(2026, 10, 1, 16, 30));
  eq(e, 'N', [[new Date(2026, 10, 1, 16, 30), new Date(2026, 10, 1, 17, 0)], [new Date(2026, 10, 2, 5, 0), new Date(2026, 10, 2, 6, 30)]]);
});
test('sem categoria: usa a noite quando não há categoria de madrugada', () => {
  const e = setup([TR, CA], [task('N', 120, null, null)]); e.move('N', +new Date(2026, 10, 1, 16, 30));
  eq(e, 'N', [[new Date(2026, 10, 1, 16, 30), new Date(2026, 10, 1, 17, 0)], [new Date(2026, 10, 1, 23, 0), new Date(2026, 10, 2, 0, 30)]]);
});

// ---------- recorrência ----------
const fmt = a => a.map(d => `${d.getDate()}/${d.getMonth() + 1}`).join(' ');
test('repetição: dias úteis, dias escolhidos, mensal com fim de mês', () => {
  const e = engine();
  assert.equal(fmt(e.repDates(D(30, 9), 'weekdays', new Date(2026, 10, 5, 23), 0)), '30/10 2/11 3/11 4/11 5/11');
  assert.equal(fmt(e.repDates(D(26, 9), 'custom', new Date(2026, 10, 6, 23), mask('Seg', 'Qua', 'Sex'))), '26/10 28/10 30/10 2/11 4/11 6/11');
  assert.equal(fmt(e.repDates(D(31, 9), 'monthly', new Date(2027, 1, 28, 23), 0)), '31/10 30/11 31/12 31/1 28/2');
  assert.ok(e.repDates(D(26, 9), 'daily', new Date(2030, 0, 1), 0).length <= 200);
});

// ---------- propriedade: nunca sobrepõe nem sai da janela ----------
test('invariantes após movimentos aleatórios (sem sobreposição, dentro da janela, duração preservada)', () => {
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let round = 0; round < 30; round++) {
    const durs = Array.from({ length: 8 }, () => 30 * (1 + Math.floor(rnd() * 24)));
    const e = setup([TR], [task('F', 60, D(27, 10), 'tr', { fixed: true }), ...durs.map((d, i) => task('T' + i, d, null))]);
    for (let k = 0; k < 12; k++) e.move('T' + Math.floor(rnd() * 8), +D(26 + Math.floor(rnd() * 5), Math.floor(rnd() * 24), rnd() < .5 ? 0 : 30));
    for (let k = 0; k < 3; k++) { const tid = 'T' + Math.floor(rnd() * 8), t = e.db().tasks.find(x => x.id == tid); if (t.start && !t.done && t.dur > 30) finish(e, t.id, 30 * Math.floor(rnd() * (t.dur / 30))  || 30); }
    const normal = e.db().tasks.filter(t => t.start && !t.fixed && !t.done), fixed = span(e, 'F')[0], all = [];
    for (const t of normal) {
      const sg = e.sgOf(t);
      assert.equal(sg.reduce((n, [a, b]) => n + (b - a), 0), t.dur * 6e4, 'duração preservada');
      for (const [a, b] of sg) {
        const A = new Date(a), B = new Date(b);
        assert.ok(A.getDay() >= 1 && A.getDay() <= 5, 'só dias úteis');
        assert.ok(A.getHours() * 60 + A.getMinutes() >= 420 && B.getHours() * 60 + B.getMinutes() <= 960 && A.toDateString() == B.toDateString(), 'dentro da janela');
        assert.ok(b <= fixed[0] || a >= fixed[1], 'não invade a inadiável');
        all.forEach(([x, y]) => assert.ok(b <= x || a >= y, 'sem sobreposição'));
        all.push([a, b]);
      }
    }
    eq(e, 'F', [[D(27, 10), D(27, 11)]]);
  }
});

// ---------- verificações estáticas (pegam erros de publicação) ----------
test('traduções: toda frase tem os 4 idiomas (en, es, fr, de) preenchidos', () => {
  const src = script.slice(script.indexOf('// I18N-BEGIN'), script.indexOf('// I18N-END'));
  const { X } = new Function('LI', src + '; return {X, S, WD}')(1);
  const keys = Object.keys(X);
  assert.ok(keys.length > 60);
  for (const k of keys) assert.ok(Array.isArray(X[k]) && X[k].length === 4 && X[k].every(s => s && s.trim()), 'tradução incompleta: ' + k);
});
test('index.html: JS válido, sem funções duplicadas, sem placeholders', () => {
  new vm.Script(script);
  const names = [...script.matchAll(/^(?:async )?function\*? (\w+)/gm)].map(m => m[1]);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) != i), [], 'função declarada duas vezes');
  assert.ok(!script.includes('COLE_AQUI'), 'chaves do Supabase não preenchidas');
  assert.ok(!/service_role|sb_secret/.test(html), 'chave secreta no código!');
});
test('sw.js e manifest.json não estão vazios e são válidos', () => {
  new vm.Script(read('sw.js')); assert.ok(read('sw.js').length > 200 && read('sw.js').includes('fetch'));
  const m = JSON.parse(read('manifest.json'));
  m.icons.forEach(i => assert.ok(fs.existsSync(path.join(root, i.src)), i.src + ' existe'));
});
test('schema.sql tem todas as colunas que o app envia (evita erro de "coluna não encontrada")', () => {
  const sql = read('schema.sql'), tasks = sql.match(/create table tasks\(([\s\S]*?)\);/)[1], cats = sql.match(/create table categories\(([\s\S]*?)\);/)[1];
  for (const c of ['title', 'dur', 'start', 'fixed', 'series_id', 'notes', 'done', 'deleted', 'cat_id', 'updated_at']) assert.ok(new RegExp('\\b' + c + ' ').test(tasks), 'tasks.' + c);
  assert.ok(/\bdays /.test(cats), 'categories.days');
});
test('schema.sql: todas as tabelas com RLS e política por usuário', () => {
  const sql = read('schema.sql');
  for (const t of ['categories', 'tasks', 'history']) {
    assert.match(sql, new RegExp(`alter table ${t} enable row level security`), t + ' sem RLS');
    assert.match(sql, new RegExp(`on ${t} for all using \\(user_id = auth.uid\\(\\)\\) with check \\(user_id = auth.uid\\(\\)\\)`), t + ' sem política');
  }
});
