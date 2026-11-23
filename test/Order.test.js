import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Logger from '../src/Logger.js';
import Order from '../src/Order.js';
import { DEFAULTS } from '../src/Strategy.js';

const l = new Logger(false, false, true);
const json = body => async () => ({ body: JSON.stringify(body) });

function tickerBody(bid, ask) {
	return { error: [], result: { SOLEUR: { a: [String(ask), '1', '1.000'], b: [String(bid), '1', '1.000'], c: [String(bid), '1'], v: ['1', '1'], p: ['1', '1'], t: [1, 1], l: ['1', '1'], h: ['1', '1'], o: String(bid) } } };
}

const orderOk = { error: [], result: { txid: ['NEW1'], descr: { order: 'ok' } } };
const orderFailed = { error: ['EOrder:Insufficient funds'] };

function buyOrder(strategy = {}, pair = {}) {
	const viberBot = { canStartTrading: true, messages: [], async sendTextMessage(m) { this.messages.push(m); } };
	const order = new Order(1, 'limit', 'buy', viberBot, l, true, false, strategy);
	order.pauseMs = 0;
	order.autoTradeCurrency = { name: 'ZEUR', minBuyAmount: 125, buyPercent: 25 };
	order.balance = 500;
	order.minBalance = 20;
	order.tradeAbleAssetPairId = 'SOLEUR';
	order.tradeableAssetPairDecimals = 2;
	order.tradeableAssetPair = { lotDecimals: 8, orderMin: '0.02', costMin: '0.5', fees: [[0, 0.4]], makerFees: [[0, 0.25]], ...pair };
	return order;
}

function recorder(response) {
	const calls = [];
	return { calls, fn: async params => { calls.push(params); return { body: JSON.stringify(response) }; } };
}

describe('Order entry', () => {

	it('should place a post-only limit buy with an exchange-side stop-loss', async () => {
		const order = buyOrder();
		const add = recorder(orderOk);
		const result = await order.autoTrade('SOL', json(tickerBody(100, 100.1)), add.fn);

		assert.strictEqual(result, true);
		const params = add.calls[0];
		assert.strictEqual(params.userref, 1);
		assert.strictEqual(params.ordertype, 'limit');
		assert.strictEqual(params.type, 'buy');
		assert.strictEqual(params.price, '100.00');
		assert.strictEqual(params.volume, '1.25000000');
		assert.strictEqual(params.oflags, 'post');
		assert.strictEqual(params.expiretm, '+1800');
		assert.strictEqual(params['close[ordertype]'], 'stop-loss');
		assert.strictEqual(params['close[price]'], '97.50');
	});

	it('should cap the position so a stop-out costs at most the maximum risk', async () => {
		const order = buyOrder({ maxRiskAmount: 2 });
		const add = recorder(orderOk);
		await order.autoTrade('SOL', json(tickerBody(100, 100.1)), add.fn);

		const cost = parseFloat(add.calls[0].volume) * parseFloat(add.calls[0].price);
		const worstLoss = cost * (DEFAULTS.stopLossPercent + 0.25 + 0.4) / 100;
		assert.ok(worstLoss <= 2 + 1e-6, `worst loss ${worstLoss}`);
		assert.ok(cost < 125);
	});

	it('should round the volume down to the pair lot decimals', async () => {
		const order = buyOrder({}, { lotDecimals: 2 });
		const add = recorder(orderOk);
		await order.autoTrade('SOL', json(tickerBody(100, 100.1)), add.fn);

		assert.strictEqual(add.calls[0].volume, '1.25');
		const lowPrice = buyOrder({}, { lotDecimals: 1 });
		const lowAdd = recorder(orderOk);
		await lowPrice.autoTrade('SOL', json(tickerBody(100, 100.1)), lowAdd.fn);
		assert.strictEqual(lowAdd.calls[0].volume, '1.2');
	});

	it('should skip without placing an order when the spread is too wide', async () => {
		const order = buyOrder();
		const add = recorder(orderOk);
		const result = await order.autoTrade('SOL', json(tickerBody(100, 101)), add.fn);

		assert.strictEqual(result, null);
		assert.strictEqual(add.calls.length, 0);
	});

	it('should skip when the volume is below the pair minimum', async () => {
		const order = buyOrder({}, { orderMin: '5' });
		const add = recorder(orderOk);
		const result = await order.autoTrade('SOL', json(tickerBody(100, 100.1)), add.fn);

		assert.strictEqual(result, null);
		assert.strictEqual(add.calls.length, 0);
	});

	it('should skip when fees leave too little net reward against the risk', async () => {
		const order = buyOrder({}, { fees: [[0, 2]], makerFees: [[0, 2]] });
		const add = recorder(orderOk);
		const result = await order.autoTrade('SOL', json(tickerBody(100, 100.1)), add.fn);

		assert.strictEqual(result, null);
		assert.strictEqual(add.calls.length, 0);
	});

	it('should report failure when the exchange rejects the order', async () => {
		const order = buyOrder();
		const add = recorder(orderFailed);
		const result = await order.autoTrade('SOL', json(tickerBody(100, 100.1)), add.fn);

		assert.strictEqual(result, false);
	});

	it('should refuse entries that are not post-only limit orders', async () => {
		const order = buyOrder();
		order.orderType = 'market';
		const add = recorder(orderOk);
		const result = await order.autoTrade('SOL', json(tickerBody(100, 100.1)), add.fn);

		assert.strictEqual(result, null);
		assert.strictEqual(add.calls.length, 0);
	});

});

