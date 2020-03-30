#!/usr/bin/env node

// Node.js Playstation 3 / DS3 Controller for CNC.js
// by Austin St. Aubin <austinsaintaubin@gmail.com>
// v1.0.9 BETA [2017/03/27]
// modified by Chris Midgley <chris@koose.com> for Marlin, and several improvements/bug fixes
// https://github.com/cheton/cnc/issues/103
// [PS3 CNC Control Button Map](https://docs.google.com/drawings/d/1DMzfBk5DSvjJ082FrerrfmpL19-pYAOcvcmTbZJJsvs/edit?usp=sharing)
// USAGE: ./cncjs-pendant-ps3 -p "/dev/ttyUSB0"

// [Dependacies]
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');  // Socket.io connection to CNC
const jwt = require('jsonwebtoken');
const get = require('lodash.get');
const HID = require('node-hid');
const dualShock = require('dualshock-controller'); // https://www.npmjs.com/package/dualshock-controller

// [Varables]
// =====================================================

// [Functions]
// =====================================================

// Generate Token
const generateAccessToken = function(payload, secret, expiration) {
    const token = jwt.sign(payload, secret, {
        expiresIn: expiration
    });

    return token;
};

// Get secret key from the config file and generate an access token
const getUserHome = function() {
    return process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
};

