class TradingDecision {

	constructor(client, loggerObj) {
		this.client = client;
		this.l = loggerObj;
	}

	async evaluate(input) {
		let systemPrompt = `You are an advisory cryptocurrency trading analyst. Use only the supplied structured data. Return exactly one valid JSON object with this shape: {"action":"BUY|SELL|HOLD","confidence":0-1,"horizon":"short|medium|long","reason":"string","memo":"string"}. Append no prose. The memo must be a concise complete trading session update, no more than 2000 characters. Never fabricate prices, indicators, balances, or outcomes. If data is stale or contradictory, return HOLD with low confidence.`;
		let userPrompt = JSON.stringify({
			bitcoin: input.bitcoin || null,
			candidates: input.candidates || [],
			openOrders: input.openOrders || [],
			previousMemo: this.client.memo || ''
		}, null, 2);

		let responseText = await this.client.chat(systemPrompt, userPrompt);
		let decision;
		try {
			decision = JSON.parse(responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
		} catch (error) {
			throw new Error(`OpenRouter returned invalid trading JSON: ${error.message}`);
		}

		if (!['BUY', 'SELL', 'HOLD'].includes(decision.action)) throw new Error('Invalid trading action');
		if (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1) throw new Error('Invalid trading confidence');
		if (!['short', 'medium', 'long'].includes(decision.horizon)) throw new Error('Invalid trading horizon');
		if (typeof decision.reason !== 'string' || typeof decision.memo !== 'string') throw new Error('Invalid trading explanation');
		if (decision.memo.length > 2000) decision.memo = decision.memo.slice(0, 2000);

		this.client.memo = decision.memo;
		this.client.saveSession();
		return decision;
	}
}

export default TradingDecision;
