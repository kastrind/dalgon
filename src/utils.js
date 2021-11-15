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

export { isEmpty, isOK, sleep };