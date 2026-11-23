import got from 'got';
import crypto from 'crypto';
import fs from 'fs';

class OpenRouterClient {

	constructor(apiKey, model, baseUrl, loggerObj, options={}) {
		this.apiKey = apiKey;
		this.model = model;
		this.baseUrl = (baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
		this.l = loggerObj;
		this.sessionId = options.sessionId || `dalgon-${crypto.randomUUID()}`;
		this.reasoning = options.reasoning || '';
		this.maxTokens = options.maxTokens ? parseInt(options.maxTokens) : null;
		this.sessionFile = options.sessionFile || null;
		this.historyLimit = options.historyLimit || 12;
		this.history = [];
		this.memo = '';
		this.lastUsage = null;
		this.loadSession();
	}

	loadSession() {
		if (!this.sessionFile || !fs.existsSync(this.sessionFile)) return;
		try {
			let session = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
			this.memo = typeof session.memo === 'string' ? session.memo : '';
			this.history = Array.isArray(session.history) ? session.history.slice(-this.historyLimit) : [];
			if (typeof session.sessionId === 'string' && session.sessionId) this.sessionId = session.sessionId;
		} catch (error) {
			this.l.err(`Failed to load OpenRouter session: ${error.message}`, 0, true);
		}
	}

	saveSession() {
		if (!this.sessionFile) return;
		try {
			fs.mkdirSync(requireParentDir(this.sessionFile), { recursive: true });
			fs.writeFileSync(this.sessionFile, JSON.stringify({
				sessionId: this.sessionId,
				memo: this.memo,
				history: this.history
			}, null, 2));
		} catch (error) {
			this.l.err(`Failed to save OpenRouter session: ${error.message}`, 0, true);
		}
	}

	resetSession() {
		this.history = [];
		this.memo = '';
		this.sessionId = `dalgon-${crypto.randomUUID()}`;
		this.saveSession();
	}

	async chat(systemPrompt, userPrompt) {
		let messages = [
			{ role: 'system', content: systemPrompt },
			...this.history,
			{ role: 'user', content: userPrompt }
		];
		let payload = { model: this.model, messages };
		if (this.maxTokens) payload.max_tokens = this.maxTokens;
		let extraBody = { session_id: this.sessionId };

		if (this.reasoning) {
			if (this.reasoning === 'true' || this.reasoning === 'false') {
				extraBody.reasoning = { enabled: this.reasoning === 'true' };
			}else if (['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(this.reasoning)) {
				extraBody.reasoning = { effort: this.reasoning };
			}else {
				throw new Error('OpenRouter reasoning must be true, false, or a supported effort level');
			}
		}

		let response = await got.post(`${this.baseUrl}/chat/completions`, {
			rejectUnauthorized: true,
			timeout: { request: 90000 },
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://github.com/kastrind/dalgon',
				'X-Title': 'Dalgon'
			},
			json: { ...payload, ...extraBody }
		}).json();

		this.lastUsage = response.usage || null;
		let content = response.choices?.[0]?.message?.content;
		if (!content) throw new Error('OpenRouter returned no message content');

		this.history.push({ role: 'user', content: userPrompt });
		this.history.push({ role: 'assistant', content });
		this.history = this.history.slice(-this.historyLimit);
		this.saveSession();
		return content;
	}
}

function requireParentDir(filePath) {
	return filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
}

export default OpenRouterClient;
