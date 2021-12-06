import got from 'got';
import { isEmpty, isOK } from './utils.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { promisify } from 'util';
const { CookieJar } = require('tough-cookie');

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

	async getPortfolio(rememberUserToken, portfolioId, baseCurrency) {
		const cookieJar = new CookieJar();
		const setCookie = promisify(cookieJar.setCookie.bind(cookieJar));
	
		await setCookie(`remember_user_token=${rememberUserToken}`, 'https://www.coingecko.com');
		let response = await got(`https://www.coingecko.com/en/portfolios/${portfolioId}/overview?vs_currency=${baseCurrency}`, {cookieJar});
		if (response.statusCode == 200) {
			let portfolio = JSON.parse(response.body);
			return { 
				"total_holdings_value": portfolio.total_holdings_value,
				"total_cost": portfolio.total_cost,
				"profit_loss": portfolio.profit_loss,
				"profit_loss_change_percentage": portfolio.profit_loss_change_percentage
			 };
		}
		return { "errorMsg": "request failed" };
	}

}

export default CoinGecko;