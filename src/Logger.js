

class Logger {

	constructor(verbose, debug) {
		this.verbose = verbose;
		this.debug = debug;

		this.reset = "\x1b[0m";
		this.bright = "\x1b[1m";
		this.dim = "\x1b[2m"
		this.underscore = "\x1b[4m";
		this.blink = "\x1b[5m";
		this.reverse = "\x1b[7m";
		this.hidden = "\x1b[8m";

		this.fgBlack = "\x1b[30m";
		this.fgRed = "\x1b[31m";
		this.fgGreen = "\x1b[32m";
		this.fgDarkGreen = "\x1b[38;5;22m";
		this.fgYellow = "\x1b[33m";
		this.fgBlue = "\x1b[34m";
		this.fgMagenta = "\x1b[35m";
		this.fgCyan = "\x1b[36m";
		this.fgGrey = "\x1b[38;5;248m";
		this.fgWhite = "\x1b[37m";

		this.bgBlack = "\x1b[40m";
		this.bgRed = "\x1b[41m";
		this.bgGreen = "\x1b[42m";
		this.bgDarkGreen = "\x1b[48;5;22m";
		this.bgYellow = "\x1b[43m";
		this.bgBlue = "\x1b[44m";
		this.bgMagenta = "\x1b[45m";
		this.bgCyan = "\x1b[46m";
		this.bgGrey = "\x1b[48;5;248m";
		this.bgWhite = "\x1b[47m";
	}

	getLogMsg(msg, indentation=0, colorResume="") {
		msg = msg.replace(/(\n)/g, "$1"+'  '.repeat(indentation)).replace(new RegExp('(\\n)(\\s{'+(indentation*2)+'})', 'g'), "$1"+this.reset+"$2"+colorResume);
		return this.verbose ? msg : "";
	}
	
	l(msg, indentation=0) {
		return this.verbose ? console.log(`${'  '.repeat(indentation)}${this.getLogMsg(msg, indentation)}`) : 0;
	}
	
	i(msg, indentation=0) {
		return this.verbose ? console.info(`${'  '.repeat(indentation)}${this.bgBlue}${this.fgWhite}(i) [INFO]     ${this.getLogMsg(msg, indentation, `${this.bgBlue}${this.fgWhite}`)} ${this.reset}`) : 0;
	}

	d(msg, indentation=0) {
		return this.debug ? console.debug(`${'  '.repeat(indentation)}${this.bgGrey}${this.fgDarkGreen}(*) [DEBUG]    ${this.getLogMsg(msg, indentation, `${this.bgGrey}${this.fgDarkGreen}`)} ${this.reset}`): 0;
	}
	
	w(msg, indentation=0) {
		return this.verbose ? console.warn(`${'  '.repeat(indentation)}${this.bgYellow}${this.fgBlack}(!) [WARN]     ${this.getLogMsg(msg, indentation, `${this.bgYellow}${this.fgBlack}`)} ${this.reset}`) : 0;
	}
	suc(msg, indentation=0) {
		return this.verbose ? console.info(`${'  '.repeat(indentation)}${this.bgGreen}${this.fgBlack}(v) [SUCCESS] ${this.getLogMsg(msg, indentation, `${this.bgGreen}${this.fgBlack}`)} ${this.reset}`) : 0;
	}
	
	err(msg, indentation=0) {
		return this.verbose ? console.error(`${'  '.repeat(indentation)}${this.bgRed}${this.fgWhite}(x) [ERROR]    ${this.getLogMsg(msg, indentation, `${this.bgRed}${this.fgYellow}`)} ${this.reset}`) : 0;
	}

}

export default Logger;