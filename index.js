#!/usr/bin/env node

var program = require('commander');
var serialport = require('serialport');
var inquirer = require('inquirer');
var pkg = require('./package.json');
var serverMain = require('./src/pendant');

var options = {};

program
	.version(pkg.version)
	.usage('-p <port> [options]')
	.option('-l, --list', 'list available ports then exit')
	.option('-p, --port <port>', 'path or name of serial port')
	.option('-b, --baudrate <baudrate>', 'baud rate', 115200)
	.option('-t, --controller-type <type>', 'controller type: Grbl|Smoothie|TinyG|Marlin', 'Grbl')
    .option('-s, --secret <secret>', 'the secret key stored in the ~/.cncrc file')
	.option('--socket-address <address>', 'socket address or hostname', 'localhost')
	.option('--socket-port <port>', 'socket port', 8000)
    .option('--access-token-lifetime <lifetime>', 'access token lifetime in seconds or a time span string', '30d')
    .option('--clone', 'use when you have a clone ps3 controller and are getting write errors')
    .option('-v, --verbose', 'display verbose (debugging) messages')
    .option('-f, --fake-socket', 'use a fake socket server and display cncjs messages to console instead');
program.parse(process.argv);

var options = {
    list: program.list,
    secret: program.secret,
    port: program.port,
    baudrate: program.baudrate,
    socketAddress: program.socketAddress,
    socketPort: program.socketPort,
    controllerType: program.controllerType,
    accessTokenLifetime: program.accessTokenLifetime,
    clone: program.clone,
    verbose: program.verbose,
    fakeSocket: program.fakeSocket
};

if (options.list) {
    console.log('Available serial ports:');
	serialport.list(function(err, ports) {
		if (err) {
			console.error(err);
			process.exit(1);
		}
		ports.forEach(function(port) {
			console.log(port.comName);
		});
	});
	return;
}

var createServer = function(options) {
    serverMain(options, function(err, socket) {});
};

if (options.port || options.fakeSocket) {
    createServer(options);
    return;
}

serialport.list(function(err, ports) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    const choices = ports.map(function(port) {
        return port.comName;
    });

    console.log('For list of available options, use --help\n');

    inquirer.prompt([{
        type: 'list',
        name: 'port',
        message: 'Specify which port you want to use?',
        choices: choices
    }]).then(function(answers) {
        options.port = answers.port;

        createServer(options);
    });
});
