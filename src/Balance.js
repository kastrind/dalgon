import { isEmpty } from './utils.js';

class Balance {

	constructor(loggerObj, simulationMode, response) {
		this.l = loggerObj;
		this.simulationMode = simulationMode;
		this.balanceJsonResponse = response;
	}

	static async request(balanceRequest, loggerObj, simulationMode=false, simObj={}) {
		let responseBody = {};
		await balanceRequest({}, simObj).then(s => responseBody = JSON.parse(s.body));
		if (!isEmpty(responseBody) && responseBody.result && Object.keys(responseBody.result).length > 0) {
			return new Balance(loggerObj, simulationMode, responseBody.result);
		}
		return null;
	}

}

export default Balance;