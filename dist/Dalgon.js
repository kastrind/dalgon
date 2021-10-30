import got from 'got';
import crypto from 'crypto';
import qs from 'qs';
import { isOK } from './utils.js';

class Dalgon {
  constructor(apiKey, privateAPIKey, loggerObj, simulationMode) {
    this.host = "https://api.kraken.com";
    this.apiKey = apiKey;
    this.privateAPIKey = privateAPIKey;
    this.path = "";
    this.params = {
      nonce: new Date() * 1000
    };
    this.options = {};
    this.nonce = 0;
    this.l = loggerObj;
    this.simulationMode = simulationMode;
  }

  createPublicFunction(path, infoMsg) {
    var that = this;
    return async function (paramsObj, simObj = {}) {
      that.l.i(infoMsg);
      that.path = path;
      that.params = paramsObj;
      that.l.d(`Params ${that.params}`, 1);

      if (!that.simulationMode) {
        that.response = await got(that.host + that.path, that.params).json();
        that.l.d(`Response: ${JSON.stringify(JSON.parse(that.response.body), null, 2)}`, 1);
        if (isOK(that.response.statusCode)) that.l.suc(`Response status for ${infoMsg}: ${that.response.statusCode}`);else that.l.err(`Response status for ${infoMsg}: ${that.response.statusCode}`);
        return that.response;
      } else {
        return simObj;
      }
    };
  }

  createPrivateFunction(path, headerObj, infoMsg) {
    var that = this;
    return async function (paramsObj, simObj = {}) {
      that.l.i(infoMsg);
      that.nonce = new Date() * 1000;
      that.params = {
        nonce: that.nonce
      };

      for (var key in paramsObj) {
        if (paramsObj.hasOwnProperty(key)) {
          that.params[key] = paramsObj[key];
        }
      }

      that.path = path;
      let apiSign = that.getMessageSignature(that.path, that.params, that.privateAPIKey, that.nonce);
      that.options = {
        headers: {
          'API-Key': that.apiKey,
          'API-Sign': apiSign
        },
        body: qs.stringify(that.params)
      };

      for (key in headerObj) {
        if (headerObj.hasOwnProperty(key)) {
          that.options.headers[key] = headerObj[key];
        }
      }

      that.l.d(`Params: ${that.options.body}`, 1);

      if (!that.simulationMode) {
        that.response = await got.post(that.host + that.path, that.options);
        that.l.d(`Response: ${JSON.stringify(JSON.parse(that.response.body), null, 2)}`, 1);
        if (isOK(that.response.statusCode)) that.l.suc(`Response status for ${infoMsg}: ${that.response.statusCode}`);else that.l.err(`Response status for ${infoMsg}: ${that.response.statusCode}`);
        return that.response;
      } else {
        that.l.i(`Simulated response for ${infoMsg}: ${simObj}`, 1);
        return simObj;
      }
    };
  }

  getMessageSignature(path, request, secret, nonce) {
    const message = qs.stringify(request);
    const secret_buffer = Buffer.alloc(Buffer.byteLength(secret, "base64"), secret, 'base64'); //const secret_buffer = new Buffer(secret, 'base64');

    const hash = new crypto.createHash('sha256');
    const hmac = new crypto.createHmac('sha512', secret_buffer);
    const hash_digest = hash.update(nonce + message).digest('binary');
    const hmac_digest = hmac.update(path + hash_digest, 'binary').digest('base64');
    return hmac_digest;
  }

  async test() {
    return this.greeting = await Promise.resolve("Hello, just a test.");
  }

}

export default Dalgon;
//# sourceMappingURL=Dalgon.js.map