const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const STOP_OPEN = (ageHours = 1, refid = null) => ({ error: [], result: { open: { STOP1: {
	userref: 1,
	refid,
	vol: '1.25',
	opentm: String((NOW - ageHours * 3600000) / 1000),
	descr: { pair: 'SOLEUR', type: 'sell', ordertype: 'stop-loss', price: '97.50', order: 'sell 1.25 SOLEUR @ stop loss 97.50' }
} } } });

const NO_OPEN = { error: [], result: { open: {} } };
const SELL_FILLED = { status: 'closed', vol_exec: '1.25', price: '105.1', fee: '0.5' };
const PAIRS = { error: [], result: { SOLEUR: { altname: 'SOLEUR', base: 'SOL' } } };

function requests({ open = STOP_OPEN(), bid = 101, cancel = { error: [], result: { count: 1 } }, adds = [orderOk], orders = { NEW1: SELL_FILLED }, balance = { error: [], result: { SOL: '1.25' } } } = {}) {
	const calls = { cancel: [], add: [] };
	return {
		calls,
		getOpenOrders: json(open),
		getTicker: json(tickerBody(bid, bid + 0.1)),
		cancelOrder: async params => { calls.cancel.push(params); return { body: JSON.stringify(cancel) }; },
		addOrder: async params => { calls.add.push(params); return { body: JSON.stringify(adds.shift()) }; },
		queryOrders: async params => ({ body: JSON.stringify({ error: [], result: params.txid in orders ? { [params.txid]: orders[params.txid] } : {} }) }),
		getBalance: json(balance),
		getTradeableAssetPairs: json(PAIRS),
		pauseMs: 0
	};
}

const trackedPosition = () => ({ pair: 'SOLEUR', volumeText: '1.25', volume: 1.25, stopPriceText: '97.50', stopPrice: 97.5, entryPrice: 100, entryFee: 0.3125, entryActual: true, entryFeeActual: true, openedAtMs: NOW - 3600000 });

