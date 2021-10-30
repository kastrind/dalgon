import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';

const optionDefinitions = [
	{ name: 'help', alias: 'h', type: Boolean, description: 'Display this usage guide'},
	{ name: 'verbose', alias: 'v', type: Boolean, description: "Set verbose mode"},
	{ name: 'debug', alias: 'd', type: Boolean, description: "Produce output for debugging"},
	{ name: 'setEnv', type: String, defaultOption: 'default',  typeLabel: '<env>', description: "Load settings for environment by the name prepending the .properties file in the env directory"},
	{ name: 'privAPIKey', alias: 'p', type: String, typeLabel: '<key>', description: "The private API key" },
	{ name: 'simulation', alias: 's', type: Boolean, description: "Simulation mode"},
];

const options = commandLineArgs(optionDefinitions);
if (options.help) {
	const usage = commandLineUsage([
		{ header: 'Dalgon', content: 'A Kraken API client and trading algorithm.'},
		{ header: 'Options', optionList: optionDefinitions
	},
	{ content: 'Project home: {underline https://github.com/kastrind/dalgon}' }
	]);
	console.log(usage);

} else {
	//console.log(options);
}

export { options };