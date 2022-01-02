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
				el[0], parseFloat(el[1]), parseFloat(el[2]), parseFloat(el[3]), parseFloat(el[4]), parseFloat(el[5]), parseFloat(el[6]), parseInt(el[7])
			)));
		}
	}

	setTicks(ticks) {
		this.ticks = ticks;
	}

	getTicks() {
		return this.ticks;
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
		return this.ticks.reduce((prev, curr) => { if ( curr.vol < prev.vol ) return curr; else return prev; });
	}

	getMaxVol() {
		return this.ticks.reduce((prev, curr) => { if ( curr.vol > prev.vol ) return curr; else return prev; });
	}

	getChange() {
		return ( ( this.ticks[this.ticks.length - 1].close - this.ticks[0].close ) / this.ticks[0].close );
	}

	getAverage() {
		return this.ticks.reduce((prev, curr) => { return prev + curr; }) / this.ticks.length;
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