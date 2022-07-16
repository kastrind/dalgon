import PropertiesReader from 'properties-reader';
import Dalgon from '../src/Dalgon.js';
import OHLC from '../src/OHLC.js';
import Logger from '../src/Logger.js';
import { isEmpty } from '../src/utils.js';
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// constants
var ENV = 'default';
var PRIVATEAPIKEY = "NO_KEY_NEEDED_BECAUSE_ENDPOINT IS PUBLIC";
var VERBOSE = false;
var DEBUG = false;
var SIMULATION = false;

// load config file
var properties = new PropertiesReader(`./test/env/${ENV}.properties`);
// load config properties
var APIKEY = properties.get("main.APIKEY");

// logger
var l = new Logger(VERBOSE, DEBUG);



// dalgon instance
var dalgon = new Dalgon(APIKEY, PRIVATEAPIKEY, l, SIMULATION);
var getOHLC = dalgon.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');

(async function () {
	let maxNumResults = properties.get("ohlc.MAX_NUM_RESULTS");
	let ohlc;
	let d = new Date();
	d.setHours(d.getHours() - 24);
	describe('OHLC Test', () => {
		it('should create OHLC instance', async () => {
			ohlc = await (OHLC.request(getOHLC, "MANAEUR", d.toISOString(), maxNumResults, l, SIMULATION));
			assert.equal(isEmpty(ohlc), false);
		});

		it('should have ticks with the expected properties', async () => {
			let tickPropsExpected = ['time', 'date', 'open', 'high', 'low', 'close', 'volWavgPrice', 'vol', 'count'];
			tickPropsExpected.forEach(elem => { assert.equal(ohlc.ticks[0].hasOwnProperty(elem), true); });
		});
		
		it('should have 288 ticks for 24h and 5 min interval', async () => {
			assert.equal(ohlc.ticks.length, 288);
		});

		it('should have 720 ticks for 1 month interval', async () => {
			let d = new Date();
			d.setHours(d.getHours() - 24*30);
			let ohlc_month = await (OHLC.request(getOHLC, "MANAEUR", d.toISOString(), maxNumResults, l, SIMULATION));
			assert.equal(ohlc_month.ticks.length, 720);
		});

		it('should calculate correct metrics', async () => {
			let simulation = true;
			let dalgonSim = new Dalgon(APIKEY, PRIVATEAPIKEY, l, simulation);
			const ohlcSimResponseJson = require('./assets/OHLC.sim.response.json');
			let getOHLCSim = dalgonSim.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');
			let ohlcSim = await (OHLC.request(getOHLCSim, "MANAEUR", d.toISOString(), maxNumResults, l, simulation, { body: JSON.stringify(ohlcSimResponseJson) } ));
			//console.log(ohlcSim);
			assert.equal(ohlcSim.getChange(), -0.06092566826494408);
			assert.equal(ohlcSim.getHighest().high, 3.87468);
			assert.equal(ohlcSim.getHighestClose().close, 3.8619);
			assert.equal(ohlcSim.getLowest().low, 3.41753);
			assert.equal(ohlcSim.getLowestClose().close, 3.42484);
			assert.equal(ohlcSim.getMinVol(), 0);
			assert.equal(ohlcSim.getMaxVol(), 87344.26547723);
		});

		it('should calculate correct EMA and MACD', async () => {
			let simulation = true;
			let dalgonSim = new Dalgon(APIKEY, PRIVATEAPIKEY, l, simulation);
			const ohlcSimResponseJson = require('./assets/OHLC.sim.response.for.MACD.json');
			let getOHLCSim = dalgonSim.createPublicFunction('/0/public/OHLC', 'Request for Get OHLC Data');
			let maxNumResults = 10;
			let ohlcSim = await (OHLC.request(getOHLCSim, "MANAEUR", d.toISOString(), maxNumResults, l, simulation, { body: JSON.stringify(ohlcSimResponseJson) } ));
			let a = 4;
			let b = 7;
			let c = 3;
			let ema_a = ohlcSim.getEMA(a, null, 0, 'close');
			// console.log("ema_a: "+ema_a);
			assert.equal(ema_a, 9.095588235294116);

			let ema_b = ohlcSim.getEMA(b, null, 0, 'close');
			// console.log("ema_b: "+ema_b);
			assert.equal(ema_b, 8.078326406987392);

			let ema_c_from_macd = [1.017261828306725, 1.017261828306724, 1.017261828306724].getEMA(c, null, 0, null);
			// console.log("ema_c_from_macd: "+ema_c_from_macd);
			assert.equal(ema_c_from_macd, 1.0172618283067243);

			let ema_b3 = ohlcSim.getEMA(b, null, 3, 'close');
			// console.log("ema_b3: "+ema_b3);
			assert.equal(ema_b3, 5.078326406987392);

			let ema_b3_from_array = [1,2,3,4,5,6,7,8,9,10].getEMA(b, null, 3, null);
			// console.log("ema_b3_from_array: "+ema_b3_from_array);
			assert.equal(ema_b3_from_array, 5.078326406987392);

			let macd = ohlcSim.getMACD(a, b, c, null, 0, 'close');
			// console.log("macd: "+macd);
			assert.equal(macd, -2.220446049250313e-16);
		});

	});
	
})();
