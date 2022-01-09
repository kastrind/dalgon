function isEmpty(arg)  {
	if (Array.isArray(arg)) return arg.length === 0;
	if (arg == null || arg == undefined) return true;
	return Object.keys(arg).length === 0 && Object.getPrototypeOf(arg) === Object.prototype;
}

function isOK(statusCode) {
	return /^2\d\d/.test(statusCode);
}

function sleep(ms) {
	return new Promise((resolve) => {
	  setTimeout(resolve, ms);
	});
}

function prcnt(num) {
	return (num * 100).toFixed(2);
}

function getDateTime() {
	let date = new Date();
	return `${('0'+date.getDate()).slice(-2)}/${('0'+(date.getMonth()+1)).slice(-2)}/${date.getFullYear()} ${('0'+date.getHours()).slice(-2)}:${('0'+date.getMinutes()).slice(-2)}:${('0'+date.getSeconds()).slice(-2)}`;
}

Array.prototype.getEMA = function(numPeriods, smoothing, offset=0, property='close') {
	let wSum = 1;
	if (isEmpty(smoothing)) smoothing = 2 / (numPeriods + 1);
	return this.slice(this.length - numPeriods - offset, this.length - offset).reduce((prev, curr, i) => {
		wSum += Math.pow(1 - smoothing, i);
		if (!isEmpty(property)) {
			if (i===1) prev = prev[property];
			curr = curr[property];
		} 
		return prev + Math.pow(1 - smoothing, i)*curr; }) / wSum;
		//return prev + curr});
};

export { isEmpty, isOK, sleep, prcnt, getDateTime };