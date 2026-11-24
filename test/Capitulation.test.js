import assert from 'assert';
import Analysis from '../src/Analysis.js';
import { loadStrategy } from '../src/Strategy.js';

const silent = { i: () => '', d: () => '', w: () => '', suc: () => '', err: () => '', l: () => '' };
const START = Date.UTC(2024, 0, 1) / 1000;

// 15m candles ending in a price that is `finalFactor` times the price a day earlier.
function candles(count, startPrice, finalFactor) {
	return Array.from({ length: count }, (_, i) => {
		let close = startPrice * (1 + (finalFactor - 1) * (i >= count - 4 ? 1 : 0));
		return [START + i * 900, close, close, close, close, close, 10, 1];
	});
}

function exchange(byPair) {
	return async ({ searchParams: { pair } }) => ({ body: JSON.stringify({ error: [], result: byPair[pair] ? { [pair]: byPair[pair] } : {} }) });
}

function build(strategy = {}) {
	let analysis = new Analysis(['XRP', 'ADA'], 720, 'USDC', silent, false, { signalMode: 'capitulation', ...strategy });
	analysis.sleepMillis = 0;
	return analysis;
}

describe('Capitulation signal', () => {

	it('should recommend a coin that fell at least the configured percent over the window', async () => {
		let result = await build().recommend(exchange({ XRPUSDC: candles(110, 1, 0.8), ADAUSDC: candles(110, 1, 0.95) }), '/dev/null');
		assert.deepStrictEqual(result.map(c => c.name), ['XRP']);
		assert.ok(result[0].candidateGrade > 1);
		assert.ok(Math.abs(result[0].changeDay24h + 0.2) < 1e-9);
		assert.strictEqual(result[0].latestClosingPrice, 0.8);
	});

	it('should rank the deeper drop first', async () => {
		let result = await build().recommend(exchange({ XRPUSDC: candles(110, 1, 0.84), ADAUSDC: candles(110, 1, 0.7) }), '/dev/null');
		assert.deepStrictEqual(result.map(c => c.name), ['ADA', 'XRP']);
	});

	it('should not recommend drops smaller than the threshold', async () => {
		let result = await build({ capitulationDropPercent: 25 }).recommend(exchange({ XRPUSDC: candles(110, 1, 0.8), ADAUSDC: candles(110, 1, 1.2) }), '/dev/null');
		assert.deepStrictEqual(result, []);
	});

	it('should measure the window by time, not by candle count', async () => {
		// 30 candles cover under 8 hours, so a 24h change cannot be measured yet.
		let result = await build().recommend(exchange({ XRPUSDC: candles(30, 1, 0.5) }), '/dev/null');
		assert.deepStrictEqual(result, []);
	});

	it('should skip a pair without data and still evaluate the others', async () => {
		let result = await build().recommend(exchange({ ADAUSDC: candles(110, 1, 0.8) }), '/dev/null');
		assert.deepStrictEqual(result.map(c => c.name), ['ADA']);
	});

	it('should report an unknown on-demand asset', async () => {
		let analysis = new Analysis(['XRP'], 720, 'USDC', { ...silent, err: message => message }, false, { signalMode: 'capitulation' });
		assert.deepStrictEqual(await analysis.recommend(exchange({}), '/dev/null', 'DOGE'), []);
		assert.ok(analysis.report.includes('NOT FOUND'));
	});

	it('should read the mode and thresholds from the strategy configuration', () => {
		let properties = { get: key => ({ 'strategy.SIGNAL_MODE': 'capitulation', 'strategy.CAPITULATION_DROP_PERCENT': 18 })[key] ?? null };
		let strategy = loadStrategy(properties);
		assert.strictEqual(strategy.signalMode, 'capitulation');
		assert.strictEqual(strategy.capitulationDropPercent, 18);
		assert.strictEqual(strategy.capitulationWindowHours, 24);
		assert.throws(() => loadStrategy({ get: key => key === 'strategy.SIGNAL_MODE' ? 'other' : null }), /signalMode/);
	});
});
