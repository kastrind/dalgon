import assert from 'assert';
import Logger from '../src/Logger.js';
import OHLC from '../src/OHLC.js';
import Tick from '../src/Tick.js';

const l = new Logger(false, false, true);

function ohlcOf(ticks, intervalMinutes) {
	const ohlc = new OHLC('X', l, false, null);
	ohlc.setTicks(ticks);
	ohlc.intervalMinutes = intervalMinutes;
	return ohlc;
}

const tick = (time, close, vol = 10) => new Tick(time, close, close, close, close, close, vol, 1);

describe('OHLC robustness', () => {

	it('should return a MACD at offset k equal to the MACD of the series without its last k candles', () => {
		let seed = 7;
		const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		let price = 100;
		const ticks = Array.from({ length: 120 }, (_, i) => tick(1700000000 + i * 3600, price *= 1 + (rnd() - 0.5) * 0.02));
		const full = ohlcOf(ticks, 60);

		for (const offset of [1, 2, 5]) {
			const trimmed = ohlcOf(ticks.slice(0, ticks.length - offset), 60);
			assert.ok(Math.abs(full.getMACD(12, 26, 9, null, offset) - trimmed.getMACD(12, 26, 9, null, 0)) < 1e-12);
		}
	});

	it('should average a single candle and an empty series without throwing', () => {
		assert.strictEqual(ohlcOf([tick(1, 5, 3)], 1).getAverage(), 5);
		assert.strictEqual(ohlcOf([tick(1, 5, 3)], 1).getAverageVol(), 3);
		assert.ok(Number.isNaN(ohlcOf([], 1).getAverage()));
	});

	it('should return zero for the change and derivative when they are undefined', () => {
		assert.strictEqual(ohlcOf([tick(1, 0), tick(2, 5)], 1).getChange(), 0);
		assert.strictEqual(ohlcOf([tick(1, 5)], 1).getDerivative(), 0);
	});

	it('should window by time even when candles are missing', () => {
		const ticks = [tick(0, 1), tick(60, 2), tick(7200, 3), tick(10800, 4)];

		assert.deepStrictEqual(ohlcOf(ticks, 1).getTicksSince(10800).map(t => t.time), [60, 7200, 10800]);
		assert.deepStrictEqual(ohlcOf(ticks, 1).getTicksSince(3600).map(t => t.time), [10800]);
	});

	it('should sample closes at exact day offsets and skip days without data', () => {
		const day = 86400;
		const ticks = [tick(0, 1), tick(day, 2), tick(3 * day, 4), tick(4 * day, 5)];

		assert.deepStrictEqual(ohlcOf(ticks, 60).getClosesDaysBack(3).map(c => c.close), [2, 2, 4]);
	});

	it('should drop the still-forming candle and keep closed ones', () => {
		const now = Math.floor(Date.now() / 1000);
		const ticks = [tick(now - 7200, 1), tick(now - 3600, 2), tick(now - 60, 3)];

		assert.deepStrictEqual(ohlcOf(ticks, 60).getClosed().getTicks().map(t => t.close), [1, 2]);
	});

	it('should treat a failed or too short OHLC response as no data', async () => {
		const rows = n => Array.from({ length: n }, (_, i) => [1700000000 + i * 60, '1', '1', '1', '1', '1', '1', 1]);
		const reply = n => async () => ({ body: JSON.stringify({ error: [], result: { XXBTZEUR: rows(n), last: 1 } }) });

		assert.strictEqual(await OHLC.requestInterval(reply(2), 'BTCEUR', 1, 60, l), null);
		assert.strictEqual((await OHLC.requestInterval(reply(5), 'BTCEUR', 1, 60, l)).intervalMinutes, 1);
		assert.strictEqual(await OHLC.requestInterval(async () => undefined, 'BTCEUR', 1, 60, l), null);
		assert.strictEqual(await OHLC.requestInterval(async () => ({ body: 'not json' }), 'BTCEUR', 1, 60, l), null);
	});

});
