import { loadSeries } from './data.js';

export const INTERVALS = [1, 5, 15, 60, 240, 1440];

function aggregate(series, minutes) {
	let width = minutes * 60;
	let b = { start: [], first: [], last: [], o: [], h: [], l: [], c: [], v: [], q: [], k: [] };
	let current = -1;
	for (let i = 0; i < series.n; i++) {
		let bucket = Math.floor(series.t[i] / width);
		if (bucket !== current) {
			current = bucket;
			b.start.push(bucket * width); b.first.push(i); b.last.push(i);
			b.o.push(series.o[i]); b.h.push(series.h[i]); b.l.push(series.l[i]); b.c.push(series.c[i]);
			b.v.push(series.v[i]); b.q.push(series.q[i]); b.k.push(series.k[i]);
		} else {
			let j = b.start.length - 1;
			b.last[j] = i;
			if (series.h[i] > b.h[j]) b.h[j] = series.h[i];
			if (series.l[i] < b.l[j]) b.l[j] = series.l[i];
			b.c[j] = series.c[i];
			b.v[j] += series.v[i]; b.q[j] += series.q[i]; b.k[j] += series.k[i];
		}
	}
	return b;
}

function lowerBound(array, value) {
	let lo = 0, hi = array.length;
	while (lo < hi) {
		let mid = (lo + hi) >> 1;
		if (array[mid] < value) lo = mid + 1; else hi = mid;
	}
	return lo;
}

// Serves Kraken-shaped OHLC rows as they would have looked at a past moment: no candle includes data from that moment on.
export class Market {

	constructor(dir, pairs, fromSec, toSec) {
		this.series = {};
		this.frames = {};
		for (let pair of pairs) {
			this.series[pair] = loadSeries(dir, pair, fromSec, toSec);
			this.frames[pair] = {};
			for (let minutes of INTERVALS) this.frames[pair][minutes] = aggregate(this.series[pair], minutes);
		}
	}

	// Number of 1m candles that were complete before the given time.
	rowsBefore(pair, timeSec) {
		return lowerBound(this.series[pair].t, timeSec);
	}

	ohlcRows(pair, minutes, timeSec, count) {
		let s = this.series[pair];
		let idx = this.rowsBefore(pair, timeSec);
		if (idx === 0) return [];
		let f = this.frames[pair][minutes];
		let latest = lowerBound(f.start, s.t[idx - 1] + 1) - 1;
		let from = Math.max(0, latest - count + 1);
		let rows = [];
		for (let j = from; j <= latest; j++) {
			let o = f.o[j], h = f.h[j], l = f.l[j], c = f.c[j], v = f.v[j], q = f.q[j], k = f.k[j];
			if (j === latest && f.last[j] > idx - 1) {
				// The candle is still forming at the requested time.
				c = s.c[idx - 1]; h = s.h[f.first[j]]; l = s.l[f.first[j]]; v = 0; q = 0; k = 0;
				for (let i = f.first[j]; i < idx; i++) {
					if (s.h[i] > h) h = s.h[i];
					if (s.l[i] < l) l = s.l[i];
					v += s.v[i]; q += s.q[i]; k += s.k[i];
				}
			}
			rows.push([f.start[j], o, h, l, c, v > 0 ? q / v : c, v, k]);
		}
		return rows;
	}

	// Drop-in for the Kraken OHLC request used by Analysis, answering as of the simulated time.
	getOHLC(timeSec) {
		return async ({ searchParams: { pair, since, interval } }) => {
			let count = Math.max(1, Math.round((timeSec - since) / (interval * 60)));
			return { body: JSON.stringify({ error: [], result: { [pair]: this.ohlcRows(pair, interval, timeSec, count) } }) };
		};
	}
}
