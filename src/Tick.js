class Tick {

	constructor(time, open, high, low, close, volWAvgPrice, vol, count) {
		this.time = time;
		this.date = new Date(this.time * 1000);
		this.open = open;
		this.high = high;
		this.low = low;
		this.close = close;
		this.volWavgPrice = volWAvgPrice;
		this.vol = vol;
		this.count = count;
	}
}

export default Tick;