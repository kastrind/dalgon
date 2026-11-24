import { DEFAULTS, netEconomics } from '../src/Strategy.js';

export const SIM_DEFAULTS = {
	...DEFAULTS,
	gradeThreshold: 0.99,
	startBalance: 500,
	minBuyAmount: 125,
	buyPercent: 25,
	minBalance: 20,
	// Execution assumptions; kept pessimistic because the exchange cannot be replayed.
	halfSpreadPercent: 0.05,
	stopSlipPercent: 0.1,
	// 'close': the bot polls every 90s, so a target only counts once a 1m candle closes at or above it. 'high' is optimistic.
	targetTrigger: 'close',
	// Multipliers of takeProfitPercent spread evenly over maxHoldHours: the target steps down as the position ages.
	targetDecay: [1],
	minTargetPercent: 1.5
};

function lowerBound(array, value, n = array.length) {
	let lo = 0, hi = n;
	while (lo < hi) {
		let mid = (lo + hi) >> 1;
		if (array[mid] < value) lo = mid + 1; else hi = mid;
	}
	return lo;
}

function dayStartSec(t) {
	return Math.floor(t / 86400) * 86400;
}

// Weeks start on Monday, like the live loss limits (1970-01-01 was a Thursday).
function weekStartSec(t) {
	let day = Math.floor(t / 86400);
	return (day - ((day + 3) % 7)) * 86400;
}

function pnlSince(trades, sinceSec) {
	let total = 0;
	for (let i = trades.length - 1; i >= 0 && trades[i].exitT >= sinceSec; i--) total += trades[i].pnl;
	return total;
}

// Walks one entry order through the 1m candles that follow the decision; returns null when the post-only bid never fills.
function runTrade(series, decisionT, candidate, balance, p) {
	let h = p.halfSpreadPercent / 100;
	let entry = candidate.p * (1 - h) * (1 - p.entryOffsetPercent / 100);
	let start = lowerBound(series.t, decisionT, series.n);
	let deadline = decisionT + p.entryTimeoutSeconds;

	let fill = -1;
	for (let i = start; i < series.n && series.t[i] < deadline; i++) {
		if (series.l[i] < entry) { fill = i; break; }
	}
	if (fill < 0) return { filled: false, until: deadline };

	let fees = { maker: p.makerFeePercent, taker: p.takerFeePercent };
	let economics = netEconomics(p, fees.maker, fees.taker);
	let requested = Math.max(p.minBuyAmount, balance * p.buyPercent / 100);
	let cost = Math.min(requested, p.maxRiskAmount / (economics.netRiskPercent / 100), balance - p.minBalance);
	let volume = cost / entry;
	cost = volume * entry;

	let stop = entry * (1 - p.stopLossPercent / 100);
	let target = entry * (1 + p.takeProfitPercent / 100);
	let fillT = series.t[fill];
	let timeLimit = fillT + p.maxHoldHours * 3600;

	let exitIndex = series.n - 1, exitPrice = series.c[series.n - 1] * (1 - h), reason = 'data-end';
	let holdSec = p.maxHoldHours * 3600;
	for (let j = fill; j < series.n; j++) {
		if (series.l[j] <= stop) { exitIndex = j; exitPrice = (series.o[j] < stop ? series.o[j] : stop) * (1 - p.stopSlipPercent / 100); reason = 'stop'; break; }
		let stage = Math.min(p.targetDecay.length - 1, Math.floor((series.t[j] - fillT) / holdSec * p.targetDecay.length));
		let stageTarget = entry * (1 + Math.max(p.minTargetPercent, p.takeProfitPercent * p.targetDecay[stage]) / 100);
		if (p.targetDecay.length === 1) stageTarget = target;
		let reached = p.targetTrigger === 'high' ? series.h[j] >= stageTarget : series.c[j] >= stageTarget;
		if (reached) { exitIndex = j; exitPrice = (p.targetTrigger === 'high' ? stageTarget : series.c[j]) * (1 - h); reason = 'target'; break; }
		if (series.t[j] >= timeLimit) { exitIndex = j; exitPrice = series.c[j] * (1 - h); reason = 'time'; break; }
	}
	let proceeds = volume * exitPrice;
	let pnl = proceeds - proceeds * fees.taker / 100 - cost - cost * fees.maker / 100;
	return {
		filled: true,
		trade: {
			asset: candidate.n, grade: candidate.g, decisionT, fillT, exitT: series.t[exitIndex] + 60,
			entry, exit: exitPrice, cost, pnl, pct: pnl / cost * 100, reason, hours: (series.t[exitIndex] - fillT) / 3600
		}
	};
}

