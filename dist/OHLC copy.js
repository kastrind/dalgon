import { isEmpty } from './utils.js';

class OHLC {
  constructor(assetPair, loggerObj, simulationMode, response) {
    this.assetPair = assetPair;
    this.l = loggerObj;
    this.simulationMode = simulationMode;
    this.OHLCJsonResponse = response;
  }

  static async request(OHLCRequest, OHLCRequestParamsObj, loggerObj, simulationMode = false, simObj = {}) {
    let response = {};
    await OHLCRequest(OHLCRequestParamsObj, simObj).then(s => response = JSON.parse(s.body));

    if (!isEmpty(response) && response.result && Object.keys(response.result).length > 0) {
      return new OHLC(OHLCRequestParamsObj.searchParams.pair, loggerObj, simulationMode, response.result);
    }

    return null;
  }

}

export default OHLC;
//# sourceMappingURL=OHLC copy.js.map