import OHLCRange from './OHLCRange.js';
import Tick from './Tick.js';
import { isEmpty } from './utils.js';

class OHLC {

	constructor(assetPair, loggerObj, simulationMode, response) {
		this.assetPair = assetPair;
		this.l = loggerObj;
		this.simulationMode = simulationMode;
		this.OHLCJsonResponse = response;
		this.ticks = [];
		this.assetPairResponse = !isEmpty(this.OHLCJsonResponse) ? Object.keys(this.OHLCJsonResponse)[0] : null;
		var that = this;
		if (!isEmpty(this.OHLCJsonResponse)) {
			this.OHLCJsonResponse[this.assetPairResponse].forEach( (el, i, arr)  => that.ticks.push(new Tick(
				el[0], el[1], el[2], el[3], el[4], el[5], el[6], el[7]
			)));
		}
	}

	setTicks(ticks) {
		this.ticks = ticks;
	}

	getTicks() {
		return this.ticks;
	}

	getLastTick() {
		return this.ticks[this.ticks.length - 1];
	}

	getHighest() {
		return this.ticks.reduce((prev, curr) => { if ( curr.high > prev.high ) return curr; else return prev; });
	}

	getHighestClose() {
		return this.ticks.reduce((prev, curr) => { if ( curr.close > prev.close ) return curr; else return prev; });
	}

	getLowest() {
		return this.ticks.reduce((prev, curr) => { if ( curr.low < prev.low ) return curr; else return prev; });
	}

	getLowestClose() {
		return this.ticks.reduce((prev, curr) => { if ( curr.close < prev.close ) return curr; else return prev; });
	}

	getMinVol() {
		return (this.ticks.reduce((prev, curr) => { if ( curr.vol < prev.vol ) return curr; else return prev; })).vol;
	}

	getMaxVol() {
		return (this.ticks.reduce((prev, curr) => { if ( curr.vol > prev.vol ) return curr; else return prev; })).vol;
	}

	getChange() {
		let first = this.ticks[0].close;
		if (!(first > 0)) return 0;
		return ( ( this.ticks[this.ticks.length - 1].close - first ) / first );
	}

	getAverage() {
		if (!this.ticks.length) return NaN;
		return this.ticks.reduce((sum, tick) => sum + tick.close, 0) / this.ticks.length;
	}

	getAverageVol() {
		if (!this.ticks.length) return NaN;
		return this.ticks.reduce((sum, tick) => sum + tick.vol, 0) / this.ticks.length;
	}

	getOnBalanceVol() {
		let balance = 0;
		for (let i=1; i < this.ticks.length; i++) {
			if (this.ticks[i].close > this.ticks[i-1].close) balance += this.ticks[i].vol;
			else if (this.ticks[i].close < this.ticks[i-1].close) balance -= this.ticks[i].vol;
		}
		return balance;
	}

	getDerivative() {
		let elapsed = this.ticks[this.ticks.length - 1].time - this.ticks[0].time;
		if (!(elapsed > 0)) return 0;
		return ( this.ticks[this.ticks.length - 1].close - this.ticks[0].close ) / elapsed;
	}

	// Kraken omits candles without trades, so windows must be defined by time and not by candle count.
	getTicksSince(windowSeconds) {
		let last = this.getLastTick();
		if (!last) return [];
		return this.ticks.filter(tick => tick.time > last.time - windowSeconds);
	}

	// Kraken returns the still-forming candle last; pattern detection must not read it.
	getClosed() {
		let ticks = this.ticks.slice();
		let last = ticks[ticks.length - 1];
		if (this.intervalMinutes && last && last.time + this.intervalMinutes * 60 > Date.now() / 1000) ticks.pop();
		let closed = new OHLC(this.assetPair, this.l, this.simulationMode, null);
		closed.intervalMinutes = this.intervalMinutes;
		closed.setTicks(ticks);
		return closed;
	}

	// Closes at exact day offsets before the latest candle, oldest first; days without a candle are skipped.
	getClosesDaysBack(days) {
		let last = this.getLastTick();
		let closes = [];
		if (!last) return closes;
		for (let k = days; k >= 1; k--) {
			let target = last.time - k * 86400;
			let tick = null;
			for (let i = this.ticks.length - 1; i >= 0; i--) {
				if (this.ticks[i].time <= target) { tick = this.ticks[i]; break; }
			}
			if (tick) closes.push({ close: tick.close });
		}
		return closes;
	}

	getEMA(numPeriods, smoothing, offset=0, property='close') {
		return this.ticks.getEMA(numPeriods, smoothing, offset, property);
	}

