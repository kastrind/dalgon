import { isEmpty } from './utils.js';

class AssetInfo {

	constructor(assetName, loggerObj, simulationMode, response) {
		this.assetName = assetName;
		this.l = loggerObj;
		this.simulationMode = simulationMode;

		this.aClass = response.aclass;
		this.altName = response.altname;
		this.decimals = response.decimals;
		this.displayDecimals = response.display_decimals;

		this.response = response;
	}

	static async request(assetInfoRequest, requestParamsObj, loggerObj, simulationMode=false, simObj={}) {
		let responseBody = {};
		await assetInfoRequest(requestParamsObj, simObj).then(s => responseBody = JSON.parse(s.body));
		if (!isEmpty(responseBody) && responseBody.result && Object.keys(responseBody.result).length > 0) {
			let assets = [];
			for (let asset in responseBody.result) {
				assets.push(new AssetInfo(asset, loggerObj, simulationMode, responseBody.result[asset]));
			}
			return assets;
		}
		return [];
	}

}

export default AssetInfo;