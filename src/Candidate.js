class Candidate {

	constructor(name, baseCurrency, latestClosingPrice, eightDaysEMA, candidateGrade, existsGreenHammer3h,
		macdCurrent, macdPrevious, macdCurrentLong, macdPreviousLong,
		changePastHour, change3h, change6h, change12h, changeDay24h,
		changeWeekHalf, changeWeek, changeMonthHalf, changeMonth,
		priceOverLowestWeek, priceOverHighestWeek, priceOverLowestMonth, priceOverHighestMonth,
		report) {

		this.name = name;
		this.baseCurrency = baseCurrency;
		this.latestClosingPrice = latestClosingPrice;
		this.eightDaysEMA = eightDaysEMA;
		this.candidateGrade = candidateGrade;
		this.existsGreenHammer3h = existsGreenHammer3h;
		this.macdCurrent = macdCurrent.toFixed(10);
		this.macdPrevious = macdPrevious.toFixed(10);
		this.macdCurrentLong = macdCurrentLong.toFixed(10);
		this.macdPreviousLong = macdPreviousLong.toFixed(10);
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