import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

// --assets "XRP,ADA,SOL" selects what is traded; BTC is always loaded as well because the analysis gates entries on it.
export function assetsOf(args) {
	return String(args.assets).split(/[ ,]+/).filter(Boolean);
}

export function pairsOf(args) {
	return [...new Set([...assetsOf(args), 'BTC'])].map(asset => `${asset}${args.quote}`);
}

// --key value pairs; numeric values are converted, so --stopLossPercent 2 overrides a strategy parameter.
export function parseArgs(argv) {
	let args = { quote: 'USDC', assets: 'XRP,ADA,SOL', from: '2022-01', to: '2026-10', step: 15 };
	for (let i = 0; i < argv.length; i++) {
		if (!argv[i].startsWith('--')) continue;
		let key = argv[i].slice(2);
		let next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
		args[key] = next !== '' && Number.isFinite(Number(next)) && !/^\d{4}-\d{2}$/.test(next) ? Number(next) : next;
		i++;
	}
	return args;
}

export function dataDir(args) {
	return path.join(here, 'data', args.quote);
}

export function cacheDir(args) {
	return path.join(here, 'cache', args.quote);
}
