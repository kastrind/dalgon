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
		return ( ( this.ticks[this.ticks.length - 1].close - this.ticks[0].close ) / this.ticks[0].close );
	}

	getAverage() {
		return this.ticks.reduce((prev, curr, i) => { if(i===1) prev=prev.close; return prev + curr.close; }) / this.ticks.length;
	}

	getAverageVol() {
		return this.ticks.reduce((prev, curr, i) => { if(i===1) prev=prev.vol; return prev + curr.vol; }) / this.ticks.length;
	}

	getOnBalanceVol() {
		let balance = 0;
		for (let i=0; i < this.ticks.length; i++) {
			if (i==0) { balance = this.ticks[i].vol; continue; }
			balance = this.ticks[i].close > this.ticks[i-1].close ? balance + this.ticks[i].vol : balance - this.ticks[i].vol;
		}
		return balance;
	}

	getDerivative() {
		return ( this.ticks[this.ticks.length - 1].close - this.ticks[0].close ) / ( this.ticks[this.ticks.length - 1].time - this.ticks[0].time );
	}

	getEMA(numPeriods, smoothing, offset=0, property='close') {
		return this.ticks.getEMA(numPeriods, smoothing, offset, property);
	}

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
		let since = ohlcRange.dateSinceSeconds;
		let interval = ohlcRange.interval;
		let OHLCRequestParamsObj = { searchParams: { pair: paramAsset, since: since, interval: interval } };
		await OHLCRequest(OHLCRequestParamsObj, simObj).then(s => responseBody = JSON.parse(s.body));
		if (!isEmpty(responseBody) && responseBody.result && Object.keys(responseBody.result).length > 0) {
			return new OHLC(OHLCRequestParamsObj.searchParams.pair, loggerObj, simulationMode, responseBody.result);
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
		for (let i=0; i<last5Ticks.length; i++) {
			let tick = last5Ticks[i];
			let candleBody = Math.abs(tick.close - tick.open);
			if (tick.isGreen() && tick.isCandle()) {
				score += scores[i] * (candleBody / tick.close) * tick.vol / sumVol;
				this.l.d(`Tick ${i} is a green candle with candleBody ${candleBody}.`, 2);

			}else if (tick.isRed() && tick.isCandle()) {
				score -= scores[i] * (candleBody / tick.close) * tick.vol / sumVol;
				this.l.d(`Tick ${i} is a red candle with candleBody ${candleBody}.`, 2);

			}else if (tick.isGreen() && tick.isHammer()) {
				let handleBody = tick.open - tick.low;
				score += scores[i] * (handleBody / tick.close) * tick.vol / sumVol;
				this.l.d(`Tick ${i} is a green hammer with handleBody ${handleBody}.`, 2);

			}else if (tick.isRed() && tick.isHammer()) {
				let handleBody = tick.close - tick.low;
				score -= scores[i] * (handleBody / tick.close) * tick.vol / sumVol;
				this.l.d(`Tick ${i} is a red hammer with handleBody ${handleBody}.`, 2);
			}else if (tick.isInvertedHammer()) {
				let handleBody = 0;
				if (tick.isRed()) {
					handleBody = tick.high - tick.open;
				}else {
					handleBody = tick.high - tick.close;
				}
				score += (scores[i] * (handleBody / tick.close) * tick.vol / sumVol) / 2;
				this.l.d(`Tick ${i} is an inverted hammer with handleBody ${handleBody}.`, 2);
			}
			this.l.d(`Score is ${score}.`, 2);
		}
		return score;
	}

}

export default OHLC;