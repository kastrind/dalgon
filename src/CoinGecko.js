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
				try {
					that.response = await got(that.host + that.path, that.params);
					that.l.d(`Response: ${JSON.stringify(that.response.body, null, 2)}`, 1);
					if (isOK(that.response.statusCode)) that.l.suc(`Response status for ${infoMsg}: ${(that.response.statusCode)}`);
					return that.response;
				}catch(error) {
					that.l.err(`Request failed with status ${error.response.statusCode} and body ${error.response.body}`, 0, true);
					return error.response;
				}
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
		try {
			await setCookie(`remember_user_token=${rememberUserToken}`, 'https://www.coingecko.com');
			let response = await got(`https://www.coingecko.com/en/portfolios/${portfolioId}/overview?vs_currency=${baseCurrency}`, {cookieJar});
			return response;
		}catch(error) {
			this.l.err(`Request failed with status ${error.response.statusCode} and body ${error.response.body}`, 0, true);
			return error.response;
		}
	}

	getPortfolioReport(response) {
		let portfolio = JSON.parse(response.body);
		return `Total holdings value: ${parseFloat(portfolio.total_holdings_value).toFixed(2)},\nTotal cost: ${parseFloat(portfolio.total_cost).toFixed(2)},\nProfit/Loss: ${parseFloat(portfolio.profit_loss).toFixed(2)},\nProfit/Loss Change %: ${parseFloat(portfolio.profit_loss_change_percentage).toFixed(2)}`;
	}

	getTrendingCoinsReport(response) {
		let coins = JSON.parse(response.body).coins;
		let report = `Trending coins name/id/symbol: \n`;
		for (let i=0; i < coins.length; i++) {
			report += `\n${coins[i].item.name}/${coins[i].item.id}/${coins[i].item.symbol}\n`;
			report += `Market cap rank: ${coins[i].item.market_cap_rank}\n`;
			report += `Price (BTC): ${parseFloat(coins[i].item.price_btc).toFixed(8)}\n`;
			report += `Score: ${coins[i].item.score}\n`;
		}
		return report;
	}

}

export default CoinGecko;