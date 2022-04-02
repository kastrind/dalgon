class Tick {

	constructor(time, open, high, low, close, volWAvgPrice, vol, count) {
		this.time = time;
		this.date = new Date(this.time * 1000);
		this.open = parseFloat(open);
		this.high = parseFloat(high);
		this.low = parseFloat(low);
		this.close = parseFloat(close);
		this.volWavgPrice = parseFloat(volWAvgPrice);
		this.vol = parseFloat(vol);
		this.count = parseInt(count);
	}

	isRed() {
		return this.close < this.open;
	}

	isGreen() {
		return this.close >= this.open;
	}

	isCandle() {
		if (this.isRed()) {
			return	this.open - this.close > this.close - this.low &&
					this.open - this.close > this.high - this.open;
		}else {
			return	this.close - this.open > this.open - this.low &&
					this.close - this.open > this.high - this.close;
		}
	}

	isHammer() {
		if (this.isRed()) {
			//lower hammer handle bigger than upper and bigger than hammerhead
			return this.close - this.low > this.high - this.open && !this.isCandle();
		}else {
			//lower hammer handle bigger than upper and bigger than hammerhead
			return this.open - this.low > this.high - this.close && !this.isCandle();
		}
	}

	isInvertedHammer() {
		if (this.isRed()) {
			//upper hammer handle bigger than lower and bigger than hammerhead 
			return this.close - this.low < this.high - this.open && !this.isCandle();
		}else {
			//upper hammer handle bigger than lower and bigger than hammerhead
			return this.open - this.low < this.high - this.close && !this.isCandle();
		}
	}

	engulfsBearish(tick) {
		if (this.isRed() && tick.isGreen())
			return this.open > tick.close && this.close < tick.open;
		return false;
	}

	engulfsBullish(tick) {
		if (this.isGreen() && tick.isRed())
			return this.close > tick.open && this.open < tick.close;
		return false;
	}

}

export default Tick;