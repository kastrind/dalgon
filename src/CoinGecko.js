import got from 'got';
import { isEmpty, isOK } from './utils.js';

class CoinGecko {

	constructor(loggerObj, simulationMode) {
		this.host = "https://api.coingecko.com/api/v3";
		this.path = "";
		this.params = {};
		this.l = loggerObj;
		this.simulationMode = simulationMode;
	}

	createPublicFunction(path, infoMsg) {
		var that = this;
		return async function (paramsObj, simObj={}) {
			that.l.i(infoMsg);
			that.path = path;
			that.dynamicSegments = that.path.match(/\{([A-Za-z]+?)\}/);
			if (!isEmpty(that.dynamicSegments)) {
				that.dynamicSegments.forEach(element => {
					if (element.indexOf('{') == -1) {
						that.path = that.path.replace('{' + element + '}', paramsObj['{' + element + '}']);
						paramsObj['{' + element + '}'] = undefined;
					}
				});
			}
			that.params = paramsObj;
			that.l.d(`Params ${JSON.stringify(that.params, null, 2)}`, 1);
			if (!that.simulationMode) {
				that.response = await got(that.host+that.path, that.params);
				that.l.d(`Response: ${JSON.stringify(that.response.body, null, 2)}`, 1);
				if (isOK(that.response.statusCode)) that.l.suc(`Response status for ${infoMsg}: ${(that.response.statusCode)}`);
				else that.l.err(`Response status for ${infoMsg}: ${(that.response.statusCode)}`);
				//that.l.i(`Response: ${JSON.stringify(that.response.body, null, 2)}`, 1);
				return that.response;
			} else {
				return simObj;
			}
		};
	}

	async test() {
		return this.greeting = await Promise.resolve("Hello, just a test.");
	}

}

export default CoinGecko;