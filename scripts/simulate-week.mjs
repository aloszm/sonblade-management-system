#!/usr/bin/env node
// Simulador de una semana de trabajo de Gallo 4:20 — SOLO para la base de desarrollo sonblade-dev.
// Lee scripts/README-simulacion.md antes de usarlo. Lo que se ejecuta con COMMIT no se puede borrar.
//
// Este archivo NO toca la base: imprime SQL para revisarlo y ejecutarlo a mano.
//   node scripts/simulate-week.mjs --summary              resumen de lo que se generaría
//   node scripts/simulate-week.mjs --rehearsal            semana completa en una sucursal temporal, con ROLLBACK
//                                  (--days 0,1 para ensayar solo algunos días)
//   node scripts/simulate-week.mjs --day 0                un día (0 = domingo … 6 = sábado), con COMMIT
//   node scripts/simulate-week.mjs --verify               consultas de verificación (solo lectura)
// Opciones: --week 2026-10-25 (domingo de inicio), --seed 4202611.
//
// Todo el dinero pasa por las funciones reales (open_cash_session, confirm_sale, record_cash_movement,
// change_appointment_status, reverse_sale, close_cash_session, adjust_inventory_stock, create_time_off,
// settle_commissions) ejecutadas como el usuario que haría la operación (rol authenticated + jwt claims).
// Las funciones usan now(); dentro de una transacción now() es constante, así que, justo después de cada
// operación, se cambia a la hora simulada toda marca de tiempo del negocio que valga exactamente now()
// (solo filas creadas o tocadas por esta transacción). Ese cambio se hace como postgres con
// session_replication_role = replica LOCAL a la transacción (no dispara triggers de bitácora ni de
// inmutabilidad) y se vuelve a 'origin' enseguida. No se crean funciones ni se deshabilitan triggers.

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes(name);

const WEEK_START = opt('--week', '2026-10-25');
const SEED = Number(opt('--seed', '4202611'));
const BUSINESS_ID = 'e9ee2431-110b-4105-96bc-63f362c84c09';
const BRANCH_ID = 'd40aafce-fe84-4131-86af-03154e73a3b7';
// Barberos que atienden en la simulación (por display_name en employees). Para sumar un tercero, agrégalo aquí.
const BARBERS = (opt('--barbers', 'Deya,Dani,Sonia')).split(',').map((s) => s.trim()).filter(Boolean);

if (!/^\d{4}-\d{2}-\d{2}$/.test(WEEK_START) || new Date(`${WEEK_START}T00:00:00Z`).getUTCDay() !== 0) {
    throw new Error('--week debe ser un domingo con formato AAAA-MM-DD.');
}

