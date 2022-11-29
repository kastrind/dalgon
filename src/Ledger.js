import { sleep, isEmpty } from './utils.js';

class Ledger {

	constructor(timeTolerance, baseCurrency, loggerObj, simulationMode, response) {
		this.timeTolerance = timeTolerance;
		this.baseCurrency = baseCurrency;
		this.l = loggerObj;
		this.simulationMode = simulationMode;
		this.ledgerJsonResponse = response;
		this.ledgerGroups = {};
		this.assetInfo = {};
	}

	static async request(ledgerInfoRequest, ledgerInfoRequestParamsObj, timeTolerance, baseCurrency, loggerObj, simulationMode=false, simObj={}) {
		let responseBody = {};
		let requestNext = (function () {
			return async function () {
				await ledgerInfoRequest(ledgerInfoRequestParamsObj, simObj).then(s => {responseBody = JSON.parse(s.body); loggerObj.w(JSON.stringify(responseBody, null, 2), 0, true);});
				if (!isEmpty(responseBody) && responseBody.result.ledger && Object.keys(responseBody.result.ledger).length > 0)  {
					ledgerInfoRequestParamsObj.ofs += Object.keys(responseBody.result.ledger).length;
					return responseBody;
				}
				return;
			};
		})();
		let mergedResponse = {};
		let isFirstRequest = true;
		while ((responseBody = await requestNext())) {
			if (simulationMode) { mergedResponse = responseBody; break; }
			
			await sleep(3000);

			if (isFirstRequest) { isFirstRequest = false; mergedResponse = responseBody; continue; }

			mergedResponse.result.ledger = Object.assign(mergedResponse.result.ledger, responseBody.result.ledger);

		}
		return new Ledger(timeTolerance, baseCurrency, loggerObj, simulationMode, mergedResponse);
	}

	groupLedgerEntries() {
		this.l.i(`Grouping ledger entries - start`);
		let ledgerGroups = {};

		for (let key in this.ledgerJsonResponse.result.ledger) {
			let entry = this.ledgerJsonResponse.result.ledger[key];
			this.l.d(`Current ${key} with time ${entry.time}`, 1);

			if (isEmpty(ledgerGroups)) {
				ledgerGroups[key] = [entry];
				this.l.d(`Created ledger group ${key} for entry ${JSON.stringify(entry, null, 2)}`, 2);
			}else {
				let isInserted = false;
				for (let gkey in ledgerGroups) {
					let groupEntry = ledgerGroups[gkey];
					if (parseFloat(groupEntry[0].time) < parseFloat(entry.time) + this.timeTolerance &&
						parseFloat(groupEntry[0].time) > parseFloat(entry.time) - this.timeTolerance) {
						this.l.d(`Inserted ${key} to group ${gkey}`, 2);
						ledgerGroups[gkey].push(entry);
						isInserted = true;
						break;
					}
				}
				if (!isInserted) {
					ledgerGroups[key] = [entry];
					this.l.d(`Created ledger group ${key} for entry ${JSON.stringify(entry, null, 2)}`, 2);
				}
			}
		}
		this.ledgerGroups = ledgerGroups;
		this.l.d(`Ledger group results: ${JSON.stringify(this.ledgerGroups, null, 2)}`);
		this.l.i(`Grouping ledger entries - end`);
		return ledgerGroups;
	}

