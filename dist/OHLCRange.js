class OHLCRange {
  constructor(dateYMDString, maxNumResults = 720) {
    this.dateSince = new Date(dateYMDString);
    this.dateNow = new Date();
    this.diff = (this.dateNow - this.dateSince) / (1000 * 60 * 60 * 24);
    this.intervals = [1, 5, 15, 30, 60, 240, 1440, 10080, 21600];
    var that = this;
    this.interval = this.intervals.find((el, i, ar) => that.diff <= maxNumResults / 60 / 24 * el);
  }

  static create(dateYMDString, maxNumResults = 720) {
    let ohlcRange = new OHLCRange(dateYMDString, maxNumResults);
    if (!ohlcRange.interval || ohlcRange.diff / 365 > 20) return null;
    return ohlcRange;
  }

}

export default OHLCRange;
//# sourceMappingURL=OHLCRange.js.map