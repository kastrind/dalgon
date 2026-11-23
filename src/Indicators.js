// ATR series index-aligned with the ticks; null until warmed up.
function atrSeries(ticks, period = 14) {
	const out = new Array(ticks.length).fill(null);
	if (ticks.length <= period) return out;
	const trueRange = i => Math.max(
		ticks[i].high - ticks[i].low,
		Math.abs(ticks[i].high - ticks[i - 1].close),
		Math.abs(ticks[i].low - ticks[i - 1].close)
	);
	let atr = 0;
	for (let i = 1; i <= period; i++) atr += trueRange(i);
	atr /= period;
	out[period] = atr;
	for (let i = period + 1; i < ticks.length; i++) {
		atr = (atr * (period - 1) + trueRange(i)) / period;
		out[i] = atr;
	}
	return out;
}

export { atrSeries };
