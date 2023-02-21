import fs from 'fs';
import { createRequire } from 'module';
import { isEmpty, sleep, persist } from './utils.js';
const require = createRequire(import.meta.url);

const ViberBot = require('viber-bot').Bot;
const BotEvents = require('viber-bot').Events;
const TextMessage = require('viber-bot').Message.Text;
const express = require('express');

class DalgonViberBot {

	constructor(env, loggerObj, reportFilePath, exposeUrl, port, botName, avatarUrl, authToken, recipientProfiles) {
		this.env = env;
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

		this.sendTextMessage(`I rise again.`);

		this.bot.on(BotEvents.SUBSCRIBED, response => {
			response.send(new TextMessage(`You are ${response.userProfile.name}. I am ${this.bot.name}. You may ask me about crypto. Type help.`));
		});

		this.bot.onTextMessage(/^(hi|hello)(\s|$)/i, async (message, response) => {
			response.send(new TextMessage(`Greetings, ${response.userProfile.name}. I am ${this.bot.name}, an autonomous cryptocurrency trading agent. Type help to learn more.`));
			this.recordHistory(message);
		});

		this.bot.onTextMessage(/^status/i, async (message, response) => {
			let canStartTradingMsg = this.canStartTrading ? "I am permitted to auto-trade." : "I am not permitted to auto-trade.";
			let pauseAnalysisMsg = this.pauseAnalysis ? "I have paused analysis." : "I am running analysis.";
			response.send(new TextMessage(`${canStartTradingMsg} ${pauseAnalysisMsg}`));
			this.recordHistory(message);
		});

		this.bot.onTextMessage(/^help/i, async (message, response) => {
			this.sendBigTextMessage(`"recommend assets": return potential profitable assets\n
			"pause|resume analysis": pause or resume analysis on potential profitable assets to recommend\n
			"start|stop trading": permission to purchase potential profitable assets\n
			"status": report auto-trading and analysis status\n
			"analyse|assess ASSET_SYMBOL [base ASSET_SYMBOL]": assess given ASSET_SYMBOL as a potential profitable asset, e.g. LTC. Optionally set different base currency, e.g. GBP\n
			"ticker ASSET_SYMBOL [base ASSET_SYMBOL]": return ticker info on given asset symbol, e.g. XBT. Optionally set different base currency, e.g. GBP\n
			"chart ASSET_SYMBOL [base ASSET_SYMBOL]": return link to chart for given asset symbol, e.g. BTC. Optionally set different base currency, e.g. GBP\n
			"balance": current balance in Kraken exchange\n
			"deposits": view total deposits and their fees\n
			"portfolio value": view current value for each asset balance, in base currency\n
			"open orders": view current open orders\n
			"change order TXID unit price PRICE": cancel and submit new order with changed unit price\n
			"cancel order TXID": cancel order\n
			"trade ASSET_SYMBOL": buy ASSET_SYMBOL with the existing auto-trading configuration\n
			"grade GRADE assets": return recommended assets with grade equal or greater than GRADE, integer\n
			"set min balance ASSET_SYMBOL AMOUNT": set ASSET_SYMBOL the desired amount of the remaining balance not to be used for trading\n
			"set trading min ASSET_SYMBOL AMOUNT": set ASSET_SYMBOL minimum trading amount to the given amount\n
			"set trading percent ASSET_SYMBOL AMOUNT": set ASSET_SYMBOL trading percent to the given percent\n
			"set profit percent AMOUNT": set profit to the given percent\n
			"[get] [auto-]trading config[uration]": get auto trading configuration\n
			"history": get recent messages history\n
			"portfolio|holdings": holdings on CoinGecko\n
			"trending": return trending coins from CoinGecko\n`
			);
			this.recordHistory(message);
		});

		this.bot.onTextMessage(/^recommend(ed)? assets$/i, async (message, response) => {
			let that = this;
			fs.readFile(reportFilePath, async function(err, data) {
				if (!data.length) {
					response.send(new TextMessage(`No results yet.`)).catch(err => { that.l.err(JSON.stringify(err, null, 2)); });
				}else {
					that.sendBigTextMessage(data);
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
			persist(this.env, 'START_TRADING', 'true', this.l);
			this.recordHistory(message);
		});

		this.bot.onTextMessage(/^stop trading$/i, async (message, response) => {
			var that = this;
			response.send(new TextMessage(`I will stop trading.`));
			this.canStartTrading = false;
			persist(this.env, 'START_TRADING', 'false', this.l);
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

	async sendTextMessage(message) {
		if (!isEmpty(this.userProfiles)) {
			for (let i=0; i<this.userProfiles.length; i++) {
				let userProfile = this.userProfiles[i];
				await this.bot.sendMessage(userProfile, new TextMessage(message));
				await sleep(1000);
			}
		}
	}

	async sendBigTextMessage(message) {
		let chunkSize = 768;
		for (let i = 0; i < message.length; i += chunkSize) {
			await this.sendTextMessage(`${message.slice(i, i+chunkSize)}`);
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
			await this.sendTextMessage(`No history.`);
		}else {
			for (let i = this.history.length - 1; i >= 0; i--) {
				await this.sendTextMessage(`${this.history[i]}`);
				await sleep(1000);
			}
		}
	}

	async sendRecommendedAssets(reportFilePath) {
		let that = this;
		await fs.readFile(reportFilePath, async function(err, data) {
			if (!data.length) {
				await that.sendTextMessage(`No results yet.`);
			}else {
				await that.sendBigTextMessage(data);
			}
		});
	}

	async sendHighGradeRecommendedAssets(recommendedAssets, gradeThreshold) {
		let assetsReport = '';
		if (recommendedAssets.length) {
			let highGradeRecommendedAssets = recommendedAssets.filter(candidate => candidate.candidateGrade >= gradeThreshold);
			if (highGradeRecommendedAssets.length) {
				for (let i=0; i<highGradeRecommendedAssets.length; i++) {
					let candidate = highGradeRecommendedAssets[i];
					assetsReport += `${candidate.name} grade: ${candidate.candidateGrade.toFixed(3)}, chart: https://cryptowat.ch/charts/KRAKEN:${candidate.name}-${candidate.baseCurrency}\n`;
				}
				this.sendBigTextMessage(assetsReport);
				return;
			}
		}
		await this.sendTextMessage(`No high grade results yet.`);
		return;
	}

}

export default DalgonViberBot;