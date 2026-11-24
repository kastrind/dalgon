import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSeries, monthStartSec } from './data.js';
import { parseArgs, assetsOf, dataDir } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const HORIZONS = [4, 12, 24, 72, 168];
const COOLDOWN_BARS = 24;
const COST = 0.7;

// Hourly bars on a shared grid; hours without trades stay NaN.
export function loadHourly(args, assets) {
	let fromSec = monthStartSec(args.from);
	let [ey, em] = args.to.split('-').map(Number);
	let toSec = Date.UTC(ey, em, 1) / 1000;
	let hours = Math.ceil((toSec - fromSec) / 3600);
	let data = { hours, fromSec, assets: {} };
	for (let asset of assets) {
		let s = loadSeries(dataDir(args), `${asset}${args.quote}`, fromSec, toSec);
		let make = () => new Float64Array(hours).fill(NaN);
		let bars = { o: make(), h: make(), l: make(), c: make(), v: make(), q: make() };
		for (let i = 0; i < s.n; i++) {
			let k = Math.floor((s.t[i] - fromSec) / 3600);
			if (Number.isNaN(bars.o[k])) { bars.o[k] = s.o[i]; bars.h[k] = s.h[i]; bars.l[k] = s.l[i]; bars.v[k] = 0; bars.q[k] = 0; }
			if (s.h[i] > bars.h[k]) bars.h[k] = s.h[i];
			if (s.l[i] < bars.l[k]) bars.l[k] = s.l[i];
			bars.c[k] = s.c[i]; bars.v[k] += s.v[i]; bars.q[k] += s.q[i];
		}
		data.assets[asset] = bars;
	}
	return data;
}

function ema(values, n) {
	let out = new Float64Array(values.length).fill(NaN);
	let k = 2 / (n + 1), prev = NaN;
	for (let i = 0; i < values.length; i++) {
		if (Number.isNaN(values[i])) { out[i] = prev; continue; }
		prev = Number.isNaN(prev) ? values[i] : prev + k * (values[i] - prev);
		out[i] = i >= n ? prev : NaN;
	}
	return out;
}

function rsi(close, n) {
	let out = new Float64Array(close.length).fill(NaN);
	let gain = 0, loss = 0, last = NaN, count = 0;
	for (let i = 0; i < close.length; i++) {
		if (Number.isNaN(close[i])) continue;
		if (!Number.isNaN(last)) {
			let d = close[i] - last;
			let g = Math.max(d, 0), l = Math.max(-d, 0);
			if (count < n) { gain += g / n; loss += l / n; count++; }
			else { gain = (gain * (n - 1) + g) / n; loss = (loss * (n - 1) + l) / n; }
			if (count >= n) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
		}
		last = close[i];
	}
	return out;
}

export function features(bars, hours) {
	let { h, l, c, v } = bars;
	let f = { c, ema50: ema(c, 50), ema200: ema(c, 200), ema1200: ema(c, 1200), rsi14: rsi(c, 14) };
	let ret = k => { let r = new Float64Array(hours).fill(NaN); for (let i = k; i < hours; i++) r[i] = c[i] / c[i - k] - 1; return r; };
	f.r1 = ret(1); f.r4 = ret(4); f.r12 = ret(12); f.r24 = ret(24); f.r72 = ret(72); f.r168 = ret(168);
	f.bbz = new Float64Array(hours).fill(NaN);
	f.hi48 = new Float64Array(hours).fill(NaN);
	f.hi168 = new Float64Array(hours).fill(NaN);
	f.volRatio = new Float64Array(hours).fill(NaN);
	f.atr = new Float64Array(hours).fill(NaN);
	for (let i = 168; i < hours; i++) {
		let sum = 0, sq = 0, n = 0, vsum = 0, vn = 0, hi48 = -Infinity, hi168 = -Infinity;
		for (let j = i - 23; j <= i; j++) if (!Number.isNaN(c[j])) { sum += c[j]; sq += c[j] * c[j]; n++; }
		if (n > 12) { let m = sum / n, sd = Math.sqrt(Math.max(sq / n - m * m, 0)); if (sd > 0) f.bbz[i] = (c[i] - m) / sd; }
		for (let j = i - 24; j < i; j++) if (!Number.isNaN(v[j])) { vsum += v[j]; vn++; }
		if (vn > 12 && vsum > 0) f.volRatio[i] = v[i] / (vsum / vn);
		for (let j = i - 48; j < i; j++) if (h[j] > hi48) hi48 = h[j];
		for (let j = i - 168; j < i; j++) if (h[j] > hi168) hi168 = h[j];
		f.hi48[i] = hi48; f.hi168[i] = hi168;
		let tr = 0, tn = 0;
		for (let j = i - 13; j <= i; j++) if (!Number.isNaN(h[j]) && !Number.isNaN(c[j - 1])) { tr += Math.max(h[j] - l[j], Math.abs(h[j] - c[j - 1]), Math.abs(l[j] - c[j - 1])); tn++; }
		if (tn > 7) f.atr[i] = tr / tn / c[i] * 100;
	}
	return f;
}