// Replays the candidates the real Analysis produced; steps are sorted by time and exec maps a pair to its 1m series.
export function simulate(steps, exec, quote, overrides = {}) {
	let p = { ...SIM_DEFAULTS, ...overrides };
	let economics = netEconomics(p, p.makerFeePercent, p.takerFeePercent);
	let trades = [];
	let balance = p.startBalance;
	let busyUntil = 0;
	let stats = { unfilledEntries: 0, blockedByLossLimit: 0, blockedByBtc: 0, blockedByFilters: 0, belowThreshold: 0 };
	if (economics.rewardRisk < p.minNetRewardRisk) return { trades, balance, stats, economics, rejected: true };

	for (let step of steps) {
		if (step.t < busyUntil) continue;
		let day = pnlSince(trades, dayStartSec(step.t));
		let week = pnlSince(trades, weekStartSec(step.t));
		if (day <= -p.dailyMaxLoss || week <= -p.weeklyMaxLoss) { stats.blockedByLossLimit++; continue; }
		if (step.btc24h !== null && step.btc24h <= -p.btcMaxDropPercent / 100) { stats.blockedByBtc++; continue; }

		let candidates = step.c.filter(c => {
			if (c.g < p.gradeThreshold) { stats.belowThreshold++; return false; }
			let surged = c.d24 * 100 >= p.maxSurgePercent;
			let tooVolatile = p.atrStopMultiple > 0 && c.atr !== null && c.atr > p.stopLossPercent / p.atrStopMultiple;
			if (surged || tooVolatile) { stats.blockedByFilters++; return false; }
			return true;
		}).sort((a, b) => b.g - a.g);
		if (!candidates.length) continue;

		let requested = Math.max(p.minBuyAmount, balance * p.buyPercent / 100);
		if (balance < requested || balance - requested < p.minBalance) continue;

		let candidate = candidates[0];
		let series = exec[`${candidate.n}${quote}`];
		if (!series) continue;
		let result = runTrade(series, step.t, candidate, balance, p);
		if (!result.filled) { stats.unfilledEntries++; busyUntil = result.until; continue; }
		trades.push(result.trade);
		balance += result.trade.pnl;
		busyUntil = result.trade.exitT;
	}
	return { trades, balance, stats, economics, params: p };
}

function groupSum(trades, keyOf) {
	let groups = {};
	for (let trade of trades) {
		let key = keyOf(trade);
		groups[key] = groups[key] || { trades: 0, pnl: 0, wins: 0 };
		groups[key].trades++; groups[key].pnl += trade.pnl; if (trade.pnl > 0) groups[key].wins++;
	}
	return groups;
}

export function summarize(result, startBalance = SIM_DEFAULTS.startBalance) {
	let trades = result.trades;
	let wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0);
	let sum = list => list.reduce((s, t) => s + t.pnl, 0);
	let grossWin = sum(wins), grossLoss = -sum(losses);
	let equity = startBalance, peak = startBalance, maxDrawdown = 0;
	for (let trade of trades) {
		equity += trade.pnl;
		peak = Math.max(peak, equity);
		maxDrawdown = Math.max(maxDrawdown, peak - equity);
	}
	let pcts = trades.map(t => t.pct);
	let mean = pcts.length ? pcts.reduce((s, v) => s + v, 0) / pcts.length : 0;
	let variance = pcts.length > 1 ? pcts.reduce((s, v) => s + (v - mean) ** 2, 0) / (pcts.length - 1) : 0;
	let stdErr = pcts.length > 1 ? Math.sqrt(variance / pcts.length) : NaN;
	return {
		trades: trades.length,
		winRate: trades.length ? wins.length / trades.length : 0,
		netPnl: sum(trades),
		returnPercent: sum(trades) / startBalance * 100,
		profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
		avgWin: wins.length ? grossWin / wins.length : 0,
		avgLoss: losses.length ? -grossLoss / losses.length : 0,
		expectancyPercent: mean,
		expectancyStdErrPercent: stdErr,
		maxDrawdown,
		avgHours: trades.length ? trades.reduce((s, t) => s + t.hours, 0) / trades.length : 0,
		byReason: groupSum(trades, t => t.reason),
		byAsset: groupSum(trades, t => t.asset),
		byMonth: groupSum(trades, t => new Date(t.exitT * 1000).toISOString().slice(0, 7)),
		byYear: groupSum(trades, t => new Date(t.exitT * 1000).toISOString().slice(0, 4)),
		stats: result.stats,
		economics: result.economics
	};
}
