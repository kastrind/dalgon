import fs from 'fs';
import { createRequire } from 'module';
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

		this.bot.onTextMessage(/^asset(s)?|price(s)?$/i, (message, response) => {
			let that = this;
			fs.readFile(reportFilePath, function(err, data) {
				if (!data.length) {
					response.send(new TextMessage(`No results yet.`)).catch(err => { that.l.err(JSON.stringify(err, null, 2)); });
				}else {
					response.send(new TextMessage(`${data}`)).catch(err => { that.l.err(JSON.stringify(err, null, 2)); });
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