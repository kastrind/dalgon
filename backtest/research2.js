import { loadHourly, features, collectEvents, clusteredT } from './research.js';
import { fileURLToPath } from 'url';
import { parseArgs, assetsOf } from './config.js';

// Hypotheses were fixed before looking at results. A rule counts as a candidate only if it clears the bar on the tuning blocks
// (2022-01 to 2024-12) and is then checked once on the holdout (2025-01 to 2026-10).
const IDX = { h24: 2, h72: 3 };
const MIN_GROSS = 1.0;
const MIN_T = 3;

export function extras(feats, hours) {
	for (let asset in feats) {
		let f = feats[asset];
		f.sigma = new Float64Array(hours).fill(NaN);
		for (let i = 168; i < hours; i++) {
			let sum = 0, sq = 0, n = 0;
			for (let j = i - 167; j <= i; j++) if (!Number.isNaN(f.r1[j])) { sum += f.r1[j]; sq += f.r1[j] * f.r1[j]; n++; }
			if (n > 100) { let m = sum / n; f.sigma[i] = Math.sqrt(Math.max(sq / n - m * m, 0)); }
		}
		for (let k of [4, 12, 24]) {
			f[`z${k}`] = new Float64Array(hours).fill(NaN);
			for (let i = 168; i < hours; i++) if (f.sigma[i] > 0) f[`z${k}`][i] = f[`r${k}`][i] / (f.sigma[i] * Math.sqrt(k));
		}
	}
	// Which coin is the weakest of all at each hour, by volatility-adjusted 24h and 4h change.
	for (let k of [4, 24]) {
		let worst = new Int8Array(hours).fill(-1);
		let names = Object.keys(feats).filter(a => a !== 'BTC');
		for (let i = 168; i < hours; i++) {
			let best = Infinity, who = -1;
			names.forEach((a, n) => { let z = feats[a][`z${k}`][i]; if (!Number.isNaN(z) && z < best) { best = z; who = n; } });
			worst[i] = who;
		}
		names.forEach((a, n) => { feats[a][`worst${k}`] = new Uint8Array(hours).map((_, i) => (worst[i] === n ? 1 : 0)); });
	}
}

const RULES = [
	['G1 vol-normalised drop', 'z4 <= -2.5', f => f.z4 <= -2.5],
	['G1 vol-normalised drop', 'z4 <= -3', f => f.z4 <= -3],
	['G1 vol-normalised drop', 'z4 <= -4', f => f.z4 <= -4],
	['G1 vol-normalised drop', 'z12 <= -3', f => f.z12 <= -3],
	['G1 vol-normalised drop', 'z12 <= -4', f => f.z12 <= -4],
	['G1 vol-normalised drop', 'z24 <= -3', f => f.z24 <= -3],
	['G1 vol-normalised drop', 'z24 <= -4', f => f.z24 <= -4],
	['G1 vol-normalised drop', 'z24 <= -5', f => f.z24 <= -5],
	['G2 coin-specific vs market-wide', 'z12 <= -3, BTC 12h >= -1%', (f, i, b) => f.z12 <= -3 && b.r12 >= -0.01],
	['G2 coin-specific vs market-wide', 'z12 <= -3, BTC 12h <= -3%', (f, i, b) => f.z12 <= -3 && b.r12 <= -0.03],
	['G2 coin-specific vs market-wide', 'z24 <= -3, BTC 24h >= -2%', (f, i, b) => f.z24 <= -3 && b.r24 >= -0.02],
	['G2 coin-specific vs market-wide', 'z24 <= -3, BTC 24h <= -5%', (f, i, b) => f.z24 <= -3 && b.r24 <= -0.05],
	['G3 bounce confirmation', 'z12 <= -3, last hour up', f => f.z12 <= -3 && f.r1 > 0],
	['G3 bounce confirmation', 'z12 <= -3, last hour down', f => f.z12 <= -3 && f.r1 < 0],
	['G3 bounce confirmation', 'z24 <= -3, last hour up', f => f.z24 <= -3 && f.r1 > 0],
	['G4 weakest coin', 'weakest by z24 and z24 <= -2.5', f => f.worst24 === 1 && f.z24 <= -2.5],
	['G4 weakest coin', 'weakest by z4 and z4 <= -2.5', f => f.worst4 === 1 && f.z4 <= -2.5],
	['G5 long-term trend', 'z24 <= -3, above 50-day average', f => f.z24 <= -3 && f.c > f.ema1200],
	['G5 long-term trend', 'z24 <= -3, below 50-day average', f => f.z24 <= -3 && f.c < f.ema1200]
];

