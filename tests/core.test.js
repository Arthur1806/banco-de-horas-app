'use strict';
/*
 * Testes do núcleo de cálculo (Core) do index.html.
 * O trecho entre /* @core-start *\/ e /* @core-end *\/ é extraído e executado no Node.
 * Rodar: npm test   (ou: node --test tests/*.test.js)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.slice(html.indexOf('/* @core-start */'), html.indexOf('/* @core-end */'));
const Core = vm.runInThisContext(`${src}\nCore;`);

const manual = (id, date, durationMin) => ({ id, date, mode: 'manual', durationMin, start: null, end: null, breakMin: 0, note: '' });

test('formatação e leitura de durações', () => {
  assert.equal(Core.fmtDur(141), '2h21');
  assert.equal(Core.fmtDur(-30), '−0h30');
  assert.equal(Core.fmtDur(90, { sign: true }), '+1h30');
  assert.equal(Core.parseDur('2h21'), 141);
  assert.equal(Core.parseDur('16:00'), 960);
  assert.equal(Core.parseDur('45min'), 45);
  assert.equal(Core.parseDur('16'), 960);
  assert.equal(Core.parseDur('2h75'), null);
});

test('planejamento distribui exatamente o que falta, respeitando o limite diário', () => {
  const st = Core.defaultState();
  st.entries.push(manual('a', '2026-11-16', 120));
  const t = '2026-11-17';
  const { plan, R, unallocated } = Core.computePlan(st, t, 'full');
  const open = Core.openDays(st, t);
  const todo = open.reduce((s, k) => s + plan[k], 0);
  assert.equal(unallocated, 0);
  assert.equal(todo, R);
  assert.ok(open.every(k => plan[k] <= st.settings.dailyLimitMin));
  assert.ok(!open.includes('2026-11-20'), 'feriado não recebe horas');
});

test('feriados nacionais (Páscoa e datas móveis)', () => {
  assert.equal(Core.easterKey(2026), '2026-04-05');
  assert.equal(Core.easterKey(2027), '2027-03-28');
  const keys = Core.nationalHolidays(2026).map(h => h.key);
  assert.ok(keys.includes('2026-04-03'), 'Sexta-feira Santa');
  assert.ok(keys.includes('2026-12-25'));
  assert.ok(!keys.includes('2026-02-16'), 'Carnaval só com pontos facultativos');
  const opt = Core.nationalHolidays(2026, { optional: true }).map(h => h.key);
  assert.ok(opt.includes('2026-02-16') && opt.includes('2026-02-17') && opt.includes('2026-06-04'));
  // Dezembro/2026: só o Natal (sexta) cai em dia útil
  assert.deepEqual(Core.holidaysInRange('2026-12-01', '2026-12-31').map(h => h.key), ['2026-12-25']);
  // Atravessando o ano: 01/01/2027 é sexta
  assert.deepEqual(Core.holidaysInRange('2026-12-26', '2027-01-05').map(h => h.key), ['2027-01-01']);
});

test('sugestão do próximo período', () => {
  const st = Core.defaultState();
  assert.deepEqual(Core.suggestNextPeriod(st, '2026-11-17'), { startDate: '2026-12-01', endDate: '2026-12-31' });
  // Fechando com atraso (já em janeiro): começa no mês atual
  assert.deepEqual(Core.suggestNextPeriod(st, '2027-01-10'), { startDate: '2027-01-01', endDate: '2027-01-31' });
});

test('fechar período leva o saldo uma única vez (sem contar horas em dobro)', () => {
  const st = Core.defaultState();
  st.entries.push(manual('a', '2026-11-16', 120), manual('b', '2026-11-17', 90));
  st.clock['2026-11-17'] = { in: '09:00', lunchOut: '', lunchIn: '', out: '' };
  const t = '2026-11-30';
  const bal = Core.balance(st);
  assert.equal(bal, 141 + 210);
  const next = { startDate: '2026-12-01', endDate: '2026-12-31', goalMin: 960, initialBalanceMin: bal, dailyLimitMin: 120, holidays: Core.holidaysInRange('2026-12-01', '2026-12-31') };
  assert.deepEqual(Core.validateNextPeriod(st, next), []);
  const ns = Core.closePeriod(st, next, t);
  assert.equal(Core.balance(ns), bal);
  assert.equal(ns.entries.length, 0);
  assert.equal(ns.periods.length, 1);
  assert.equal(ns.periods[0].finalBalanceMin, bal);
  assert.equal(ns.periods[0].entries.length, 2);
  assert.equal(ns.overrides['2026-12-25'].type, 'holiday');
  assert.ok(!ns.overrides['2026-11-20'], 'feriados do período anterior saem da lista');
  assert.deepEqual(ns.clock, {}, 'ponto do período anterior não fica pendente');
  assert.equal(st.entries.length, 2, 'estado original não é alterado');
  // Sobrevive ao ciclo salvar/carregar
  const re = Core.sanitizeState(JSON.parse(JSON.stringify(ns)));
  assert.ok(re.ok);
  assert.equal(re.state.periods.length, 1);
  assert.equal(re.state.periods[0].entries.length, 2);
  assert.equal(Core.balance(re.state), bal);
});

