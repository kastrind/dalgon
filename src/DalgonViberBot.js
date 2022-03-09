import fs from 'fs';
import { createRequire } from 'module';
import { isEmpty, sleep } from './utils.js';
const require = createRequire(import.meta.url);

const ViberBot = require('viber-bot').Bot;
const BotEvents = require('viber-bot').Events;
const TextMessage = require('viber-bot').Message.Text;
const express = require('express');

class DalgonViberBot {

	constructor(loggerObj, reportFilePath, exposeUrl, port, botName, avatarUrl, authToken, recipientProfiles) {
		this.l = loggerObj;
		this.app = express();
		this.history = [];
		this.historyIndex = 0;

		this.bot = new ViberBot({
			authToken: authToken,
			name: botName,
			avatar: avatarUrl // It is recommended to be 720x720, and no more than 100kb.
		});

		this.pauseAnalysis = false;
		this.canStartTrading = false;

		this.userProfiles = recipientProfiles;
		if (!isEmpty(this.userProfiles)) {
			this.userProfiles.forEach(async (userProfile) => {
				await this.bot.sendMessage(userProfile, new TextMessage("I rise again."));
				await sleep(1000);
			});
		}

		this.bot.onTextMessage(/^(hi|hello)(\s|$)/i, async (message, response) => {
			response.send(new TextMessage(`Greetings, ${response.userProfile.name}. I am ${this.bot.name}, an autonomous cryptocurrency trading agent. Type help to learn more.`));
			this.recordHistory(message);
		});

		this.bot.onTextMessage(/^help/i, async (message, response) => {
			response.send(new TextMessage(`"recommend assets": return potential profitable assets\n
			"pause|resume analysis": pause or resume analysis on potential profitable assets to recommend\n
			"start|stop trading": permission to purchase potential profitable assets\n
			"ticker ASSET_SYMBOL [base ASSET_SYMBOL]": return ticker info on given asset symbol, e.g. BTC. Optionally set different base currency, e.g. XBT for Bitcoin\n
			"balance": current balance in Kraken exchange\n
			"purchases": view purchased asset amounts and costs\n
			"portfolio value": view current value for each asset balance, in base currency\n
			"open orders": view current open orders\n
			"change order TXID unit price PRICE": cancel and submit new order with changed unit price\n
			"cancel order TXID": cancel order\n
			"trade ASSET_SYMBOL": buy ASSET_SYMBOL with the existing auto-trading configuration\n
			"set budget ASSET_SYMBOL AMOUNT": set ASSET_SYMBOL budget to the given amount\n
			"set trading min ASSET_SYMBOL AMOUNT": set ASSET_SYMBOL minimum trading amount to the given amount\n
			"set trading percent ASSET_SYMBOL AMOUNT": set ASSET_SYMBOL trading percent to the given percent\n
			"set profit percent ASSET_SYMBOL AMOUNT": set ASSET_SYMBOL profit to the given percent\n
			"[get] [auto-]trading config[uration]": get auto trading configuration\n
			"reset|renew budget ASSET_SYMBOL": Set total amount bought with ASSET_SYMBOL back to 0\n
			"get budget ASSET_SYMBOL": Get total amount bought with ASSET_SYMBOL\n
			"history": get recent messages history\n
			"portfolio|holdings": holdings on CoinGecko\n
			"trending": return trending coins from CoinGecko\n
			"updates|status updates|news": return news from CoinGecko\n`
			));
			this.recordHistory(message);
		});

		this.bot.on(BotEvents.SUBSCRIBED, response => {
			response.send(new TextMessage(`You are ${response.userProfile.name}. I am ${this.bot.name}. You may ask me about crypto. Type help.`));
		});

		this.bot.onTextMessage(/^recommend(ed)? assets$/i, async (message, response) => {
			let that = this;
			fs.readFile(reportFilePath, async function(err, data) {
				if (!data.length) {
					response.send(new TextMessage(`No results yet.`)).catch(err => { that.l.err(JSON.stringify(err, null, 2)); });
				}else {
					let chunkSize=768;
					let i = 0;
					for (i=0; i < data.length; i+=chunkSize) {
						await response.send(new TextMessage(`${data.slice(i, i+chunkSize)}`)).catch(err => { that.l.err(JSON.stringify(err, null, 2)); });
						await sleep(3000);
					}
				}
			});
			this.recordHistory(message);
		});

		this.bot.onTextMessage(/^(resume|start) analysis$/i, async (message, response) => {
			response.send(new TextMessage(`I will resume analysis.`));
			this.pauseAnalysis = false;
			this.recordHistory(message);
		});

		this.bot.onTextMessage(/^(pause|stop) analysis$/i, async (message, response) => {
			response.send(new TextMessage(`I will pause analysis.`));
			this.pauseAnalysis = true;
			this.recordHistory(message);
		});

		this.bot.onTextMessage(/^start trading$/i, async (message, response) => {
			response.send(new TextMessage(`I will start trading.`));
			this.canStartTrading = true;
			this.recordHistory(message);
		});

		this.bot.onTextMessage(/^stop trading$/i, async (message, response) => {
			response.send(new TextMessage(`I will stop trading.`));
			this.canStartTrading = false;
			this.recordHistory(message);
		});

		this.app.use("/viber/webhook", this.bot.middleware());
		this.app.listen(port, () => {
			this.l.i(`Application running on port: ${port}`);
			this.bot.setWebhook(`${exposeUrl}/viber/webhook`).catch(error => {
				this.l.err('Can not set webhook on following server. Is it running?', 0, true);
				this.l.err(JSON.stringify(error, null, 2), 0, true);
				process.exit(1);
			});
		});
	}

	getBot() {
		return this.bot;
	}

	sendTextMessage(message) {
		if (!isEmpty(this.userProfiles)) {
			this.userProfiles.forEach(async (userProfile) => {
				this.bot.sendMessage(userProfile, new TextMessage(message));
				await sleep(1000);
			});
		}
	}

	async sendBigTextMessage(message) {
		let chunkSize = 768;
		for (let i = 0; i < message.length; i += chunkSize) {
			this.sendTextMessage(`${message.slice(i, i+chunkSize)}`);
			await sleep(3000);
		}
	}

	recordHistory(message) {
		if (!isEmpty(this.history) && this.history.length >= 20) {
			this.historyIndex = 0;
		}
		if (!this.history.includes(message.text)) this.history[this.historyIndex++] = message.text;
	}

	async sendHistory() {
		if (isEmpty(this.history)) {
			this.sendTextMessage(`No history.`);
		}else {
			for (let i = this.history.length - 1; i >= 0; i--) {
				this.sendTextMessage(`${this.history[i]}`);
				await sleep(1000);
			}
		}
	}

	sendRecommendedAssets(reportFilePath) {
		let that = this;
		fs.readFile(reportFilePath, async function(err, data) {
			if (!data.length) {
				that.sendTextMessage(`No results yet.`);
			}else {
				that.sendBigTextMessage(data);
			}
		});
	}

}

export default DalgonViberBot;