// ---------- Aleatoriedad reproducible ----------
function mulberry32(a) {
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = mulberry32(SEED);
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const weighted = (pairs) => { const total = pairs.reduce((s, [, w]) => s + w, 0); let r = rand() * total; for (const [v, w] of pairs) { if ((r -= w) < 0) return v; } return pairs[pairs.length - 1][0]; };

// ---------- Catálogo (nombres reales; precios y duración se leen de la base al cobrar) ----------
const DUR = {
    'Corte adulto': 30, 'Corte niño': 30, 'Grecas': 30, 'Barba': 30, 'Ritual de barba': 60, 'Bigote': 30,
    'Afeitado completo': 30, 'Afeitado máquina': 30, 'Perfilado de ceja': 30, 'Planchado de ceja': 30,
    'Facial con masaje': 60, 'Mascarilla negra': 30, 'Corte y barba': 60, 'Corte y facial': 90, 'Servicio VIP': 120,
};
const MAIN = [['Corte adulto', 34], ['Corte y barba', 15], ['Barba', 9], ['Corte niño', 8], ['Ritual de barba', 4],
    ['Afeitado completo', 4], ['Afeitado máquina', 3], ['Corte y facial', 3], ['Facial con masaje', 2], ['Servicio VIP', 2]];
const ADDONS = [['Perfilado de ceja', 4], ['Grecas', 3], ['Planchado de ceja', 2], ['Bigote', 2], ['Mascarilla negra', 2]];
const PRODUCTS = ['Pomada Negra Baregk (150 ml)', 'Pomada Roja Baregk (150 ml)', 'Peine de textura', 'Polvo de textura'];
const STOCK_IN = { 'Pomada Negra Baregk (150 ml)': 12, 'Pomada Roja Baregk (150 ml)': 12, 'Peine de textura': 10, 'Polvo de textura': 8 };

const NAMES = ['Luis Hernández', 'Jorge Ramírez', 'Miguel Ángel Torres', 'Carlos Méndez', 'Óscar Rivera', 'Alan Castillo',
    'Iván Morales', 'Ricardo Flores', 'Eduardo Vargas', 'Fernando Ruiz', 'Diego Sánchez', 'Raúl Ortega', 'Arturo Medina',
    'Hugo Salinas', 'Kevin Aguilar', 'Brandon López', 'Omar Delgado', 'Javier Cruz', 'Sergio Navarro', 'Emiliano Reyes',
    'Santiago Pérez', 'Mateo Gómez', 'Andrés Rojas', 'Gerardo Luna', 'Rodrigo Campos', 'Saúl Espinoza', 'Víctor Domínguez',
    'Alejandro Juárez', 'Daniel Ibarra', 'Pablo Guerrero', 'Tomás Fuentes', 'Ángel Vega', 'Rubén Cortés', 'Marco Sandoval',
    'Héctor Arellano', 'Julio Paredes', 'Isaac Molina', 'Adrián Cervantes', 'Francisco Lara', 'Gustavo Pineda'];

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const HOURS = { 0: ['10:00', '19:00'], 1: ['10:00', '19:00'] }; for (let d = 2; d <= 6; d++) HOURS[d] = ['12:30', '20:00'];
// Visitas objetivo por barbero y día (más gente viernes y sábado).
const VISITS = [8, 7, 7, 7, 8, 9, 10];
// Sonia es gerente y también corta: atiende menos.
const LOAD = { Sonia: 0.6 };
const FRONT = ['dago', 'dago', 'dago', 'dago', 'emi', 'emi', 'emi'];   // quién atiende la caja cada día

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at = (dayIndex, min) => `${addDays(WEEK_START, dayIndex)} ${hhmm(min)}`;
const PERIOD_END = addDays(WEEK_START, 6);
const ISO_WEEK = (() => { // año y semana ISO del sábado final, como private.next_payment_receipt
    const d = new Date(`${PERIOD_END}T00:00:00Z`); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
    const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return `${String(d.getUTCFullYear()).slice(2)}${String(week).padStart(2, '0')}`;
})();
const KEY = `sim-${ISO_WEEK}`;

// ---------- Requisitos por barbero en la semana (se asignan a visitas concretas) ----------
// Cada barbero: corte, barba, ceja, paquete, grecas (precio libre) y al menos 2 productos.
function forcedFor(b) {
    const o = BARBERS.indexOf(b);
    return [
        { day: (0 + o) % 7, services: ['Corte adulto', 'Grecas'], grecas: 60 + 10 * o },
        { day: (2 + o) % 7, services: ['Corte y barba'] },
        { day: (3 + o) % 7 === 3 ? 4 : (3 + o) % 7, services: ['Barba', 'Perfilado de ceja'] },
        { day: (1 + o) % 7, services: ['Corte adulto'], product: PRODUCTS[o % 4] },
        { day: (4 + o) % 7, services: ['Corte adulto'], product: PRODUCTS[(o + 2) % 4] },
        { day: 5, services: ['Servicio VIP'] },
    ];
}

// ---------- Plan de la semana ----------
const events = [];          // { day, at: 'YYYY-MM-DD HH:MM', t, ... }
let nameIdx = 0;
let visitNo = 0;
const nextName = () => NAMES[(nameIdx++) % NAMES.length];
const push = (day, min, ev) => events.push({ day, at: at(day, min), sortKey: day * 10000 + min, ...ev });
const pushAbs = (day, isoAt, sortKey, ev) => events.push({ day, at: isoAt, sortKey, ...ev });

function tipFor(payMethod) {
    if (rand() > 0.34) return null;
    const amount = pick([20, 20, 30, 30, 40, 50, 50, 100]);
    const method = payMethod === 'card' && rand() < 0.6 ? 'card' : weighted([['cash', 6], ['card', 3], ['transfer', 1]]);
    return { amount, method };
}
function paymentsFor(day, forceSplit) {
    if (forceSplit) return [{ m: 'cash', a: 100 }, { m: pick(['card', 'transfer']) }];
    const m = weighted([['cash', 50], ['card', 35], ['transfer', 15]]);
    return [{ m }];
}

// Requisitos especiales de la semana (descuentos, cancelaciones, no llegó, pagos divididos, anulaciones).
const SPECIAL = {
    discounts: [
        { day: 2, barber: BARBERS[0], service: 'Corte adulto', amount: 15, reason: 'Cliente frecuente: 10 % en el corte', by: 'sonia' },
        { day: 5, barber: BARBERS[1 % BARBERS.length], service: 'Corte y barba', amount: 50, reason: 'Promoción de cumpleaños', by: 'owner' },
    ],
    cancels: [
        { day: 1, barber: BARBERS[0], reason: 'Avisó por WhatsApp que no podía llegar; reagenda la próxima semana' },
        { day: 3, barber: BARBERS[0], reason: 'Se le complicó el trabajo; llamó para cancelar' },
        { day: 5, barber: BARBERS[1 % BARBERS.length], reason: 'Enfermedad; pidió cancelar por teléfono' },
    ],
    noShows: [
        { day: 2, barber: BARBERS[1 % BARBERS.length], reason: 'No llegó ni contestó el teléfono' },
        { day: 6, barber: BARBERS[0], reason: 'No llegó; se le marcó dos veces' },
    ],
    splitDays: [0, 2, 4, 5, 6],
};

// Ausencia: el segundo barbero, miércoles hasta las 16:00 (medio día).
const TIME_OFF = { barber: BARBERS[1 % BARBERS.length], day: 3, from: '12:30', to: '16:00', reason: 'Cita médica en el IMSS',
    requestedDay: 2, requestedAt: '18:40', via: 'whatsapp', by: 'dago' };

const EXPENSES = [
    ['Garrafón de agua', 45], ['Papel de baño y jabón para manos', 86], ['Bolsas para basura', 38], ['Navajas desechables (paquete)', 120],
    ['Talco y alcohol', 95], ['Propina del recolector de basura', 20], ['Toallas de papel', 64], ['Café y azúcar para clientes', 110],
    ['Pilas para la terminal', 58], ['Limpiador para el piso', 49], ['Garrafón de agua', 45], ['Refrescos para el equipo', 72],
];
const SHORT_DAY = 4;           // jueves: faltante de $30 al cerrar
const SHORT_AMOUNT = -30;

const settled = [];
const counters = { byDay: {} };

// Entrada de mercancía (antes de vender productos reales).
push(0, toMin('09:20'), { t: 'inventory', user: 'owner', items: Object.entries(STOCK_IN).map(([p, q]) => ({ p, q })),
    notes: 'Entrada de mercancía: compra al proveedor (nota de remisión de octubre)' });

for (let day = 0; day < 7; day++) {
    const [o, c] = HOURS[day].map(toMin);
    const front = FRONT[day];
    const stats = counters.byDay[day] = { visits: 0, services: 0, appts: 0, walkins: 0, products: 0, cancels: 0, noShows: 0, reversals: 0, splits: 0, tips: 0, discounts: 0, expenses: 0 };

    push(day, o - 15, { t: 'open', user: front, amount: 500 });
    if (day === TIME_OFF.requestedDay) {
        push(day, toMin(TIME_OFF.requestedAt), { t: 'timeoff', user: TIME_OFF.by, barber: TIME_OFF.barber,
            from: at(TIME_OFF.day, toMin(TIME_OFF.from)), to: at(TIME_OFF.day, toMin(TIME_OFF.to)), reason: TIME_OFF.reason,
            requested_at: at(day, toMin(TIME_OFF.requestedAt) - 5), via: TIME_OFF.via });
    }

    let splitsLeft = SPECIAL.splitDays.includes(day) ? 1 : 0;
    for (const barber of BARBERS) {
        let cursor = o + randInt(0, 25);
        if (barber === TIME_OFF.barber && day === TIME_OFF.day) cursor = toMin(TIME_OFF.to);
        const endLimit = c - 10;     // el último cobro queda antes del cierre (y del corte semanal del sábado a las 20:00)
        const forced = forcedFor(barber).filter((f) => f.day === day);
        const discount = SPECIAL.discounts.find((d) => d.day === day && d.barber === barber);
        const cancel = SPECIAL.cancels.filter((x) => x.day === day && x.barber === barber);
        const noShow = SPECIAL.noShows.filter((x) => x.day === day && x.barber === barber);

        const visits = [];
        const target = barber === TIME_OFF.barber && day === TIME_OFF.day ? 4 : Math.max(2, Math.round((VISITS[day] + randInt(-1, 1)) * (LOAD[barber] ?? 1)));
        for (let i = 0; i < target; i++) {
            const f = forced[i];
            let services; let grecas; let product = null;
            if (f) { services = [...f.services]; grecas = f.grecas; product = f.product ?? null; }
            else {
                services = [weighted(MAIN)];
                if (services[0] === 'Corte adulto' || services[0] === 'Corte niño' ? rand() < 0.3 : rand() < 0.12) services.push(weighted(ADDONS));
                if (services.includes('Grecas')) grecas = pick([40, 50, 60, 80]);
                if (rand() < 0.05) product = pick(PRODUCTS);
            }
            visits.push({ kind: 'sale', services, grecas, product });
        }
        if (discount) {
            const v = visits.find((x) => x.services[0] === discount.service) ?? visits[visits.length - 1];
            v.services[0] = discount.service; v.discount = discount;
        }
        for (const x of cancel) visits.splice(Math.min(1 + randInt(0, 2), visits.length), 0, { kind: 'cancel', reason: x.reason, services: ['Corte adulto'] });
        for (const x of noShow) visits.splice(Math.min(1 + randInt(0, 2), visits.length), 0, { kind: 'noshow', reason: x.reason, services: ['Corte adulto'] });

        const durOf = (v) => v.services.reduce((s, n) => s + DUR[n], 0);
        // Tiempo libre repartido al azar entre visitas; si no cabe, se quitan visitas normales del final.
        const fits = () => (endLimit - cursor) - visits.reduce((s, v) => s + durOf(v) + 12, 0);
        while (fits() < 0) {
            const idx = visits.map((v, i) => [v, i]).reverse().find(([v]) => v.kind === 'sale' && !v.discount && !forced.some((f) => f.services[0] === v.services[0] && (f.product ?? null) === (v.product ?? null) && f.services.length === v.services.length))?.[1];
            if (idx === undefined) break;
            visits.splice(idx, 1);
        }
        const free = Math.max(0, fits());
        const weights = visits.map(() => rand() + 0.2); const wsum = weights.reduce((a, b) => a + b, 0) || 1;

        visits.forEach((v, i) => {
            const dur = durOf(v);
            const gap = Math.floor((free * weights[i]) / wsum * 0.85);
            cursor += gap;
            const wantsAppt = v.kind !== 'sale' || v.discount || rand() < 0.6;
            let start = wantsAppt ? Math.ceil(cursor / 30) * 30 : Math.ceil(cursor / 5) * 5;
            if (wantsAppt && start + dur > endLimit - 5) { if (v.kind !== 'sale') return; start = Math.ceil(cursor / 5) * 5; v.walk = true; }
            if (start + dur > endLimit - 5) return;
            const isAppt = wantsAppt && !v.walk;
            const no = ++visitNo;
            const vkey = `${KEY}-d${day}-v${String(no).padStart(3, '0')}`;
            const customer = nextName();
            if (isAppt) {
                // Reservada entre 1 y 2 días antes (o la misma mañana), en horario de atención.
                const back = randInt(0, 2);
                let bookMin = back === 0 ? Math.max(toMin('09:00'), start - randInt(90, 240)) : randInt(toMin('11:00'), toMin('19:30'));
                if (back === 0 && bookMin >= start - 60) bookMin = start - 60;
                const bookDayDate = addDays(WEEK_START, day - back);
                pushAbs(day, `${bookDayDate} ${hhmm(bookMin)}`, (day - back) * 10000 + bookMin - 100000, {
                    t: 'book', user: back === 0 ? front : FRONT[Math.max(0, day - back)] ?? 'dago', key: vkey, barber, customer,
                    start: at(day, start), minutes: Math.max(30, Math.ceil(dur / 30) * 30), note: v.services.join(' + '),
                });
                stats.appts++;
            }
            if (v.kind === 'cancel') {
                push(day, Math.max(o - 30, start - randInt(90, 200)), { t: 'cancel', user: front, key: vkey, reason: v.reason });
                stats.cancels++; cursor = start; return;
            }
            if (v.kind === 'noshow') {
                push(day, start + 20, { t: 'noshow', user: front, key: vkey, reason: v.reason });
                stats.noShows++; cursor = start + 30; return;
            }
            const arrival = isAppt ? start - randInt(0, 10) : start;
            if (isAppt) push(day, arrival, { t: 'checkin', user: front, key: vkey });
            const pay = start + dur + randInt(2, 6);
            const forceSplit = splitsLeft > 0 && rand() < 0.5;
            if (forceSplit) { splitsLeft--; stats.splits++; }
            const pays = paymentsFor(day, forceSplit);
            const items = v.services.map((s) => ({ s, b: barber, ...(s === 'Grecas' ? { price: v.grecas ?? 50 } : {}),
                ...(v.discount && s === v.discount.service ? { disc: v.discount.amount } : {}) }));
            if (v.product) { items.push({ p: v.product, q: 1, by: barber }); stats.products++; }
            const tip = v.discount ? null : tipFor(pays[pays.length - 1].m);
            if (tip) stats.tips++;
            push(day, pay, { t: 'sale', user: front, key: vkey, appt: isAppt ? vkey : null, items, pays,
                tips: tip ? [{ b: barber, a: tip.amount, m: tip.method }] : [],
                ...(v.discount ? { discount_reason: v.discount.reason, authorizer: v.discount.by } : {}) });
            if (v.discount) stats.discounts++;
            stats.visits++; stats.services += v.services.length; stats[isAppt ? 'appts_paid' : 'walkins'] = (stats[isAppt ? 'appts_paid' : 'walkins'] ?? 0) + 1;
            cursor = pay + randInt(0, 4);
        });
        if (splitsLeft > 0 && barber === BARBERS[BARBERS.length - 1]) {
            // Garantiza el pago dividido del día en la última venta con servicio de este barbero.
            const last = [...events].reverse().find((e) => e.day === day && e.t === 'sale' && e.items.some((i) => i.b === barber));
            if (last) { last.pays = [{ m: 'cash', a: 100 }, { m: 'card' }]; splitsLeft--; stats.splits++; }
        }
    }

    // Recepción vende productos sola (comisión del 20 % para recepción).
    const receptionSales = {
        0: { p: 'Pomada Negra Baregk (150 ml)', m: 'cash', min: o + 150 }, 2: { p: 'Peine de textura', m: 'card', min: o + 200 },
        4: { p: 'Pomada Roja Baregk (150 ml)', m: 'transfer', min: o + 240 }, 5: { p: 'Polvo de textura', m: 'cash', min: o + 300 },
    };
    if (receptionSales[day]) {
        const r = receptionSales[day];
        push(day, r.min, { t: 'sale', user: front, key: `${KEY}-d${day}-r01`, appt: null, items: [{ p: r.p, q: 1, by: front === 'dago' ? 'Dago' : 'Emi' }], pays: [{ m: r.m }], tips: [] });
        stats.products++;
    }

    // Anulaciones: jueves, cobro duplicado en efectivo; sábado, devolución de un producto pagado con tarjeta.
    if (day === 4) {
        const b = BARBERS[0]; const m = toMin('15:05');
        push(day, m, { t: 'sale', user: front, key: `${KEY}-d${day}-x01`, appt: null, items: [{ s: 'Corte adulto', b }], pays: [{ m: 'cash' }], tips: [] });
        push(day, m + 1, { t: 'sale', user: front, key: `${KEY}-d${day}-x02`, appt: null, items: [{ s: 'Corte adulto', b }], pays: [{ m: 'cash' }], tips: [] });
        push(day, m + 6, { t: 'reverse', user: 'owner', key: `${KEY}-d${day}-x02`, reason: 'Cobro duplicado por error: el cliente pagó una sola vez (se devolvió el efectivo)' });
        stats.reversals++;
    }
    if (day === 6) {
        const m = toMin('17:10');
        push(day, m, { t: 'sale', user: front, key: `${KEY}-d${day}-x01`, appt: null, items: [{ p: 'Polvo de textura', q: 1, by: 'Emi' }], pays: [{ m: 'card' }], tips: [] });
        push(day, m + 25, { t: 'reverse', user: 'owner', key: `${KEY}-d${day}-x01`, reason: 'El cliente devolvió el producto sellado; se canceló el cargo en la terminal' });
        stats.reversals++;
    }

    // Gastos pequeños.
    const nExp = rand() < 0.5 ? 1 : 2;
    for (let i = 0; i < nExp; i++) {
        const [desc, amount] = EXPENSES[(day * 2 + i) % EXPENSES.length];
        push(day, o + randInt(60, Math.max(61, c - o - 90)), { t: 'expense', user: front, amount, desc });
        stats.expenses++;
    }

    // Sábado: pago semanal al equipo desde la caja (después del corte de las 20:00).
    if (day === 6) {
        push(day, c + 5, { t: 'settle', user: 'owner', period_start: WEEK_START, period_end: PERIOD_END,
            people: [
                ...BARBERS.map((b, i) => ({ e: b, cash: i === 1 ? 500 : 0 })),
                { e: 'Dago', cash: -1 }, { e: 'Emi', cash: -1 },      // -1: todo en efectivo
            ] });
        settled.push(...BARBERS, 'Dago', 'Emi');
    }
    push(day, c + (day === 6 ? 25 : 15), { t: 'close', user: front, short: day === SHORT_DAY ? SHORT_AMOUNT : 0,
        delivered_to: day === 3 ? 'Sonia (gerente)' : 'Dueño' });
}

events.sort((a, b) => a.day - b.day || a.sortKey - b.sortKey);

// ---------- SQL ----------
const ENGINE = String.raw`
do $sim$
declare
  c_business constant uuid := '${BUSINESS_ID}';
  v_plan jsonb := $plan$__PLAN__$plan$::jsonb;
  v_branch uuid := current_setting('sim.branch_id')::uuid;
  v_tz text;
  v_users jsonb; v_emps jsonb; v_svc jsonb; v_prod jsonb;
  v_ev jsonb; v_at timestamptz; v_uid uuid; v_session uuid;
  v_appts jsonb := '{}'; v_sales jsonb := '{}';
  v_it jsonb; v_items jsonb; v_pays jsonb; v_tips jsonb;
  v_total numeric(12,2); v_fixed numeric(12,2); v_price numeric(12,2); v_var boolean;
  v_res jsonb; v_id uuid; v_avail numeric(12,2);
  v_prev jsonb; v_cash numeric(12,2); v_person jsonb; v_emp uuid;
  c_redate constant text[] := array[
    'sales.created_at','sales.updated_at','sales.paid_at','sale_items.created_at','payments.processed_at',
    'cash_movements.created_at','cash_sessions.opened_at','cash_sessions.closed_at',
    'commission_entries.generated_at','commission_entries.reversed_at','commission_holds.created_at','commission_holds.resolved_at',
    'sale_tips.created_at','sale_tips.reversed_at','sale_reversals.created_at','inventory_movements.created_at',
    'branch_inventory.updated_at','expenses.incurred_at','expenses.created_at','expenses.updated_at',
    'appointments.created_at','appointments.updated_at','appointments.arrived_at','appointments.completed_at',
    'employee_time_off.created_at','commission_settlements.paid_at','commission_settlements.created_at',
    'commission_settlement_lines.created_at','commission_settlement_payments.created_at','audit_log.created_at'];
  v_col text;
begin
  -- Candados: solo el negocio de desarrollo esperado, como postgres, sin caja abierta y sin repetir el día.
  if current_user <> 'postgres' then raise exception 'Ejecuta la simulación como postgres (SQL del proyecto).'; end if;
  if not exists (select 1 from public.businesses b where b.id = c_business and b.slug = 'gallo-420' and b.name = 'Gallo 4:20') then
    raise exception 'Este no es el negocio de desarrollo esperado (Gallo 4:20 de sonblade-dev). No se hizo nada.';
  end if;
  if not exists (select 1 from public.branches b where b.id = v_branch and b.business_id = c_business) then
    raise exception 'La sucursal % no es del negocio de desarrollo.', v_branch;
  end if;
  if exists (select 1 from public.cash_sessions s where s.branch_id = v_branch and s.status = 'open') then
    raise exception 'Hay una caja abierta en la sucursal. La simulación no la toca: ciérrala desde la app y vuelve a correr.';
  end if;
  if exists (select 1 from public.sales s where s.business_id = c_business and s.idempotency_key like (v_plan->>'key_prefix') || '%') then
    raise exception 'Este día de la simulación ya se ejecutó (%).', v_plan->>'key_prefix';
  end if;
  select timezone into v_tz from public.businesses where id = c_business;

  select jsonb_object_agg(x.alias, u.id) into v_users from (values
    ('owner','alonso@gallo-420.barberos.invalid'),('dago','dago@gallo-420.barberos.invalid'),('emi','emi@gallo-420.barberos.invalid'),('sonia','sonia@gallo-420.barberos.invalid')) x(alias, email)
    join auth.users u on u.email = x.email;
  if (select count(*) from jsonb_object_keys(v_users)) <> 4 then raise exception 'Faltan cuentas de demostración.'; end if;
  select jsonb_object_agg(e.display_name, e.id) into v_emps from public.employees e where e.business_id = c_business and e.is_active
    and e.display_name in (select jsonb_array_elements_text(v_plan->'employees'));
  if (select count(*) from jsonb_object_keys(coalesce(v_emps, '{}'))) <> jsonb_array_length(v_plan->'employees') then
    raise exception 'No se encontraron todos los empleados de la simulación: %', v_plan->'employees';
  end if;
  select jsonb_object_agg(s.name, jsonb_build_object('id', s.id, 'price', s.price, 'var', s.variable_price)) into v_svc
    from public.services s where s.business_id = c_business and s.is_active and s.name not like '%(prueba)';
  select jsonb_object_agg(p.name, jsonb_build_object('id', p.id, 'price', p.sale_price)) into v_prod
    from public.products p where p.business_id = c_business and p.is_active and p.name not like '%(prueba)';

  for v_ev in select value from jsonb_array_elements(v_plan->'events') loop
    v_at := (v_ev->>'at')::timestamp at time zone v_tz;
    v_uid := (v_users->>(v_ev->>'user'))::uuid;
    if v_uid is null then raise exception 'Usuario desconocido en el plan: %', v_ev->>'user'; end if;

    -- Datos que se leen como postgres antes de actuar como el usuario.
    if v_ev->>'t' = 'sale' then
      v_items := '[]'; v_total := 0;
      for v_it in select value from jsonb_array_elements(v_ev->'items') loop
        if v_it ? 's' then
          if v_svc->(v_it->>'s') is null then raise exception 'Servicio no encontrado: %', v_it->>'s'; end if;
          v_var := (v_svc->(v_it->>'s')->>'var')::boolean;
          v_price := case when v_var then (v_it->>'price')::numeric else (v_svc->(v_it->>'s')->>'price')::numeric end;
          v_total := v_total + v_price - coalesce((v_it->>'disc')::numeric, 0);
          v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('item_type','service','catalog_id', v_svc->(v_it->>'s')->>'id',
            'quantity',1,'employee_id', v_emps->>(v_it->>'b'),
            'unit_price', case when v_var then v_price end, 'discount_amount', (v_it->>'disc')::numeric)));
        else
          if v_prod->(v_it->>'p') is null then raise exception 'Producto no encontrado: %', v_it->>'p'; end if;
          v_total := v_total + (v_prod->(v_it->>'p')->>'price')::numeric * (v_it->>'q')::int;
          v_items := v_items || jsonb_build_array(jsonb_build_object('item_type','product','catalog_id', v_prod->(v_it->>'p')->>'id',
            'quantity',(v_it->>'q')::int,'commission_employee_ids', jsonb_build_array(v_emps->>(v_it->>'by'))));
        end if;
      end loop;
      v_fixed := coalesce((select sum((p->>'a')::numeric) from jsonb_array_elements(v_ev->'pays') p where p ? 'a'), 0);
      v_pays := (select jsonb_agg(jsonb_build_object('method', p->>'m', 'amount', coalesce((p->>'a')::numeric, v_total - v_fixed)))
                 from jsonb_array_elements(v_ev->'pays') p);
      v_tips := coalesce((select jsonb_agg(jsonb_build_object('amount',(t->>'a')::numeric,'method',t->>'m','employee_id', v_emps->>(t->>'b')))
                 from jsonb_array_elements(v_ev->'tips') t), '[]');
    end if;
    if v_ev->>'t' in ('close','settle') then v_avail := private.cash_available(v_session); end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    set local role authenticated;

    case v_ev->>'t'
      when 'inventory' then
        for v_it in select value from jsonb_array_elements(v_ev->'items') loop
          perform public.adjust_inventory_stock(v_branch, (v_prod->(v_it->>'p')->>'id')::uuid, (v_it->>'q')::int, v_ev->>'notes');
        end loop;
      when 'open' then
        v_session := (public.open_cash_session(v_branch, (v_ev->>'amount')::numeric)->>'cash_session_id')::uuid;
      when 'timeoff' then
        perform public.create_time_off(v_branch, (v_emps->>(v_ev->>'barber'))::uuid,
          (v_ev->>'from')::timestamp at time zone v_tz, (v_ev->>'to')::timestamp at time zone v_tz, v_ev->>'reason',
          (v_ev->>'requested_at')::timestamp at time zone v_tz, v_ev->>'via');
      when 'book' then
        insert into public.appointments (business_id, branch_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at,
          notes, status, source, created_by)
        values (c_business, v_branch, (v_emps->>(v_ev->>'barber'))::uuid, v_ev->>'customer',
          (v_ev->>'start')::timestamp at time zone v_tz, ((v_ev->>'start')::timestamp at time zone v_tz) + make_interval(mins => (v_ev->>'minutes')::int),
          v_ev->>'note', 'scheduled', 'appointment', v_uid)
        returning id into v_id;
        v_appts := v_appts || jsonb_build_object(v_ev->>'key', v_id);
      when 'checkin' then
        perform public.change_appointment_status((v_appts->>(v_ev->>'key'))::uuid, 'checked_in', null);
      when 'cancel' then
        perform public.change_appointment_status((v_appts->>(v_ev->>'key'))::uuid, 'cancelled', v_ev->>'reason');
      when 'noshow' then
        perform public.change_appointment_status((v_appts->>(v_ev->>'key'))::uuid, 'no_show', v_ev->>'reason');
      when 'sale' then
        v_res := public.confirm_sale(v_branch, v_ev->>'key', v_items, v_pays, null, null, v_ev->>'discount_reason', v_tips,
          (v_users->>(v_ev->>'authorizer'))::uuid, (v_appts->>(v_ev->>'appt'))::uuid);
        if v_res->>'status' <> 'paid' or (v_res->>'idempotent_replay')::boolean then
          raise exception 'La venta % no quedó pagada: %', v_ev->>'key', v_res;
        end if;
        v_sales := v_sales || jsonb_build_object(v_ev->>'key', v_res->>'sale_id');
      when 'reverse' then
        perform public.reverse_sale((v_sales->>(v_ev->>'key'))::uuid, v_ev->>'reason');
      when 'expense' then
        perform public.record_cash_movement(v_session, 'expense', 'cash', (v_ev->>'amount')::numeric, v_ev->>'desc');
      when 'settle' then
        for v_person in select value from jsonb_array_elements(v_ev->'people') loop
          v_emp := (v_emps->>(v_person->>'e'))::uuid;
          v_prev := public.preview_commission_settlement(v_branch, v_emp, (v_ev->>'period_start')::date, (v_ev->>'period_end')::date);
          if not (v_prev->>'can_settle')::boolean then raise exception 'No se puede liquidar a %: %', v_person->>'e', v_prev; end if;
          v_total := (v_prev->>'total_amount')::numeric;
          v_cash := case when (v_person->>'cash')::numeric < 0 then v_total else least(v_total, (v_person->>'cash')::numeric) end;
          if v_cash > v_avail - 500 then v_cash := 0; end if;          -- si no alcanza (dejando el fondo), todo por transferencia
          v_avail := v_avail - v_cash;
          v_pays := '[]';
          if v_cash > 0 then v_pays := v_pays || jsonb_build_array(jsonb_build_object('method','cash','amount',v_cash)); end if;
          if v_total - v_cash > 0 then v_pays := v_pays || jsonb_build_array(jsonb_build_object('method','transfer','amount',v_total - v_cash,'reference','Transferencia SPEI')); end if;
          perform public.settle_commissions(v_branch, v_emp, (v_ev->>'period_start')::date, (v_ev->>'period_end')::date, v_pays);
        end loop;
      when 'close' then
        perform public.close_cash_session(v_session, v_avail + (v_ev->>'short')::numeric, null, null, null, v_ev->>'delivered_to');
      else raise exception 'Evento desconocido: %', v_ev->>'t';
    end case;

    -- Fechar: todo lo que esta operación escribió con now() pasa a la hora simulada.
    reset role;
    set local session_replication_role = replica;   -- en Supabase solo se permite con SET, no con set_config()
    update public.appointments set scheduled_start_at = v_at - (scheduled_end_at - scheduled_start_at), scheduled_end_at = v_at
      where business_id = c_business and source = 'walk_in' and scheduled_end_at = now();
    foreach v_col in array c_redate loop
      execute format('update public.%I set %I = $1 where business_id = $2 and %I = now()',
        split_part(v_col, '.', 1), split_part(v_col, '.', 2), split_part(v_col, '.', 2)) using v_at, c_business;
    end loop;
    if v_ev->>'t' = 'open' then
      -- open_cash_session propone el fondo de la última caja cerrada por closed_at; a la hora simulada esa es la del
      -- día anterior simulado (o ninguna), no la de hoy. Se deja el valor que la función habría calculado entonces.
      update public.cash_sessions set opening_expected = (select s.float_left from public.cash_sessions s
        where s.branch_id = v_branch and s.status = 'closed' and s.closed_at < v_at order by s.closed_at desc limit 1)
        where id = v_session;
      update public.audit_log set after_data = jsonb_set(after_data, '{opening_expected}',
          coalesce(to_jsonb((select opening_expected from public.cash_sessions where id = v_session)), 'null'::jsonb))
        where business_id = c_business and entity_type = 'cash_session' and entity_id = v_session::text and action = 'cash_opened';
    end if;
    set local session_replication_role = origin;
  end loop;

  if current_setting('session_replication_role') <> 'origin' or current_user <> 'postgres' then
    raise exception 'La simulación terminó en un estado inesperado.';
  end if;
end
$sim$;`;

function planFor(dayIndexes, withStockIn = false) {
    const evs = events.filter((e) => dayIndexes.includes(e.day) || (withStockIn && e.t === 'inventory')).map((e) => { const copy = { ...e }; delete copy.sortKey; delete copy.day; return copy; });
    const prefix = dayIndexes.length === 1 ? `${KEY}-d${dayIndexes[0]}-` : `${KEY}-`;
    const employees = [...new Set([...BARBERS, 'Dago', 'Emi'])];
    return JSON.stringify({ key_prefix: prefix, employees, events: evs });
}
const engine = (dayIndexes, withStockIn) => ENGINE.replace('__PLAN__', planFor(dayIndexes, withStockIn));

const VERIFY = (branchExpr) => String.raw`
with b as (select ${branchExpr} as branch_id),
w as (select (date '${WEEK_START}')::timestamp at time zone 'America/Mexico_City' as s, (date '${PERIOD_END}' + 1)::timestamp at time zone 'America/Mexico_City' as e),
sim_sales as (select s.* from public.sales s, b where s.branch_id = b.branch_id and s.idempotency_key like '${KEY}-%'),
items as (select si.* from public.sale_items si join sim_sales s on s.id = si.sale_id)
select jsonb_build_object(
 'sales_by_status', (select jsonb_object_agg(status, n) from (select status, count(*) n from sim_sales group by 1) x),
 'sales_by_day', (select jsonb_object_agg(d, n) from (select to_char(paid_at at time zone 'America/Mexico_City','YYYY-MM-DD Dy') d, count(*) n from sim_sales group by 1) x),
 'sales_outside_week', (select count(*) from sim_sales, w where paid_at < w.s or paid_at >= w.e or created_at < w.s or created_at >= w.e),
 'folios', (select jsonb_build_array(min(folio), max(folio)) from sim_sales),
 'revenue_paid', (select sum(line_total) from items i join sim_sales s on s.id = i.sale_id where s.status = 'paid'),
 'commission_mismatches', (select count(*) from public.commission_entries ce join items i on i.id = ce.sale_item_id
     where ce.commission_amount <> case when i.item_type = 'service' then round(i.unit_price * i.quantity * 0.5, 2) else round(i.line_total * 0.2, 2) end),
 'items_without_commission', (select count(*) from items i join sim_sales s on s.id = i.sale_id where s.status = 'paid'
     and not exists (select 1 from public.commission_entries ce where ce.sale_item_id = i.id and ce.status = 'generated')),
 'commission_ts_mismatch', (select count(*) from public.commission_entries ce join sim_sales s on s.id = ce.sale_id where ce.generated_at <> s.paid_at),
 'payments_ts_mismatch', (select count(*) from public.payments p join sim_sales s on s.id = p.sale_id where p.processed_at <> s.paid_at),
 'unit_cost_missing', (select count(*) from items where item_type = 'product' and unit_cost_snapshot is null),
 'sales_without_appointment', (select count(*) from sim_sales where appointment_id is null and exists (select 1 from items i where i.sale_id = sim_sales.id and i.item_type = 'service')),
 'walkin_day_mismatch', (select count(*) from sim_sales s join public.appointments a on a.id = s.appointment_id
     where (a.scheduled_start_at at time zone 'America/Mexico_City')::date <> (s.paid_at at time zone 'America/Mexico_City')::date),
 'appointments', (select jsonb_object_agg(k, n) from (select a.source || ':' || a.status k, count(*) n from public.appointments a, b, w
     where a.branch_id = b.branch_id and a.scheduled_start_at >= w.s and a.scheduled_start_at < w.e group by 1) x),
 'appt_off_grid', (select count(*) from public.appointments a, b, w where a.branch_id = b.branch_id and a.source = 'appointment'
     and a.scheduled_start_at >= w.s and a.scheduled_start_at < w.e and extract(minute from a.scheduled_start_at) not in (0, 30)),
 'tips', (select jsonb_build_object('count', sum(n), 'total', sum(total), 'by_method', jsonb_object_agg(method || ':' || status, total))
     from (select t.method, t.status, count(*) n, sum(t.amount) total from public.sale_tips t join sim_sales s on s.id = t.sale_id group by 1, 2) x),
 'payments_by_method', (select jsonb_object_agg(method, total) from (select p.method, sum(p.amount) total from public.payments p join sim_sales s on s.id = p.sale_id where p.status = 'confirmed' group by 1) x),
 'split_sales', (select count(*) from sim_sales s where (select count(*) from public.payments p where p.sale_id = s.id) > 1),
 'discounted', (select jsonb_agg(jsonb_build_object('folio', folio, 'discount', discount_amount, 'reason', discount_reason, 'by', discount_authorized_by)) from sim_sales where discount_amount > 0),
 'reversals', (select jsonb_agg(jsonb_build_object('folio', s.folio, 'reason', r.reason, 'at', r.created_at)) from public.sale_reversals r join sim_sales s on s.id = r.sale_id),
 'cash_sessions', (select jsonb_agg(jsonb_build_object('opened', opened_at at time zone 'America/Mexico_City', 'closed', closed_at at time zone 'America/Mexico_City',
     'opening', opening_cash, 'expected', expected_cash, 'counted', counted_cash, 'diff', difference_amount, 'float', float_left, 'reserve', reserve_amount,
     'withdrawn', withdrawn_amount, 'to', withdrawal_delivered_to,
     'recomputed', private.cash_available(cs.id)) order by opened_at) from public.cash_sessions cs, b, w where cs.branch_id = b.branch_id and cs.opened_at >= w.s and cs.opened_at < w.e),
 'expenses', (select jsonb_build_object('count', count(*), 'total', sum(amount)) from public.expenses x, b, w where x.branch_id = b.branch_id and x.incurred_at >= w.s and x.incurred_at < w.e),
 'inventory', (select jsonb_agg(jsonb_build_object('product', p.name, 'on_hand', bi.quantity_on_hand,
     'movements', (select sum(m.quantity_delta) from public.inventory_movements m where m.branch_id = bi.branch_id and m.product_id = p.id))) from public.branch_inventory bi join public.products p on p.id = bi.product_id, b
     where bi.branch_id = b.branch_id and p.name not like '%(prueba)'),
 'audit_left_at_real_now', (select count(*) from public.audit_log l, b where l.branch_id = b.branch_id and l.created_at = now()),
 'rows_left_at_real_now', (select count(*) from sim_sales where created_at = now() or paid_at = now() or updated_at = now()),
 'settlements', (select jsonb_agg(jsonb_build_object('employee', (select display_name from public.employees e where e.id = cs.employee_id),
     'receipt', receipt_number, 'total', total_amount, 'paid_at', paid_at at time zone 'America/Mexico_City',
     'commissions', (select sum(l.amount) from public.commission_settlement_lines l where l.settlement_id = cs.id and l.line_type = 'commission'),
     'tips', (select sum(t.amount) from public.sale_tips t where t.settlement_id = cs.id),
     'payments', (select jsonb_object_agg(method, amount) from public.commission_settlement_payments sp where sp.settlement_id = cs.id)))
     from public.commission_settlements cs, b where cs.branch_id = b.branch_id and cs.period_start = date '${WEEK_START}'),
 'unsettled_week_commissions', (select coalesce(sum(ce.commission_amount), 0) from public.commission_entries ce join sim_sales s on s.id = ce.sale_id
     where ce.status = 'generated' and not exists (select 1 from public.commission_settlement_lines l where l.commission_entry_id = ce.id)),
 'unsettled_week_tips', (select coalesce(sum(t.amount), 0) from public.sale_tips t join sim_sales s on s.id = t.sale_id where t.status = 'generated' and t.settlement_id is null),
 'time_off', (select jsonb_agg(jsonb_build_object('who', (select display_name from public.employees e where e.id = t.employee_id), 'from', starts_at at time zone 'America/Mexico_City',
     'to', ends_at at time zone 'America/Mexico_City', 'reason', reason, 'created', created_at at time zone 'America/Mexico_City')) from public.employee_time_off t, b, w where t.branch_id = b.branch_id and t.starts_at >= w.s and t.starts_at < w.e),
 'triggers_not_enabled', (select count(*) from pg_trigger where not tgisinternal and tgenabled <> 'O'),
 'replication_role', current_setting('session_replication_role')
);`;

function summary() {
    const lines = [`Semana ${WEEK_START} a ${PERIOD_END} · semilla ${SEED} · barberos: ${BARBERS.join(', ')} · folio de pagos P${ISO_WEEK}-NN`];
    lines.push('día        | visitas cobradas | servicios | con cita | sin cita | productos | propinas | divididos | descuentos | canceladas | no llegó | anuladas | gastos');
    for (let d = 0; d < 7; d++) {
        const s = counters.byDay[d];
        lines.push(`${DAY_NAMES[d].padEnd(10)} | ${String(s.visits).padStart(16)} | ${String(s.services).padStart(9)} | ${String(s.appts_paid ?? 0).padStart(8)} | ${String(s.walkins ?? 0).padStart(8)} | ${String(s.products).padStart(9)} | ${String(s.tips).padStart(8)} | ${String(s.splits).padStart(9)} | ${String(s.discounts).padStart(10)} | ${String(s.cancels).padStart(10)} | ${String(s.noShows).padStart(8)} | ${String(s.reversals).padStart(8)} | ${String(s.expenses).padStart(6)}`);
    }
    const perBarber = {};
    for (const e of events.filter((x) => x.t === 'sale')) for (const i of e.items) {
        const who = i.b ?? i.by; perBarber[who] ??= { services: new Set(), units: 0, products: 0 };
        if (i.s) { perBarber[who].services.add(i.s); perBarber[who].units++; } else perBarber[who].products += i.q;
    }
    for (const [who, v] of Object.entries(perBarber)) lines.push(`${who}: ${v.units} servicios, ${v.products} productos; tipos: ${[...v.services].join(', ')}`);
    return lines.join('\n');
}

if (flag('--summary')) {
    console.log(summary());
} else if (flag('--plan')) {
    console.log(JSON.stringify(events, null, 2));
} else if (flag('--verify')) {
    console.log(VERIFY(`'${BRANCH_ID}'::uuid`));
} else if (flag('--rehearsal')) {
    // Ensayo: la semana completa en una sucursal temporal creada dentro de la transacción, y ROLLBACK.
    // No toca la sucursal real ni su caja; al revertir no queda nada (solo huecos en secuencias de identificadores).
    console.log(`begin;
insert into public.branches (id, business_id, name, timezone, is_active, cash_float_target, daily_reserve_amount, daily_reserve_label)
select '00000000-0000-4000-8000-00000000e2e5', business_id, 'Ensayo simulación (temporal)', timezone, true, cash_float_target, daily_reserve_amount, daily_reserve_label
from public.branches where id = '${BRANCH_ID}';
insert into public.branch_inventory (business_id, branch_id, product_id, quantity_on_hand, minimum_quantity)
select business_id, '00000000-0000-4000-8000-00000000e2e5', product_id, 0, minimum_quantity from public.branch_inventory where branch_id = '${BRANCH_ID}';
insert into public.user_branch_access (business_id, branch_id, user_id)
select business_id, '00000000-0000-4000-8000-00000000e2e5', user_id from public.user_branch_access where branch_id = '${BRANCH_ID}';
select set_config('sim.branch_id', '00000000-0000-4000-8000-00000000e2e5', true);
${engine((opt('--days', '0,1,2,3,4,5,6')).split(',').map(Number), true)}
-- Cuadre, leído como el dueño (la función exige dueño o gerente).
create temp table sim_check (k text, v jsonb) on commit drop;
grant insert on sim_check to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'alonso@gallo-420.barberos.invalid'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into sim_check select 'cuadre', public.agenda_reconciliation('00000000-0000-4000-8000-00000000e2e5', date '${WEEK_START}', date '${PERIOD_END}');
reset role;
${VERIFY(`'00000000-0000-4000-8000-00000000e2e5'::uuid`).replace("select jsonb_build_object(", "select jsonb_build_object(\n 'cuadre_summary', (select v->'summary' from sim_check where k = 'cuadre'),\n 'cuadre_issues', (select v->'issues' from sim_check where k = 'cuadre'),")}
rollback;`);
} else if (opt('--day') !== undefined) {
    const d = Number(opt('--day'));
    if (!(d >= 0 && d <= 6)) throw new Error('--day debe ser de 0 (domingo) a 6 (sábado).');
    console.log(`begin;
select set_config('sim.branch_id', '${BRANCH_ID}', true);
${engine([d])}
commit;`);
} else {
    console.log('Uso: node scripts/simulate-week.mjs --summary | --rehearsal | --day N | --verify  [--week AAAA-MM-DD] [--seed N]');
}