describe('Order position management', () => {

	it('should leave a position alone between its stop and target', async () => {
		const req = requests({ bid: 101 });
		const result = await Order.managePositions({}, DEFAULTS, req, l, NOW);

		assert.strictEqual(req.calls.cancel.length, 0);
		assert.strictEqual(result.journal.length, 0);
		assert.deepStrictEqual(Object.keys(result.known), ['STOP1']);
	});

	it('should sell at market when the target is reached and journal the confirmed fill', async () => {
		const req = requests({ bid: 105.2 });
		const result = await Order.managePositions({}, DEFAULTS, req, l, NOW);

		assert.deepStrictEqual(req.calls.cancel, [{ txid: 'STOP1' }]);
		assert.strictEqual(req.calls.add[0].ordertype, 'market');
		assert.strictEqual(req.calls.add[0].type, 'sell');
		assert.strictEqual(req.calls.add[0].volume, '1.25');
		assert.strictEqual(req.calls.add[0].userref, 2);
		assert.strictEqual(result.journal[0].reason, 'target');
		assert.strictEqual(result.journal[0].exitPrice, 105.1);
		assert.ok(Math.abs(result.journal[0].netPnl - 5.5625) < 1e-6);
		assert.deepStrictEqual(result.known, {});
	});

	it('should take the cost basis from the actual entry fill', async () => {
		const req = requests({ open: STOP_OPEN(1, 'ENTRY1'), orders: { ENTRY1: { status: 'closed', vol_exec: '1.25', price: '99.9', fee: '0.3' } } });
		const result = await Order.managePositions({}, DEFAULTS, req, l, NOW);

		assert.strictEqual(result.known.STOP1.entryPrice, 99.9);
		assert.strictEqual(result.known.STOP1.entryActual, true);
		assert.ok(Math.abs(result.known.STOP1.entryFee - 0.3) < 1e-9);
	});

	it('should fall back to a derived entry price when the entry order is unknown', async () => {
		const result = await Order.managePositions({}, DEFAULTS, requests({ open: STOP_OPEN(1, 'GONE') }), l, NOW);

		assert.ok(Math.abs(result.known.STOP1.entryPrice - 100) < 1e-9);
		assert.strictEqual(result.known.STOP1.entryActual, false);
	});

	it('should keep a position tracked until the exit order is confirmed filled', async () => {
		const pending = requests({ bid: 105.2, orders: { NEW1: { status: 'open', vol_exec: '0', price: '0', fee: '0' } } });
		const first = await Order.managePositions({}, DEFAULTS, pending, l, NOW);

		assert.strictEqual(first.journal.length, 0);
		assert.strictEqual(first.known.STOP1.exitTxid, 'NEW1');

		const filled = requests({ open: NO_OPEN, orders: { NEW1: SELL_FILLED } });
		const second = await Order.managePositions(first.known, DEFAULTS, filled, l, NOW);

		assert.strictEqual(second.journal.length, 1);
		assert.strictEqual(second.journal[0].reason, 'target');
		assert.deepStrictEqual(second.known, {});
	});

	it('should re-protect the unsold part after a partial exit fill', async () => {
		const req = requests({
			bid: 105.2,
			adds: [orderOk, { error: [], result: { txid: ['NEW2'], descr: { order: 'stop' } } }],
			orders: { NEW1: { status: 'closed', vol_exec: '1.00', price: '105.1', fee: '0.4' } }
		});
		const result = await Order.managePositions({}, DEFAULTS, req, l, NOW);

		assert.strictEqual(result.journal.length, 1);
		assert.strictEqual(result.journal[0].volume, 1);
		assert.strictEqual(req.calls.add[1].ordertype, 'stop-loss');
		assert.strictEqual(req.calls.add[1].volume, '0.25');
		assert.deepStrictEqual(Object.keys(result.known), ['NEW2']);
		assert.strictEqual(result.known.NEW2.volume, 0.25);
	});

	it('should exit a position that has been held past the time limit', async () => {
		const req = requests({ open: STOP_OPEN(49), bid: 100.5 });
		const result = await Order.managePositions({}, DEFAULTS, req, l, NOW);

		assert.strictEqual(result.journal[0].reason, 'time');
		assert.strictEqual(req.calls.add[0].ordertype, 'market');
	});

	it('should restore the stop when the market sell fails', async () => {
		const req = requests({ bid: 105.2, adds: [orderFailed, orderOk] });
		const result = await Order.managePositions({}, DEFAULTS, req, l, NOW);

		assert.strictEqual(req.calls.add[1].ordertype, 'stop-loss');
		assert.strictEqual(req.calls.add[1].price, '97.50');
		assert.strictEqual(req.calls.add[1].userref, 1);
		assert.strictEqual(result.journal.length, 0);
		assert.deepStrictEqual(Object.keys(result.known), ['NEW1']);
	});

	it('should keep the position flagged when the stop cannot be restored', async () => {
		const req = requests({ bid: 105.2, adds: [orderFailed, orderFailed] });
		const result = await Order.managePositions({}, DEFAULTS, req, l, NOW);

		assert.deepStrictEqual(Object.keys(result.known), ['STOP1']);
		assert.strictEqual(result.known.STOP1.unprotected, true);
	});

	it('should not sell when the stop cannot be cancelled', async () => {
		const req = requests({ bid: 105.2, cancel: { error: ['EOrder:Unknown order'] } });
		const result = await Order.managePositions({}, DEFAULTS, req, l, NOW);

		assert.strictEqual(req.calls.add.length, 0);
		assert.strictEqual(result.journal.length, 0);
		assert.deepStrictEqual(Object.keys(result.known), ['STOP1']);
	});

	it('should journal a triggered stop as a loss using the actual fill', async () => {
		const req = requests({ open: NO_OPEN, orders: { STOP1: { status: 'closed', vol_exec: '1.25', price: '97.4', fee: '0.5' } } });
		const result = await Order.managePositions({ STOP1: trackedPosition() }, DEFAULTS, req, l, NOW);

		assert.strictEqual(result.journal[0].reason, 'stop-loss');
		assert.strictEqual(result.journal[0].exitPrice, 97.4);
		assert.strictEqual(result.journal[0].estimated, false);
		assert.ok(Math.abs(result.journal[0].netPnl - -4.0625) < 1e-9);
		assert.deepStrictEqual(result.known, {});
	});

	it('should keep a vanished stop tracked when its fate cannot be confirmed', async () => {
		const req = requests({ open: NO_OPEN, orders: {} });
		const result = await Order.managePositions({ STOP1: trackedPosition() }, DEFAULTS, req, l, NOW);

		assert.strictEqual(result.journal.length, 0);
		assert.deepStrictEqual(Object.keys(result.known), ['STOP1']);
	});

	it('should restore protection when a stop was cancelled outside the bot but the coins are still held', async () => {
		const req = requests({ open: NO_OPEN, orders: { STOP1: { status: 'canceled' } } });
		const result = await Order.managePositions({ STOP1: trackedPosition() }, DEFAULTS, req, l, NOW);

		assert.strictEqual(req.calls.add[0].ordertype, 'stop-loss');
		assert.strictEqual(req.calls.add[0].volume, '1.25');
		assert.strictEqual(result.journal.length, 0);
		assert.deepStrictEqual(Object.keys(result.known), ['NEW1']);
	});

	it('should treat a cancelled stop with no balance left as a manual exit', async () => {
		const req = requests({ open: NO_OPEN, orders: { STOP1: { status: 'canceled' } }, balance: { error: [], result: { SOL: '0' } } });
		const result = await Order.managePositions({ STOP1: trackedPosition() }, DEFAULTS, req, l, NOW);

		assert.strictEqual(req.calls.add.length, 0);
		assert.strictEqual(result.journal[0].netPnl, 0);
		assert.ok(result.journal[0].reason.includes('assumed closed manually'));
		assert.deepStrictEqual(result.known, {});
	});

	it('should keep a cancelled stop tracked when the balance cannot be verified', async () => {
		const req = requests({ open: NO_OPEN, orders: { STOP1: { status: 'canceled' } }, balance: { error: ['EAPI:Rate limit exceeded'] } });
		const result = await Order.managePositions({ STOP1: trackedPosition() }, DEFAULTS, req, l, NOW);

		assert.strictEqual(req.calls.add.length, 0);
		assert.strictEqual(result.journal.length, 0);
		assert.deepStrictEqual(Object.keys(result.known), ['STOP1']);
	});

	it('should keep tracked positions untouched when open orders cannot be fetched', async () => {
		const req = requests({ open: { error: ['EAPI:Invalid key'] } });
		const known = { STOP1: trackedPosition() };
		const result = await Order.managePositions(known, DEFAULTS, req, l, NOW);

		assert.strictEqual(result.known, known);
		assert.strictEqual(result.journal.length, 0);
	});

});

