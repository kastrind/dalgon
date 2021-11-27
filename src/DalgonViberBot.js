import fs from 'fs';
import { createRequire } from 'module';
import { sleep } from './utils.js';
//import { sleep as sleep2 } from './utils';
const require = createRequire(import.meta.url);

const ViberBot = require('viber-bot').Bot;
const BotEvents = require('viber-bot').Events;
const TextMessage = require('viber-bot').Message.Text;
const express = require('express');

class DalgonViberBot {

	constructor(loggerObj, reportFilePath, exposeUrl, port, botName, avatarUrl, authToken) {
		this.l = loggerObj;
		this.app = express();

		this.bot = new ViberBot({
			authToken: authToken,
			name: botName,
			avatar: avatarUrl // It is recommended to be 720x720, and no more than 100kb.
		});

		this.bot.on(BotEvents.SUBSCRIBED, response => {
			response.send(new TextMessage(`Hi there ${response.userProfile.name}. I am ${bot.name}! Feel free to ask me about crypto.`));
		});
		
		// bot.on(BotEvents.MESSAGE_RECEIVED, (message, response) => {
		// 	response.send(new TextMessage(`Message received.`));
		// });

		this.bot.onTextMessage(/^asset(s)?|price(s)?$/i, async (message, response) => {
			let that = this;
			fs.readFile(reportFilePath, async function(err, data) {
				if (!data.length) {
					response.send(new TextMessage(`No results yet.`)).catch(err => { that.l.err(JSON.stringify(err, null, 2)); });
				}else {
					let chunkSize=1000;
					let i = 0;
					for (i=0; i < data.length; i+=chunkSize) {
						await response.send(new TextMessage(`${data.slice(i, i+chunkSize)}`)).catch(err => { that.l.err(JSON.stringify(err, null, 2)); });
						await sleep(3000);
					}
				}
			});
		});

		this.app.use("/viber/webhook", this.bot.middleware());
		this.app.listen(port, () => {
			this.l.i(`Application running on port: ${port}`);
			this.bot.setWebhook(`${exposeUrl}/viber/webhook`).catch(error => {
				this.l.err('Can not set webhook on following server. Is it running?');
				this.l.err(JSON.stringify(error, null, 2));
				process.exit(1);
			});
		});
	}
}

export default DalgonViberBot;