	// Returns the MACD histogram (MACD line minus signal line); offset 0 is the forming candle, offset 1 the last closed one.
	getMACD(a, b, c, smoothing, offset=0, property='close') {
		this.l.d(`Computing MACD(${a}, ${b}, ${c}) until present period with offset ${offset} and smoothing ${smoothing} on property ${property}:`, 1);
		let macdSeries = [];
		for (let i=0; i<c; i++) {
			macdSeries.push(this.getEMA(a, smoothing, i + offset, property) - this.getEMA(b, smoothing, i + offset, property));
			// this.l.d(`EMA a=${a} i=${i} = ${this.getEMA(a, smoothing, i + offset, property)}`);
			// this.l.d(`EMA b=${b} i=${i} = ${this.getEMA(b, smoothing, i + offset, property)}`);
		}
		macdSeries = macdSeries.reverse();
		this.l.d(`MACD series: ${macdSeries}`, 2);
		this.l.d(`MACD series last: ${macdSeries[macdSeries.length-1].toFixed(10)}`, 2);
		let signal = macdSeries.getEMA(c, smoothing, 0, null);
		this.l.d(`MACD signal: ${signal.toFixed(10)}`, 2);
		this.l.d(`MACD result: ${(macdSeries[macdSeries.length-1] - signal).toFixed(10)}`, 2);
		return macdSeries[macdSeries.length-1] - signal;
	}

	static async request(OHLCRequest, paramAsset, paramSince, maxNumResults, loggerObj, simulationMode=false, simObj={}) {
		let responseBody = {};
		let ohlcRange = OHLCRange.create(paramSince, maxNumResults);
		if (!ohlcRange) return null;
		let since = ohlcRange.dateSinceSeconds;
		let interval = ohlcRange.interval;
		let OHLCRequestParamsObj = { searchParams: { pair: paramAsset, since: since, interval: interval } };
		await OHLCRequest(OHLCRequestParamsObj, simObj).then(s => responseBody = JSON.parse(s.body));
		if (!isEmpty(responseBody) && responseBody.result && Object.keys(responseBody.result).length > 0) {
			return new OHLC(OHLCRequestParamsObj.searchParams.pair, loggerObj, simulationMode, responseBody.result);
		}
		return null;
	}

	// Fixed interval and candle count, so the indicator timeframe never depends on a result-count setting.
	static async requestInterval(OHLCRequest, paramAsset, intervalMinutes, numCandles, loggerObj, simulationMode=false, simObj={}, minTicks=3) {
		let since = Math.floor(Date.now() / 1000) - numCandles * intervalMinutes * 60;
		let OHLCRequestParamsObj = { searchParams: { pair: paramAsset, since: since, interval: intervalMinutes } };
		try {
			let response = await OHLCRequest(OHLCRequestParamsObj, simObj);
			let responseBody = JSON.parse(response.body);
			if (!isEmpty(responseBody) && responseBody.result && Object.keys(responseBody.result).length > 0) {
				let ohlc = new OHLC(paramAsset, loggerObj, simulationMode, responseBody.result);
				ohlc.intervalMinutes = intervalMinutes;
				// Fewer candles than the indicators need are treated as no data.
				if (ohlc.getTicks().length >= minTicks) return ohlc;
			}
		} catch (error) {
			loggerObj.err(`OHLC request for ${paramAsset} (${intervalMinutes}m) failed: ${error.message}`, 0, true);
		}
		return null;
	}

	getCandleStickScore() {
		let scores = [0.1, 0.1, 0.15, 0.25, 0.4];
		let score = 0;
		let last5Ticks = this.ticks.slice(-5);
		this.l.d(`Last 5 ticks:\n${JSON.stringify(last5Ticks, null, 2)}`, 1);
		let sumVol = 0;
		last5Ticks.forEach(tick => sumVol+=tick.vol);
		if (sumVol === 0) return 0;
		// With fewer than five candles the newest one keeps the largest weight.
		let firstWeight = scores.length - last5Ticks.length;
		for (let i=0; i<last5Ticks.length; i++) {
			let tick = last5Ticks[i];
			let weight = scores[firstWeight + i];
			let candleBody = Math.abs(tick.close - tick.open);
			if (tick.isGreen() && tick.isCandle()) {
				score += weight * (candleBody / tick.close) * tick.vol / sumVol;
				this.l.d(`Tick ${i} is a green candle with candleBody ${candleBody}.`, 2);

			}else if (tick.isRed() && tick.isCandle()) {
				score -= weight * (candleBody / tick.close) * tick.vol / sumVol;
				this.l.d(`Tick ${i} is a red candle with candleBody ${candleBody}.`, 2);

			}else if (tick.isGreen() && tick.isHammer()) {
				let handleBody = tick.open - tick.low;
				score += weight * (handleBody / tick.close) * tick.vol / sumVol;
				this.l.d(`Tick ${i} is a green hammer with handleBody ${handleBody}.`, 2);

			}else if (tick.isRed() && tick.isHammer()) {
				let handleBody = tick.close - tick.low;
				score -= weight * (handleBody / tick.close) * tick.vol / sumVol;
				this.l.d(`Tick ${i} is a red hammer with handleBody ${handleBody}.`, 2);
			}else if (tick.isInvertedHammer()) {
				let handleBody = 0;
				if (tick.isRed()) {
					handleBody = tick.high - tick.open;
				}else {
					handleBody = tick.high - tick.close;
				}
				score += (weight * (handleBody / tick.close) * tick.vol / sumVol) / 2;
				this.l.d(`Tick ${i} is an inverted hammer with handleBody ${handleBody}.`, 2);
			}
			this.l.d(`Score is ${score}.`, 2);
		}
		return score;
	}

}

export default OHLC;