import { downloadAll } from './data.js';
import { parseArgs, dataDir, pairsOf } from './config.js';

let args = parseArgs(process.argv.slice(2));
await downloadAll({ dir: dataDir(args), pairs: pairsOf(args), from: args.from, to: args.to });