describe('Order risk limits', () => {

	const file = path.join(os.tmpdir(), `dalgon-history-${process.pid}.txt`);
	const at = (day, hour) => new Date(2026, 10, day, hour).toISOString();
	const entry = (closedAt, netPnl) => JSON.stringify({ closedAt, netPnl }) + '\n';
	const now = new Date(2026, 10, 25, 12);

	afterEach(() => { fs.rmSync(file, { force: true }); });

	it('should allow trading within the daily and weekly loss limits', () => {
		fs.writeFileSync(file, entry(at(25, 8), -6) + entry(at(24, 10), -5) + entry(at(22, 10), -100));
		const status = Order.lossLimitStatus(file, DEFAULTS, now);

		assert.strictEqual(status.dayPnl, -6);
		assert.strictEqual(status.weekPnl, -11);
		assert.strictEqual(status.blocked, false);
	});

	it('should block trading once the daily loss limit is reached', () => {
		fs.writeFileSync(file, entry(at(25, 8), -6) + entry(at(25, 9), -4.5));
		const status = Order.lossLimitStatus(file, DEFAULTS, now);

		assert.strictEqual(status.blocked, true);
		assert.ok(status.reason.includes('daily'));
	});

	it('should block trading once the weekly loss limit is reached', () => {
		fs.writeFileSync(file, entry(at(23, 10), -9) + entry(at(24, 10), -9) + entry(at(25, 8), -3));
		const status = Order.lossLimitStatus(file, DEFAULTS, now);

		assert.strictEqual(status.blocked, true);
		assert.ok(status.reason.includes('weekly'));
	});

	it('should ignore a missing history file and unreadable lines', () => {
		assert.strictEqual(Order.lossLimitStatus(file, DEFAULTS, now).blocked, false);
		fs.writeFileSync(file, 'not json\n' + entry(at(25, 8), -1));
		assert.strictEqual(Order.lossLimitStatus(file, DEFAULTS, now).dayPnl, -1);
	});

	it('should count pending entries and stops as open positions', () => {
		const open = { result: { open: { A: { userref: 1 }, B: { userref: 1 }, C: { userref: 2 }, D: { userref: 0 } } } };

		assert.strictEqual(Order.countOpenPositions(open), 2);
		assert.strictEqual(Order.countOpenPositions({ result: { open: {} } }), 0);
		assert.strictEqual(Order.countOpenPositions(null), 0);
	});

	it('should write the positions file atomically and read it back', () => {
		const positions = { STOP1: { pair: 'SOLEUR', volume: 1.25 } };
		Order.writePositions(file, positions);

		assert.deepStrictEqual(Order.readPositions(file, l), positions);
		assert.strictEqual(fs.existsSync(`${file}.tmp`), false);
		assert.deepStrictEqual(Order.readPositions(`${file}.missing`, l), {});
	});

});
