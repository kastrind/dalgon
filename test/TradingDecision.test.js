import assert from 'assert';
import TradingDecision from '../src/TradingDecision.js';

class FakeOpenRouterClient {
	constructor(response) {
		this.response = response;
		this.memo = '';
		this.saved = false;
	}

	async chat() {
		return this.response;
	}

	saveSession() {
		this.saved = true;
	}
}

(async function () {
	describe('TradingDecision', () => {
		it('should accept a valid structured BUY decision', async () => {
			let client = new FakeOpenRouterClient(JSON.stringify({
				action: 'BUY',
				confidence: 0.72,
				horizon: 'medium',
				reason: 'Multiple indicators agree.',
				memo: 'BTC is neutral; XRP remains under review.'
			}));
			let service = new TradingDecision(client, { err() {} });
			let decision = await service.evaluate({ candidates: [{ name: 'XRP', candidateGrade: 1 }] });

			assert.equal(decision.action, 'BUY');
			assert.equal(decision.confidence, 0.72);
			assert.equal(client.memo, 'BTC is neutral; XRP remains under review.');
			assert.equal(client.saved, true);
		});

		it('should reject an invalid action', async () => {
			let client = new FakeOpenRouterClient(JSON.stringify({
				action: 'BUY_ALL',
				confidence: 1,
				horizon: 'short',
				reason: 'Invalid test.',
				memo: 'Test memo.'
			}));
			let service = new TradingDecision(client, { err() {} });

			await assert.rejects(() => service.evaluate({ candidates: [] }), /Invalid trading action/);
		});
	});
})();
