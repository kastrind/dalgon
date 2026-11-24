import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Columns of a cached 1m candle row: time (s), open, high, low, close, volume, quote volume, trade count.
const COLS = 8;
const BASE_URL = 'https://data.binance.vision/data/spot/monthly/klines';

export function listMonths(from, to) {
	let [y, m] = from.split('-').map(Number);
	let [ty, tm] = to.split('-').map(Number);
	let months = [];
	while (y < ty || (y === ty && m <= tm)) {
		months.push(`${y}-${String(m).padStart(2, '0')}`);
		if (++m > 12) { m = 1; y++; }
	}
	return months;
}

export function monthStartSec(month) {
	let [y, m] = month.split('-').map(Number);
	return Date.UTC(y, m - 1, 1) / 1000;
}

export function monthFile(dir, pair, month) {
	return path.join(dir, `${pair}-1m-${month}.bin`);
}

// Binance switched spot timestamps from milliseconds to microseconds in 2025.
function toSeconds(value) {
	return value > 1e14 ? Math.floor(value / 1e6) : Math.floor(value / 1e3);
}

function parseCsv(csv) {
	let lines = csv.split('\n').filter(line => line.length > 0);
	let rows = new Float64Array(lines.length * COLS);
	for (let i = 0; i < lines.length; i++) {
		let f = lines[i].split(',');
		let o = i * COLS;
		rows[o] = toSeconds(Number(f[0]));
		rows[o + 1] = Number(f[1]);
		rows[o + 2] = Number(f[2]);
		rows[o + 3] = Number(f[3]);
		rows[o + 4] = Number(f[4]);
		rows[o + 5] = Number(f[5]);
		rows[o + 6] = Number(f[7]);
		rows[o + 7] = Number(f[8]);
	}
	return rows;
}

async function downloadMonth(dir, pair, month) {
	let file = monthFile(dir, pair, month);
	if (fs.existsSync(file)) return 'cached';
	let url = `${BASE_URL}/${pair}/1m/${pair}-1m-${month}.zip`;
	let response = await fetch(url);
	if (response.status === 404) return 'missing';
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	let zipPath = `${file}.zip.tmp`;
	fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
	try {
		let csv = execFileSync('unzip', ['-p', zipPath], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
		let rows = parseCsv(csv);
		fs.writeFileSync(`${file}.tmp`, Buffer.from(rows.buffer));
		fs.renameSync(`${file}.tmp`, file);
	} finally {
		fs.rmSync(zipPath, { force: true });
	}
	return 'downloaded';
}

export async function downloadAll({ dir, pairs, from, to, concurrency = 4, log = console.log }) {
	fs.mkdirSync(dir, { recursive: true });
	let jobs = [];
	for (let pair of pairs) for (let month of listMonths(from, to)) jobs.push({ pair, month });
	let counts = { cached: 0, downloaded: 0, missing: 0 };
	let next = 0;
	let worker = async () => {
		while (next < jobs.length) {
			let job = jobs[next++];
			let result;
			for (let attempt = 1; ; attempt++) {
				try { result = await downloadMonth(dir, job.pair, job.month); break; }
				catch (error) {
					if (attempt === 3) throw error;
					await new Promise(r => setTimeout(r, 1000 * attempt));
				}
			}
			counts[result]++;
			if (result === 'missing') log(`missing: ${job.pair} ${job.month}`);
		}
	};
	await Promise.all(Array.from({ length: concurrency }, worker));
	log(`data ready: ${counts.downloaded} downloaded, ${counts.cached} cached, ${counts.missing} missing`);
}

// Loads the 1m candles with fromSec <= time < toSec as column arrays.
export function loadSeries(dir, pair, fromSec, toSec) {
	let first = new Date(fromSec * 1000);
	let last = new Date((toSec - 1) * 1000);
	let months = listMonths(`${first.getUTCFullYear()}-${first.getUTCMonth() + 1}`, `${last.getUTCFullYear()}-${last.getUTCMonth() + 1}`);
	let chunks = [];
	let total = 0;
	for (let month of months) {
		let file = monthFile(dir, pair, month);
		if (!fs.existsSync(file)) continue;
		let buf = fs.readFileSync(file);
		let rows = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8);
		chunks.push(rows);
		total += rows.length / COLS;
	}
	let series = { n: 0, t: new Float64Array(total), o: new Float64Array(total), h: new Float64Array(total), l: new Float64Array(total), c: new Float64Array(total), v: new Float64Array(total), q: new Float64Array(total), k: new Float64Array(total) };
	let n = 0;
	for (let rows of chunks) {
		for (let i = 0; i < rows.length; i += COLS) {
			let t = rows[i];
			if (t < fromSec || t >= toSec) continue;
			series.t[n] = t; series.o[n] = rows[i + 1]; series.h[n] = rows[i + 2]; series.l[n] = rows[i + 3];
			series.c[n] = rows[i + 4]; series.v[n] = rows[i + 5]; series.q[n] = rows[i + 6]; series.k[n] = rows[i + 7];
			n++;
		}
	}
	series.n = n;
	return series;
}