// Each rule decides at the close of bar i; btc is the BTC feature set for regime filters.
const RULES = {
	'reversal: 4h drop >= 3%': (f, i) => f.r4[i] <= -0.03,
	'reversal: 4h drop >= 5%': (f, i) => f.r4[i] <= -0.05,
	'reversal: 1h flush >= 2.5%': (f, i) => f.r1[i] <= -0.025,
	'reversal: RSI14 < 25': (f, i) => f.rsi14[i] < 25,
	'reversal: Bollinger z < -2.5': (f, i) => f.bbz[i] < -2.5,
	'dip in uptrend: RSI14 < 30 & > EMA200': (f, i) => f.rsi14[i] < 30 && f.c[i] > f.ema200[i],
	'dip in uptrend: 24h < -6% & > EMA200': (f, i) => f.r24[i] <= -0.06 && f.c[i] > f.ema200[i],
	'dip in downtrend: 24h < -6% & < EMA200': (f, i) => f.r24[i] <= -0.06 && f.c[i] < f.ema200[i],
	'breakout: close > 48h high': (f, i) => f.c[i] > f.hi48[i],
	'breakout: close > 168h high': (f, i) => f.c[i] > f.hi168[i],
	'breakout 168h & BTC > EMA200': (f, i, b) => f.c[i] > f.hi168[i] && b.c[i] > b.ema200[i],
	'trend: > EMA50 > EMA200 & 24h up': (f, i) => f.c[i] > f.ema50[i] && f.ema50[i] > f.ema200[i] && f.r24[i] > 0,
	'momentum: 168h > +10% & 24h > 0': (f, i) => f.r168[i] > 0.10 && f.r24[i] > 0,
	'continuation: 24h >= +5%': (f, i) => f.r24[i] >= 0.05,
	'relative strength: 72h beats BTC by 5%': (f, i, b) => f.r72[i] - b.r72[i] > 0.05,
	'volume spike x3 & 1h > +1%': (f, i) => f.volRatio[i] > 3 && f.r1[i] > 0.01,
	'volume spike x3 & 1h < -1%': (f, i) => f.volRatio[i] > 3 && f.r1[i] < -0.01,
	'all bars (baseline)': () => true
};

// Bigger drops should be followed by bigger rebounds if the effect is real; a non-monotonic pattern points to noise.
for (let [window, thresholds] of [[1, [2.5, 4, 6]], [4, [3, 5, 7, 10]], [12, [5, 8, 12, 15]], [24, [6, 10, 15, 20]]]) {
	for (let x of thresholds) RULES[`drop ${window}h <= -${x}%`] = (f, i) => f[`r${window}`][i] <= -x / 100;
}

function mean(a) { return a.reduce((s, v) => s + v, 0) / a.length; }

// t-statistic over per-day averages, since assets move together and events on one day are not independent.
function clusteredT(events, k) {
	let days = new Map();
	for (let e of events) { if (Number.isNaN(e.fwd[k])) continue; let d = Math.floor(e.i / 24); (days.get(d) || days.set(d, []).get(d)).push(e.fwd[k]); }
	let means = [...days.values()].map(mean);
	if (means.length < 5) return NaN;
	let m = mean(means);
	let sd = Math.sqrt(means.reduce((s, v) => s + (v - m) ** 2, 0) / (means.length - 1));
	return m / (sd / Math.sqrt(means.length));
}

export function collectEvents(data, feats, rule) {
	let events = [];
	for (let asset in feats) {
		if (asset === 'BTC' && rule.skipBtc) continue;
		let f = feats[asset], b = feats.BTC;
		let last = -1e9;
		for (let i = 200; i < data.hours - 1; i++) {
			if (i - last < COOLDOWN_BARS) continue;
			if (Number.isNaN(f.c[i]) || !rule.test(f, i, b)) continue;
			last = i;
			events.push({ asset, i, fwd: HORIZONS.map(k => i + k < data.hours && !Number.isNaN(f.c[i + k]) ? (f.c[i + k] / f.c[i] - 1) * 100 : NaN) });
		}
	}
	return events;
}

async function main() {
	let args = parseArgs(process.argv.slice(2));
	let assets = [...new Set([...assetsOf(args), 'BTC'])];
	let data = loadHourly(args, assets);
	let feats = {};
	for (let asset of assets) feats[asset] = features(data.assets[asset], data.hours);
	let blockEdges = [0, Math.floor((Date.UTC(2023, 6, 1) / 1000 - data.fromSec) / 3600), Math.floor((Date.UTC(2025, 0, 1) / 1000 - data.fromSec) / 3600), data.hours].map(x => Math.max(0, x));

	console.log(`gross forward return after the signal, long only, % (mean over events; t over daily clusters); fees and spread cost about ${COST}% per round trip`);
	console.log(`assets: ${assets.join(' ')}; blocks A 2022-01..2023-06, B 2023-07..2024-12, C 2025-01..2026-10\n`);
	let header = 'rule'.padEnd(44) + 'n'.padStart(6) + HORIZONS.map(k => `${k}h`.padStart(15)).join('') + '   72h by block A/B/C';
	console.log(header);
	let table = [];
	for (let [name, test] of Object.entries(RULES)) {
		if (args.only && !name.includes(args.only) && name !== 'all bars (baseline)') continue;
		let events = collectEvents(data, feats, { test });
		let cells = HORIZONS.map((k, idx) => {
			let vals = events.map(e => e.fwd[idx]).filter(v => !Number.isNaN(v));
			return { mean: mean(vals), t: clusteredT(events, idx) };
		});
		let idx72 = HORIZONS.indexOf(72);
		let blocks = [0, 1, 2].map(b => {
			let vals = events.filter(e => e.i >= blockEdges[b] && e.i < blockEdges[b + 1]).map(e => e.fwd[idx72]).filter(v => !Number.isNaN(v));
			return vals.length ? mean(vals).toFixed(2) : 'n/a';
		});
		console.log(name.padEnd(44) + String(events.length).padStart(6) + cells.map(c => `${c.mean.toFixed(2)} (${c.t.toFixed(1)})`.padStart(15)).join('') + '   ' + blocks.join(' / '));
		table.push({ name, n: events.length, cells, blocks });
	}
	fs.mkdirSync(path.join(here, 'results'), { recursive: true });
	fs.writeFileSync(path.join(here, 'results', 'research.json'), JSON.stringify(table, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
