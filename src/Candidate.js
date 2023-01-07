class Candidate {

	constructor(name, baseCurrency, latestClosingPrice, eightDaysEMA, onBalanceVol3h, candidateGrade, existsGreenHammer3h,
		macdCurrent, macdPrevious, macdCurrentLong, macdPreviousLong, macdCurrentShort, macdPreviousShort,
		existsMACDReversal, existsMACDReversalLong, existsMACDReversalShort,
		keptMACDPositive, keptMACDPositiveLong, keptMACDPositiveShort, isOverbought,
		changePastHour, change3h, change6h, change12h, changeDay24h,
		changeWeekHalf, changeWeek, changeMonthHalf, changeMonth,
		priceOverLowestWeek, priceOverHighestWeek, priceOverLowestMonth, priceOverHighestMonth,
		report) {

		this.name = name;
		this.baseCurrency = baseCurrency;
		this.latestClosingPrice = latestClosingPrice;
		this.eightDaysEMA = eightDaysEMA;
		this.onBalanceVol3h = onBalanceVol3h.toFixed(3);
		this.candidateGrade = candidateGrade;
		this.existsGreenHammer3h = existsGreenHammer3h;
		this.macdCurrent = macdCurrent.toFixed(10);
		this.macdPrevious = macdPrevious.toFixed(10);
		this.macdCurrentLong = macdCurrentLong.toFixed(10);
		this.macdPreviousLong = macdPreviousLong.toFixed(10);
		this.macdCurrentShort = macdCurrentShort.toFixed(10);
		this.macdPreviousShort = macdPreviousShort.toFixed(10);
		this.existsMACDReversal = existsMACDReversal;
		this.existsMACDReversalLong = existsMACDReversalLong;
		this.existsMACDReversalShort = existsMACDReversalShort;
		this.keptMACDPositive = keptMACDPositive;
		this.keptMACDPositiveLong = keptMACDPositiveLong;
		this.keptMACDPositiveShort = keptMACDPositiveShort;
		this.isOverbought = isOverbought;
		this.changePastHour = changePastHour;
		this.change3h = change3h;
		this.change6h = change6h;
		this.change12h = change12h;
		this.changeDay24h = changeDay24h;
		this.changeWeekHalf = changeWeekHalf;
		this.changeWeek = changeWeek;
		this.changeMonthHalf = changeMonthHalf;
		this.changeMonth = changeMonth;
		this.priceOverLowestWeek = priceOverLowestWeek;
		this.priceOverHighestWeek = priceOverHighestWeek;
		this.priceOverLowestMonth = priceOverLowestMonth;
		this.priceOverHighestMonth = priceOverHighestMonth;
		this.report = report;
	}

}

export default Candidate;