// Rules see one value per feature, so project the arrays at hour i into a plain object.
export function snapshot(f, i) {
	return { z4: f.z4[i], z12: f.z12[i], z24: f.z24[i], r1: f.r1[i], r12: f.r12[i], r24: f.r24[i], c: f.c[i], ema1200: f.ema1200[i], worst4: f.worst4 ? f.worst4[i] : 0, worst24: f.worst24 ? f.worst24[i] : 0 };
}

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

function summarize(events, k) {
	let vals = events.map(e => e.fwd[k]).filter(v => !Number.isNaN(v));
	return { n: vals.length, mean: vals.length ? mean(vals) : NaN, t: clusteredT(events, k) };
}

async function main() {
	let args = parseArgs(process.argv.slice(2));
	let assets = [...new Set([...assetsOf(args), 'BTC'])];
	let data = loadHourly(args, assets);
	let feats = {};
	for (let asset of assets) feats[asset] = features(data.assets[asset], data.hours);
	extras(feats, data.hours);
	let edgeC = Math.floor((Date.UTC(2025, 0, 1) / 1000 - data.fromSec) / 3600);
	let years = (data.hours - 200) / 8766;

	let tested = 0, candidates = [];
	console.log(`gross forward return, long only, % (mean, daily-clustered t); costs are about 0.7%. Candidate bar on tuning blocks: mean > ${MIN_GROSS}% and t >= ${MIN_T} at 24h or 72h.`);
	console.log(`assets: ${assets.join(' ')}\n`);
	console.log('rule'.padEnd(46) + 'tune n'.padStart(8) + '24h'.padStart(16) + '72h'.padStart(16) + '  | hold n'.padStart(10) + '24h'.padStart(9) + '72h'.padStart(9) + '  per yr');
	let lastGroup = '';
	for (let [group, name, test] of RULES) {
		if (group !== lastGroup) { console.log(`-- ${group}`); lastGroup = group; }
		let events = collectEvents(data, feats, { test: (f, i, b) => test(snapshot(f, i), i, snapshot(b, i)) }).filter(e => e.asset !== 'BTC');
		let tune = events.filter(e => e.i < edgeC), hold = events.filter(e => e.i >= edgeC);
		let t24 = summarize(tune, IDX.h24), t72 = summarize(tune, IDX.h72), h24 = summarize(hold, IDX.h24), h72 = summarize(hold, IDX.h72);
		tested += 2;
		let pass = (t24.mean > MIN_GROSS && t24.t >= MIN_T) || (t72.mean > MIN_GROSS && t72.t >= MIN_T);
		if (pass) candidates.push(name);
		let cell = s => `${s.mean.toFixed(2)} (${s.t.toFixed(1)})`;
		console.log(`${pass ? '* ' : '  '}${name}`.padEnd(46) + String(tune.length).padStart(8) + cell(t24).padStart(16) + cell(t72).padStart(16) + `  | ${hold.length}`.padStart(10) + h24.mean.toFixed(2).padStart(9) + h72.mean.toFixed(2).padStart(9) + `  ${(events.length / years).toFixed(0)}`);
	}
	console.log(`\n${tested} horizon tests; candidates marked *: ${candidates.length ? candidates.join('; ') : 'none'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