// Pass User Defined Options
module.exports = function(options, callback) {
	
	// handles sending messages to the cncjs socket server, or displaying on screen when using --fakeSocket option
	const sendMessage = function(eventName, a1, a2, a3) {
		if (options.fakeSocket) {
			if (eventName == 'open')
				console.log('Socket: Open port ' + a1 + ' at ' + a2.baudrate + 'bps for controller ' + a2.controllerType);
			else if (eventName == 'command') {
				if (a2 == 'gcode')
					console.log("Socket: Gcode " + a3);
				else
					console.log("Socket: Command " + a2);
			}
			else 
				console.log('Socket: Unknown command ' + eventName + ": " + a2 + ", " + a3);
		}
		else
			socket.emit(eventName, a1, a2, a3, a4, a5);
	}

	// handle receiving messages from cncjs socket server, or faking out for --fakeSocket option
	const receiveMessage = function(msg, callback) {
		if (!options.fakeSocket)
			socket.on(msg, callback);
		else
			console.log('Listener set up for ' + msg + ': ignored; --fakeSocket option used');
	}

    var pendant_started = false;

    // [Function] check for controller to connect (show up in devices), then start services. Kill services on disconect.
	setInterval(checkController, 1000);
	firstCheck = true;
	function checkController(socket, controller) {
		// if we already have a pendant, ignore this as we don't need to try to (re)connect
		if (pendant_started)
			return;

		// Get HID Devices
		var devices = HID.devices();
		if (options.verbose) {
			console.log("Devices discovered:");
			console.log(devices);
		}

		// Find DualShock 3 Controller HID
		devices.forEach(function(device) {
			// Detect DualShock 3 Controller HID
			if (!pendant_started && (device.vendorId == 1356 && device.productId == 616)) {
				console.log("Pendant " + device.vendorId + " | " + device.productId + " connected");
				
				// Start Socket Connection & Controller Conection
				pendant_started = true;
				connectPendant();
			}
		});

		// if the first attempt, and no controllers found, tell the user they may need to press the PS button
		if (firstCheck && !pendant_started) {
			console.log("No PS3 controllers found");
			console.log("Make sure your controller is connected by pressing the PS button in the center of the controller");
			firstCheck = false;
		}
	}

	// ###########################################################################
	// Start Socket Connection & Controller Conection
	function connectPendant () {
		if (!options.secret) {
	        const cncrc = path.resolve(getUserHome(), '.cncrc');
	        try {
	            const config = JSON.parse(fs.readFileSync(cncrc, 'utf8'));
	            options.secret = config.secret;
	        } catch (err) {
	            console.error(err);
	            process.exit(1);
	        }
	    }

	    const token = generateAccessToken({ id: '', name: 'cncjs-pendant' }, options.secret, options.accessTokenLifetime);
	    const url = 'ws://' + options.socketAddress + ':' + options.socketPort + '?token=' + token;

		if (options.fakeSocket)
			console.log('Socket connect to ws://' + options.socketAddress + ':' + options.socketPort + ' ignored; --fakeSocket option used');
		else {
			if (options.verbose)
				console.log('Attempting connect to ws://' + options.socketAddress + ':' + options.socketPort);
		    socket = io.connect('ws://' + options.socketAddress + ':' + options.socketPort, {
				'query': 'token=' + token
			});
		}

		// cncjs sent us a 'connect' message, saying that we successfully are communicating
	    receiveMessage('connect', () => {
			if (options.verbose)
		        console.log('Connected to ' + url);

			// Open port to the CNC controller (command 'open')
			if (options.verbose)
				console.log('Sending open request for ' + options.port + ' at baud rate ' + options.baudrate);

			sendMessage('open', options.port, {
				baudrate: Number(options.baudrate),
				controllerType: options.controllerType
			});
	    });

		// cncjs sent us an 'error' message.  Not much we can do but report it and kill our connection.
	    receiveMessage('error', (err) => {
	        console.error('Error message received from cncjs - killing connection');
	        if (socket) {
				if (!options.fakeSocket)
	            	socket.destroy();
	            socket = null;
	        }
	    });

		// connection closed message received
	    receiveMessage('close', () => {
			if (options.verbose)
		        console.log('Connection closed.');
	    });

		// our serial port open request has completed
	    receiveMessage('serialport:open', function(options) {
	        console.log('Connected to port "' + options.port + '" (Baud rate: ' + options.baudrate + ')');
	        callback(null, socket);
	    });

		// we got an error attempting to open the serial port
	    receiveMessage('serialport:error', function(options) {
	        callback(new Error('Error opening serial port "' + options.port + '"'));
	    });

		/*
	    receiveMessage('serialport:read', function(data) {
	        console.log((data || '').trim());
	    });
		*/

	    /*
	    receiveMessage('serialport:write', function(data) {
	        console.log((data || '').trim());
	    });
	    */

		// =====================================================
		// Play Station 3 Controller / Game Pad
		// https://www.npmjs.com/package/dualshock-controller
		// var dualShock = require('dualshock-controller');

		// pass options to init the controller.
		// var controller = dualShock(
		controller = dualShock(
			 {
				  // you can use a ds4 by uncommenting this line.
				  // config: "dualshock4-generic-driver",
				  // if using ds4 comment this line.
				  config : "dualShock3",
				  // smooths the output from the acelerometers (moving averages) defaults to true
				  accelerometerSmoothing : true,
				  // smooths the output from the analog sticks (moving averages) defaults to false
				  analogStickSmoothing : false // DO NOT ENABLE, does not return sticks to center when enabled. 128 x 128
			 });

		// make sure you add an error event handler
		// controller.on('connection:change', data => console.log("conection" + data));

		controller.on('connected', function(state) {
			if (options.verbose)
				console.log('Controller connected: ' + state);
		});

		controller.on('error', function(err) {
			console.log("Controller error: " + err);
			// indicate that we have lost the pendant
			pendant_started = false;
			firstCheck = true;
			//controller.close();  // Not a function currently, have to kill program.
			//controller.destroy();

			// used to kill the process, now we attempt to reconnect to the pendant
			//process.exit();  // Kill Program
		});

		// ------------------------------------------

		// Safety Switches & Modifyers
		ps3_led = 0b10000;
		ps3_rumble_left = 0;
		ps3_rumble_right = 0;

		// psx
		var psx = false;
		controller.on('psxButton:press', function(data) {
			psx = true;
			if (options.verbose)
				console.log(data + '|' + psx);
		});
		controller.on('psxButton:release', function(data) {
			psx = false;
			if (options.verbose)
				console.log(data + '|' + psx);
		});

		// L1
		var l1 = false;
		controller.on('l1:press', function(data) {
			l1 = true;
			if (options.verbose)
				console.log(data + '|' + l1);
		});
		controller.on('l1:release', function(data) {
			l1 = false;
			if (options.verbose)
				console.log(data + '|' + l1);
		});

		// R1
		var r1 = false;
		controller.on('r1:press', function(data) {
			r1 = true;
			if (options.verbose)
				console.log(data + '|' + r1);
		});
		controller.on('r1:release', function(data) {
			r1 = false;
			if (options.verbose)
				console.log(data + '|' + r1);
		});

		// L2
		var l2 = false;
		controller.on('l2:press', function(data) {
			l2 = true;
			if (options.verbose)
				console.log(data + '|' + l2);
		});
		controller.on('l2:release', function(data) {
			l2 = false;
			if (options.verbose)
				console.log(data + '|' + l2);
		});

		// R2
		var r2 = false;
		controller.on('r2:press', function(data) {
			r2 = true;
			if (options.verbose)
				console.log(data + '|' + r2);
		});
		controller.on('r2:release', function(data) {
			r2 = false;
			if (options.verbose)
				console.log(data + '|' + r2);
		});

		// Unlock
		controller.on('start:press', function(data) {
			if (psx) {
				sendMessage('command', options.port, 'unlock');
			}
		});

		// Reset
		controller.on('select:press', function(data) {
			if (psx) {
				sendMessage('command', options.port, 'reset');
			}
		});


		// Cyclestart
		controller.on('start:press', function(data) {
			if (!psx) {
				sendMessage('command', options.port, 'cyclestart');
			}
		});

		// Feedhold
		controller.on('select:press', function(data) {
			if (!psx) {
				sendMessage('command', options.port, 'feedhold');
			}
		});

		// ------------------------------------------
		// Default

		// Start
		controller.on('triangle:press', function(data) {
			if (!r1 && !l1 && !psx) {
				sendMessage('command', options.port, 'start');
				if (options.verbose)
					console.log('cyclestart:' + data);
			}
		});

		// Stop
		controller.on('square:press', function(data) {
			if (!r1 && !l1 && !psx) {
				sendMessage('command', options.port, 'stop');
				if (options.verbose)
					console.log('feedhold:' + data);
			}
		});


		// Pause
		controller.on('circle:press', function(data) {
			if (!r1 && !l1 && !psx) {
				sendMessage('command', options.port, 'pause');
				if (options.verbose)
					console.log('pause:' + data);
			}
		});

		// Resume
		controller.on('x:press', function(data) {
			if (!r1 && !l1 && !psx) {
				sendMessage('command', options.port, 'resume');
				if (options.verbose)
					console.log('unlock:' + data);
			}
		});

		// ------------------------------------------
		// R1

		// Raise Z
		controller.on('triangle:press', function(data) {
			if (r1) {
				move_z_axis += 0.25;
			}
		});
		controller.on('triangle:hold', function(data) {
			if (r1) {
				move_z_axis += 0.25;
			}
		});
		controller.on('triangle:release', function(data) {
			if (r1) {
				move_z_axis = 0;
			}
		});

		// Probe
		controller.on('square:press', function(data) {
			if (r1) {
				sendMessage('command', options.port, 'gcode', 'G91');
				sendMessage('command', options.port, 'gcode', 'G38.2 Z-15.001 F120');
				sendMessage('command', options.port, 'gcode', 'G90');
				sendMessage('command', options.port, 'gcode', 'G10 L20 P1 Z15.001');
				sendMessage('command', options.port, 'gcode', 'G91');
				sendMessage('command', options.port, 'gcode', 'G0 Z3');
				sendMessage('command', options.port, 'gcode', 'G90');

				if (options.verbose)
					console.log('probe:' + data);
			}
		});

		// Lower Z (Slow)
		controller.on('circle:press', function(data) {
			if (r1) {
				move_z_axis -= 0.05;
			}
		});
		controller.on('circle:hold', function(data) {
			if (r1) {
				move_z_axis -= 0.05;
			}
		});
		controller.on('circle:release', function(data) {
			if (r1) {
				move_z_axis = 0;
			}
		});

		// Lower Z
		controller.on('x:press', function(data) {
			if (r1) {
				move_z_axis -= 0.25;
			}
		});
		controller.on('x:hold', function(data) {
			if (r1) {
				move_z_axis -= 0.25;
			}
		});
		controller.on('x:release', function(data) {
			if (r1) {
				move_z_axis = 0;
			}
		});

/*
		// ------------------------------------------
		// R2

		// Triangle
		controller.on('triangle:press', function(data) {
			if (r2) {
				sendMessage('command', options.port, '');
			}
		});

		// Square
		controller.on('square:press', function(data) {
			if (r2) {
				sendMessage('command', options.port, '');
			}
		});

		// Circle
		controller.on('circle:press', function(data) {
			if (r2) {
				sendMessage('command', options.port, '');
			}
		});

		// X
		controller.on('x:press', function(data) {
			if (r2) {
				sendMessage('command', options.port, '');
			}
		});
*/


		// ------------------------------------------
		// PSX

		// M7
		controller.on('triangle:press', function(data) {
			if (psx) {
				sendMessage('command', options.port, 'gcode', 'M7');
			}
		});

		// M9
		controller.on('square:press', function(data) {
			if (psx) {
				sendMessage('command', options.port, 'gcode', 'M9');
			}
		});

		// M8
		controller.on('circle:press', function(data) {
			if (psx) {
				sendMessage('command', options.port, 'gcode', 'M8');
			}
		});

		// Home
		controller.on('x:press', function(data) {
			if (psx) {
				sendMessage('command', options.port, 'homing');
			}
		});


		// ------------------------------------------

	/*
		// Raise Z
		controller.on('triangle:press', function(data) {
			if (psx) {
				sendMessage('command', options.port, 'gcode', 'G91 G0 Z0.1'); // Switch to relative coordinates, Move one unit right in X and one unit right in Y
				sendMessage('command', options.port, 'gcode', 'G90');  // Switch back to absolute coordinates

				console.log('Raising Z:' + data);
			}
		});

		//
		controller.on('square:press', function(data) {
			if (psx) {

			}
		});


		// Probe
		controller.on('circle:press', function(data) {
			if (psx) {
				sendMessage('command', options.port, 'gcode', 'G91');
				sendMessage('command', options.port, 'gcode', 'G38.2 Z-15.001 F120');
				sendMessage('command', options.port, 'gcode', 'G90');
				sendMessage('command', options.port, 'gcode', 'G10 L20 P1 Z15.001');
				sendMessage('command', options.port, 'gcode', 'G91');
				sendMessage('command', options.port, 'gcode', 'G0 Z3');
				sendMessage('command', options.port, 'gcode', 'G90');

				console.log('probe:' + data);
			}
		});

		// Lower Z
		controller.on('x:hold', function(data) {
			if (psx) {
				sendMessage('command', options.port, 'gcode', 'G91 G0 Z-0.1'); // Switch to relative coordinates, Move one unit right in X and one unit right in Y
				sendMessage('command', options.port, 'gcode', 'G90');  // Switch back to absolute coordinates

				console.log('Lowering Z:' + data);
			}
		});
	*/

		// ------------------------------------------

		// ==[ D Pad ]==
		var move_x_axis = 0;
		var move_y_axis = 0;
		var move_z_axis = 0;

		// Set Movement of Gantry Based on DPad, and Z-Input from other buttons
		function dpad(axis, direction, name) {
			if (l2) {
				// Fast
				dpadSetAxisMovment(axis, direction, 3);
			} else if (l1) {
				// Slow
				dpadSetAxisMovment(axis, direction, 1);
			} else {
				// Normal
				dpadSetAxisMovment(axis, direction, 2);
			}

			// Debugging
			if (options.verbose)
				console.log(name + ': ' + direction + ' | ' + axis + ' | ' +  + l1 + r1);
		}

		// Set Movemtn Varables
		function dpadSetAxisMovment(axis, direction, speed) {
			// Set Spped
			switch(speed) {
				case 1:
					speed = 0.05;
					break;
				case 3:
					speed = 5;
					break;
				default:
					speed = 0.5;
			}

			// Set Movemnt Varables
			if (axis == "X" && ( move_x_axis < 14 && move_x_axis > -14 )) {
				// X Axis

				// Set Direction
				if (direction) {
					// Positve Movment
					move_x_axis += speed;
				} else {
					// Negitave Movment
					move_x_axis += speed * -1;
				}
			} else if (axis == "Y" && ( move_y_axis < 14 && move_y_axis > -14 )) {
				// Y Axis

				// Set Direction
				if (direction) {
					// Positve Movment
					move_y_axis += speed;
				} else {
					// Negitave Movment
					move_y_axis += speed * -1;
				}
			}

			if (options.verbose)
				console.log("DPad Set Movemnet: " + move_x_axis + ': ' + move_y_axis + "   | " + speed)
		}

		// Move Gantry X | Y
		setInterval(dpadMoveAxis, 100);
		function dpadMoveAxis() {
			// Check if Axis Needs Moving
			if (move_x_axis != 0 || move_y_axis != 0 || move_z_axis != 0)
			{
				// Send gCode
				sendMessage('command', options.port, 'gcode', 'G91 G0 X' + move_x_axis + " Y" + move_y_axis + " Z" + move_z_axis);
				sendMessage('command', options.port, 'gcode', 'G90');  // Switch back to absolute coordinates

				// Debuging
				if (options.verbose)
					console.log("DPad MOVE: " + move_y_axis + ': ' + move_y_axis + ': ' + move_z_axis);

				// Reset Axis Varables
				move_x_axis -= move_x_axis;
				move_y_axis -= move_y_axis;
				move_z_axis -= move_z_axis;
			}
		}

		// - - - - - - - - - - - - - - - - - - - -

		// Y Up
		controller.on('dpadUp:press', function(data) {
			dpad('Y', true, data)
		});
		controller.on('dpadUp:hold', function(data) {
			dpad('Y', true, data)
		});
    controller.on('dpadUp:release', function(data) {
			move_y_axis = 0;
		});

		// Y Down
		controller.on('dpadDown:press', function(data) {
			dpad('Y', false, data)
		});
		controller.on('dpadDown:hold', function(data) {
			dpad('Y', false, data)
		});
    controller.on('dpadDown:release', function(data) {
			move_y_axis = 0;
		});

		// X Right
		controller.on('dpadRight:press', function(data) {
			dpad('X', true, data)
		});
		controller.on('dpadRight:hold', function(data) {
			dpad('X', true, data)
		});
    controller.on('dpadRight:release', function(data) {
			move_x_axis = 0;
		});

		// X Left
		controller.on('dpadLeft:press', function(data) {
			dpad('X', false, data)
		});
		controller.on('dpadLeft:hold', function(data) {
			dpad('X', false, data)
		});
    controller.on('dpadLeft:release', function(data) {
      move_x_axis = 0;
    });

		// ------------------------------------------

		// Spendle ON State
		var spindle = false;

		// Start Spindle
		controller.on('r2:press', function(data) {
			if (r1 && psx) {
				sendMessage('command', options.port, 'gcode', 'M3 S1000');
				spindle = true;
				if (options.verbose)
					console.log('Spindle: ' + spindle);
			}
		});

		// Stop Spendle
		controller.on('r2:release', function(data) {
			if (!psx && spindle) {
				sendMessage('command', options.port, 'gcode', 'M5');
				spindle = false;
				if (options.verbose)
					console.log('Spindle: ' + spindle);
			}
		});

		// ------------------------------------------

		// Analog Sticks
		var stick_sensitivity = 1; // Do not set below 1

		var left_x = 0;
			left_y = 0;
		var right_x = 0;
			right_y = 0;

		// Safty
		var stick_left = false;
			stick_right = false;

		// Safty = Stick Button
		controller.on('leftAnalogBump:press', function(data) {
			// Toggle Enable
			if (stick_left  || stick_right) {
				stick_left = false;
				stick_right = false;
				ps3_rumble_left = 0; // 0-1 (Rumble left on/off)
			} else {
				stick_left = true;
				stick_right = true;
				ps3_rumble_left = 1; // 0-1 (Rumble left on/off)
			}

			if (options.verbose)
				console.log('L] rightAnalogBump: ' + stick_right + " leftAnalogBump: "+ stick_left);

			/*
			// Rumble Controller Briefly
			ps3_rumble_left = 1; // 0-1 (Rumble left on/off)
			setTimeout(function () {
			    ps3_rumble_left = 0; // 0-1 (Rumble left on/off)
			}, 510);
			*/
		});
		controller.on('rightAnalogBump:press', function(data) {
			// Toggle Enable
			if (stick_right || stick_left) {
				stick_right = false;
				stick_left = false;
				ps3_rumble_left = 0; // 0-1 (Rumble left on/off)
			} else {
				stick_right = true;
				stick_left = true;
				ps3_rumble_left = 1; // 0-1 (Rumble left on/off)
			}

			if (options.verbose)
				console.log('R] rightAnalogBump: ' + stick_right + " leftAnalogBump: "+ stick_left);

			/*
			// Rumble Controller Briefly
			ps3_rumble_left = 1; // 0-1 (Rumble left on/off)
			setTimeout(function () {
			    ps3_rumble_left = 0; // 0-1 (Rumble left on/off)
			}, 510);
			*/
		});

		// - - - - - - - - - - - - - - - - - - - -

		// Analog Sticks
		controller.on('left:move', function(data) {
			if (options.verbose)
				console.log('left Moved: ' + data.x + ' | ' + Number((data.y * -1) +255));
			if (stick_left) {
				left_x = data.x - 128
				left_y = (data.y * -1) +128
			} else {
				left_x = 0;
				left_y = 0;
			}

			if (options.verbose)
				console.log('stick-left: ' +  Number(data.x - 128) + ' [' + right_x + '] | ' +  Number(data.y - 128) + ' [' + right_y + '] | ' + stick_left)
		});
		controller.on('right:move', function(data) {
			if (options.verbose)
				console.log('right Moved: ' + data.x + ' | ' + Number((data.y * -1) +255));
			if (stick_right) {

				right_x = data.x - 128
				right_y = (data.y * -1) +128
			} else {
				right_x = 0;
				right_y = 0;
			}

			if (options.verbose)
				console.log('stick-right: ' + Number(data.x - 128) + ' [' + right_x + '] | ' +  Number(data.y - 128) + ' [' + right_y + '] | ' + stick_right)
		});

		// [Function] map(value, fromLow, fromHigh, toLow, toHigh)   https://www.arduino.cc/en/Reference/Map
		function map(x, in_min, in_max, out_min, out_max)
		{
		  return Number((x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min);
		}

		// Move Gantry bassed on Sticks at a regualr interval
		setInterval(stickMovment, 50);

		// Move X & Y base on X & Y Stick Movments
		function stickMovment() {
			var sum_x = Number(left_x + right_x);
			var sum_y = Number(left_y + right_y);

			if (left_x >= stick_sensitivity | left_x <= -stick_sensitivity || left_y >= stick_sensitivity || left_y <= -stick_sensitivity || right_x >= stick_sensitivity || right_x <= -stick_sensitivity || right_y >= stick_sensitivity || right_y <= -stick_sensitivity) {
				// Additional Safty Catch
				if (!stick_left) {
					left_x = 0; left_y = 0;
				}
				if (!stick_right) {
					right_x = 0; right_y = 0;
				}

				//!!!!!!!!!!!!!!!!! need to detect if it's in inches or millimetersmm to avoid and overrun in the multiplier this can be done with agreeable status I believe.
				sendMessage('command', options.port, 'gcode', 'G21');  // set to millimeters

				// Move based on stick imput and mapping, need to add exponital curve.
				sendMessage('command', options.port, 'gcode', 'G91 G0 X' + map(sum_x, 0, 128, 0.0001, 2).toFixed(4) + ' Y' + map(sum_y, 0, 128, 0.0001, 2).toFixed(4)); // Switch to relative coordinates, Move one unit right in X and one unit right in Y
				sendMessage('command', options.port, 'gcode', 'G90');  // Switch back to absolute coordinates
				if (options.verbose)
					console.log('setInterval: x' + sum_x + ' y' + sum_y + ' | ' + 'G91 G0 X' + map(sum_x, 0, 128, 0.0001, 2).toFixed(4) + ' Y' + map(sum_y, 0, 128, 0.0001, 2).toFixed(4));
			}
		}

		// ------------------------------------------

		//sixasis motion events:
		//the object returned from each of the movement events is as follows:
		//{
		//	 direction : values can be: 1 for right, forward and up. 2 for left, backwards and down.
		//	 value : values will be from 0 to 120 for directions right, forward and up and from 0 to -120 for left, backwards and down.
		//}

/*
		//right-left movement
		controller.on('rightLeft:motion', function (data) {
			 //...doStuff();
		});

		//forward-back movement
		controller.on('forwardBackward:motion', function (data) {
			 //...doStuff();
		});
		//up-down movement
		controller.on('upDown:motion', function (data) {
			 //...doStuff();
		});
*/
		// ------------------------------------------

		// Send Extras Updates
		setInterval(updateControllerExtras, 500);
		function updateControllerExtras() {
			if (!options.clone) {
				controller.setExtras({
				rumbleLeft:  ps3_rumble_left,   // 0-1 (Rumble left on/off)
				rumbleRight: ps3_rumble_right,   // 0-255 (Rumble right intensity)
				led: ps3_led // 2 | 4 | 8 | 16 (Leds 1-4 on/off, bitmasked)
				});
			}

			//console.log("ps3_rumble_left: " + ps3_rumble_left);
			//console.log("ps3_rumble_right: " + ps3_rumble_right);
		}

		//controller status
		//as of version 0.6.2 you can get the battery %, if the controller is connected and if the controller is charging
		var battery_level = 0;
		controller.on('battery:change', function (value) {
			//console.log('battery:change:' + value);

			// Set LEDs
			switch(value) {
			case '100%':
			case "90%":
				ps3_led = 30;  // 0b11110 // 2 | 4 | 8 | 16 (Leds 1-4 on/off, bitmasked)
		        break;
			case "80%":
			case "70%":
				ps3_led = 28;  // 0b11100 // 2 | 4 | 8 | 16 (Leds 1-4 on/off, bitmasked)
		        break;
			case "50%":
			case "40%":
			case "30%":
				ps3_led = 24;  // 0b11000 // 2 | 4 | 8 | 16 (Leds 1-4 on/off, bitmasked)
		        break;
		    default:
		        ps3_led = 16;  // 0b10000 // 2 | 4 | 8 | 16 (Leds 1-4 on/off, bitmasked)
		        break;
		}

		});
		controller.on('connection:change', function (value) {
			if (options.verbose)
				console.log('connection:change:' + value);
		});
		controller.on('charging:change', function (value) {
			if (options.verbose)
				console.log('connection:change:' + value);
		});

/*
		//DualShock 3 control rumble and light settings for the controller
		controller.setExtras({
			rumbleLeft:  0,   // 0-1 (Rumble left on/off)
			rumbleRight: 0,   // 0-255 (Rumble right intensity)
			led: 2 // 2 | 4 | 8 | 16 (Leds 1-4 on/off, bitmasked)
		});
*/
	}
};
