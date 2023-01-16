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
	if (isEmpty(smoothing)) smoothing = 2 / (numPeriods + 1);
	let wSum = Math.pow(1 - smoothing, numPeriods);
	let reducedValue = this.slice(this.length - numPeriods - offset, this.length - offset).reduce((prev, curr, i) => {
		if (!isEmpty(property)) {
			if (i===1) prev = parseFloat(prev[property]) * wSum;
			curr = parseFloat(curr[property]);
		}else {
			if (i===1) prev = parseFloat(prev) * wSum;
			curr = parseFloat(curr);
		}
		wSum += Math.pow(1 - smoothing, numPeriods - i);
		let result = prev + Math.pow(1 - smoothing, numPeriods - i)*curr;
		return result;
	});
	return reducedValue / wSum;
};

function persist(env, key, value, logger) {
	fs.readFile(`env/${env}.persistence.properties`, 'utf-8', function(err, contents) {
		if (err) { logger.err(err, 0, true); return; }
		let regexStr = key + '=.*$';
		let re = new RegExp(regexStr, 'g');
		let replaced = contents.replace(re, key + '=' + value);
		fs.writeFile('persistence.properties', replaced + '\n', 'utf-8', function(err) { if (err) logger.err(err, 0, true); } );
	});
}

export { isEmpty, isOK, sleep, prcnt, getDateTime, persist };