// Percent values are in percent (2.5 = 2.5%); amounts are in the quote currency.
const DEFAULTS = {
	maxSurgePercent: 10,
	atrStopMultiple: 1.5,
	minDailyQuoteVolume: 0,
	hammerSupportPercent: 3,
	btcPair: 'BTCEUR',
	btcMaxDropPercent: 4,
	stopLossPercent: 2.5,
	takeProfitPercent: 5,
	minNetRewardRisk: 1,
	makerFeePercent: 0.25,
	takerFeePercent: 0.4,
	maxSpreadPercent: 0.3,
	entryOffsetPercent: 0,
	entryTimeoutSeconds: 1800,
	maxRiskAmount: 5,
	maxOpenPositions: 1,
	maxHoldHours: 48,
	dailyMaxLoss: 10,
	weeklyMaxLoss: 20
};

const toKey = name => name.replace(/([A-Z])/g, '_$1').toUpperCase();

function loadStrategy(properties) {
	const strategy = { ...DEFAULTS };
	for (const name of Object.keys(DEFAULTS)) {
		const raw = properties.get(`strategy.${toKey(name)}`);
		if (raw === null || raw === undefined || raw === '') continue;
		if (typeof DEFAULTS[name] === 'number') {
			strategy[name] = Number(raw);
			if (!Number.isFinite(strategy[name])) throw new Error(`Invalid number for strategy.${toKey(name)}: ${raw}`);
		} else {
			strategy[name] = String(raw);
		}
	}
	if (strategy.stopLossPercent <= 0 || strategy.takeProfitPercent <= 0) throw new Error('strategy stop-loss and take-profit percents must be positive');
	if (strategy.maxRiskAmount <= 0 || strategy.maxOpenPositions < 1) throw new Error('strategy maxRiskAmount and maxOpenPositions must be positive');
	return strategy;
}

// Entry is a maker order; both the stop-loss and the target exit are taker orders.
function netEconomics(strategy, makerFeePercent = strategy.makerFeePercent, takerFeePercent = strategy.takerFeePercent) {
	const feesPercent = makerFeePercent + takerFeePercent;
	const netRewardPercent = strategy.takeProfitPercent - feesPercent;
	const netRiskPercent = strategy.stopLossPercent + feesPercent;
	return {
		feesPercent,
		netRewardPercent,
		netRiskPercent,
		rewardRisk: netRewardPercent / netRiskPercent,
		breakEvenWinRate: netRiskPercent / (netRiskPercent + netRewardPercent)
	};
}

export { DEFAULTS, loadStrategy, netEconomics };