test('validação do próximo período', () => {
  const st = Core.defaultState();
  st.entries.push(manual('a', '2026-11-18', 60));
  const base = { startDate: '2026-12-01', endDate: '2026-12-31', goalMin: 960, initialBalanceMin: 0, dailyLimitMin: 120 };
  assert.deepEqual(Core.validateNextPeriod(st, base), []);
  assert.equal(Core.validateNextPeriod(st, { ...base, startDate: '2026-11-18' }).length, 1, 'não pode começar antes do último lançamento');
  assert.equal(Core.validateNextPeriod(st, { ...base, endDate: '2026-11-30' }).length, 1, 'início depois do fim');
  assert.equal(Core.validateNextPeriod(st, { ...base, goalMin: null }).length, 1);
});

test('lançamento vindo do ponto não avisa sobre jornada normal', () => {
  const st = Core.defaultState();
  const d = { mode: 'time', date: '2026-11-17', start: '17:30', end: '19:00', breakMin: 0 };
  const w1 = Core.validateEntry(st, d, { today: '2026-11-17' });
  assert.ok(w1.warnings.some(w => w.includes('jornada normal')));
  const w2 = Core.validateEntry(st, { ...d, ignoreWorkWindow: true }, { today: '2026-11-17' });
  assert.ok(!w2.warnings.some(w => w.includes('jornada normal')));
});

test('ponto do dia calcula a hora extra', () => {
  const st = Core.defaultState();
  st.clock['2026-11-16'] = { in: '09:00', lunchOut: '12:00', lunchIn: '13:00', out: '19:30' };
  const k = Core.dayClock(st, '2026-11-16');
  assert.ok(k.valid);
  assert.equal(k.regularEnd, 18 * 60);
  assert.equal(k.overtime, 90);
});

test('ajuste com o banco real entra no saldo sem mexer nos lançamentos', () => {
  const st = Core.defaultState();
  st.entries.push(manual('a', '2026-11-16', 120));
  assert.equal(Core.balance(st), 261);
  st.adjustments.push({ id: 'j1', date: '2026-11-18', deltaMin: -2, realMin: 259, systemMin: 261, note: '', createdAt: 'x' });
  assert.equal(Core.balance(st), 259);
  st.plan = Core.computePlan(st, '2026-11-18').plan;
  const d = Core.derive(st, '2026-11-18');
  assert.equal(d.bal, 259);
  assert.equal(d.registered, 120);
  assert.equal(d.adjustTotal, -2);
  assert.equal(d.real['2026-11-18'] || 0, 0, 'ajuste não conta como hora feita no dia');
  assert.equal(d.rows[d.rows.length - 1].cum, 960, 'saldo final previsto continua batendo com a meta');
  // planejamento compensa os 2 minutos
  const { plan } = Core.computePlan(st, '2026-11-18', 'full');
  const todo = Core.openDays(st, '2026-11-18').reduce((s, k) => s + plan[k], 0);
  assert.equal(todo, 960 - 259);
  // sobrevive a salvar/carregar e vai para o histórico ao fechar o período
  const re = Core.sanitizeState(JSON.parse(JSON.stringify(st))).state;
  assert.equal(Core.balance(re), 259);
  const ns = Core.closePeriod(re, { startDate: '2026-12-01', endDate: '2026-12-31', goalMin: 960, initialBalanceMin: 259, dailyLimitMin: 120 }, '2026-11-30');
  assert.equal(Core.balance(ns), 259);
  assert.equal(ns.adjustments.length, 0);
  assert.equal(ns.periods[0].adjustments.length, 1);
});

test('finalizar expediente redistribui o que faltava hoje', () => {
  const st = Core.defaultState();
  const t = '2026-11-18';
  st.plan = Core.computePlan(st, t, 'full').plan;
  st.baseline = { ...st.plan };
  st.entries.push(manual('a', t, 30));
  st.plan = Core.computePlan(st, t).plan;
  const before = Core.derive(st, t);
  assert.ok(before.todayTodo > 0, 'antes de finalizar, hoje ainda tem horas a fazer');
  st.closedDays[t] = true;
  st.plan = Core.computePlan(st, t).plan;
  const d = Core.derive(st, t);
  assert.equal(d.todayTodo, 0);
  assert.ok(!d.open.includes(t));
  const future = d.open.reduce((s, k) => s + d.todoMap[k], 0);
  assert.equal(d.bal + future, 960, 'o restante foi para os próximos dias');
  assert.equal(Core.dayStatus(st, t, t, d.real, false), 'partial');
  assert.ok(d.delta < 0, 'o que faltou hoje já conta no ritmo');
  // reabrir devolve o dia ao planejamento
  delete st.closedDays[t];
  st.plan = Core.computePlan(st, t).plan;
  assert.ok(Core.derive(st, t).open.includes(t));
});
