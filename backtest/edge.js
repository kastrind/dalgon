import { computeSignals } from './signals.js';
import { loadExec, randomSteps } from './run.js';
import { parseArgs, assetsOf } from './config.js';
import { monthStartSec } from './data.js';

const HORIZONS = [1, 4, 12, 24, 48];
const COOLDOWN_SEC = 12 * 3600;

function forwardReturns(s, t, hours) {
	let lo = 0, hi = s.n;
	while (lo < hi) { let mid = (lo + hi) >> 1; if (s.t[mid] < t) lo = mid + 1; else hi = mid; }
	if (lo === 0) return null;
	let entry = s.c[lo - 1];
	return hours.map(h => {
		let j = lo;
		let target = t + h * 3600;
		while (j < s.n && s.t[j] < target) j++;
		return j < s.n ? (s.c[j] / entry - 1) * 100 : null;
	});
}

function stats(values) {
	let v = values.filter(x => x !== null);
	let mean = v.reduce((a, b) => a + b, 0) / v.length;
	let sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
	return { n: v.length, mean, se: sd / Math.sqrt(v.length) };
}

// Gross forward return after each signal, before fees, one event per asset per cooldown.
function events(steps, minGrade) {
	let last = {};
	let out = [];
	for (let step of steps) for (let c of step.c) {
		if (c.g < minGrade) continue;
		if (last[c.n] !== undefined && step.t - last[c.n] < COOLDOWN_SEC) continue;
		last[c.n] = step.t;
		out.push({ t: step.t, n: c.n, g: c.g, al: c.al });
	}
	return out;
}

async function main() {
	let args = parseArgs(process.argv.slice(2));
	let steps = await computeSignals(args);
	let exec = loadExec(args);
	let simFrom = monthStartSec(args.from);
	let [ey, em] = args.to.split('-').map(Number);
	let simTo = Date.UTC(ey, em, 1) / 1000;
	let line = (label, list) => {
		let rows = HORIZONS.map((_, k) => stats(list.map(x => x[k])));
		console.log(`${label.padEnd(26)} n=${String(rows[0].n).padEnd(5)} ` + rows.map((r, k) => `${HORIZONS[k]}h ${r.mean.toFixed(2)}%(+/-${r.se.toFixed(2)})`).join('  '));
	};
	let fwd = list => list.map(e => forwardReturns(exec[`${e.n}${args.quote}`], e.t, HORIZONS)).filter(Boolean);

	console.log('gross forward return from the signal time, before fees (mean, standard error)');
	line('random entries', fwd(randomSteps(exec, args.quote, simFrom, simTo, 4000, 7).map(s => ({ t: s.t, n: s.c[0].n }))));
	for (let minGrade of [0, 0.99, 1.2]) {
		let ev = events(steps, minGrade);
		line(`signal, grade >= ${minGrade}`, fwd(ev));
	}
	let aligned = events(steps, 0).filter(e => e.al > 1);
	line('signal, 2+ timeframes', fwd(aligned));
	for (let asset of assetsOf(args)) line(`signal, ${asset}`, fwd(events(steps, 0).filter(e => e.n === asset)));
	for (let year of [2022, 2023, 2024, 2025, 2026]) {
		line(`signal, ${year}`, fwd(events(steps, 0).filter(e => new Date(e.t * 1000).getUTCFullYear() === year)));
	}
}

await main();