	getAssetPurchaseInfo() {
		this.l.i(`Collecting asset purchase info - start`);
		let assetPurchaseInfo = {};

		for (let key in this.ledgerGroups) {
			let ledgerGroup = this.ledgerGroups[key];
			this.l.d(`Current ledger group: ${key}`, 1);
			let sumFees = 0;
			sumFees = ledgerGroup.filter(entry => parseFloat(entry.fee) > 0 && entry.asset === this.baseCurrency + ".HOLD").reduce((acc, curr) => parseFloat(acc) + parseFloat(curr.fee), 0);
			let assetEntry = ledgerGroup.find(entry => entry.type === "receive");
			let depositEntry = ledgerGroup.find(entry => entry.type === "deposit");
			if (!isEmpty(assetEntry) && !isEmpty(depositEntry)) {
				let asset = assetEntry.asset;
				let amount = parseFloat(assetEntry.amount);
				let deposit = parseFloat(depositEntry.amount);
				let assetPurchaseInfoEntry = {"amount": amount, "baseFees": sumFees, "baseDeposit": deposit };
				if (isEmpty(assetPurchaseInfo[asset])) assetPurchaseInfo[asset] = [assetPurchaseInfoEntry];
				else assetPurchaseInfo[asset].push(assetPurchaseInfoEntry);
				this.l.d(`Purchase info: ${JSON.stringify(assetPurchaseInfoEntry, null, 2)} mapped to asset ${asset}`, 2);
			}else {
				continue;
			}
		}

		this.assetInfo = assetPurchaseInfo;
		this.l.d(`Asset purchase info results: ${JSON.stringify(assetPurchaseInfo, null, 2)}`);
		this.l.i(`Collecting asset purchase info - end`);
		return assetPurchaseInfo;
	}

	reportPurchaseInfo() {
		let report = '';
		let sumAmount;
		let sumBaseFees;
		let sumBaseDeposit;
		let sumBaseFeesAllAssets = 0;
		let sumBaseDepositAllAssets = 0;
		for (let asset in this.assetInfo) {
			sumAmount = 0;
			sumBaseFees = 0;
			sumBaseDeposit = 0;
			this.assetInfo[asset].forEach(entry => {
				sumAmount += entry.amount;
				sumBaseFees += entry.baseFees;
				sumBaseDeposit += entry.baseDeposit;
			});
			report += `${asset}: total ${sumAmount} from ${sumBaseDeposit}${this.baseCurrency} and ${sumBaseFees}${this.baseCurrency} fees.\n`;
			sumBaseFeesAllAssets += sumBaseFees;
			sumBaseDepositAllAssets += sumBaseDeposit;
		}
		report += `\nSpent total: ${sumBaseDepositAllAssets}${this.baseCurrency} and ${sumBaseFeesAllAssets}${this.baseCurrency} in fees.`;
		return report;
	}

	getAssetDepositInfo() {
		this.l.i(`Collecting asset deposit info - start`);
		let assetDepositInfo = {};

		for (let key in this.ledgerGroups) {
			let ledgerGroup = this.ledgerGroups[key];
			this.l.d(`Current ledger group: ${key}`, 1);
			let sumFees = 0;
			sumFees = ledgerGroup.filter(entry => parseFloat(entry.fee) > 0 && entry.asset === this.baseCurrency + ".HOLD").reduce((acc, curr) => parseFloat(acc) + parseFloat(curr.fee), 0);
			let depositEntry = ledgerGroup.find(entry => entry.type === "deposit");
			if (!isEmpty(depositEntry)) {
				let asset =  depositEntry.asset;
				let amount = parseFloat(depositEntry.amount);
				let assetDepositInfoEntry = {"amount": amount, "baseFees": sumFees };
				if (isEmpty(assetDepositInfo[asset])) assetDepositInfo[asset] = [assetDepositInfoEntry];
				else assetDepositInfo[asset].push(assetDepositInfoEntry);
				this.l.d(`Deposit info: ${JSON.stringify(assetDepositInfoEntry, null, 2)} mapped to asset ${asset}`, 2);
			}else {
				continue;
			}
		}

		this.assetInfo = assetDepositInfo;
		this.l.d(`Asset deposit info results: ${JSON.stringify(assetDepositInfo, null, 2)}`);
		this.l.i(`Collecting asset deposit info - end`);
		return assetDepositInfo;
	}

	reportDepositInfo() {
		let report = '';
		let sumAmount;
		let sumBaseFees;
		let sumBaseBalance;
		let sumBaseFeesAllAssets = 0;
		for (let asset in this.assetInfo) {
			sumAmount = 0;
			sumBaseFees = 0;
			sumBaseBalance = 0;
			this.assetInfo[asset].forEach(entry => {
				sumAmount += entry.amount;
				sumBaseFees += entry.baseFees;
			});
			report += `${asset}: total ${sumAmount} of which ${sumBaseFees}${this.baseCurrency} were fees.\n`;
			sumBaseFeesAllAssets += sumBaseFees;
		}
		return report;
	}

}

export default Ledger;