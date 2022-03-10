#!/usr/bin/env node

// gcode-grbl
// G-code handler for Grbl controllers. Sends messages to CNCjs via the
// connector service based on input from the actions service.
//
// Copyright (c) 2017-2022 various contributors. See LICENSE for copyright
// and MIT license information.

import { GcodeSender } from './gcode-sender.js';

export class GcodeGrbl extends GcodeSender {

  //----------------------------------------------------------------------------
  // move gantry: relative movement
  //  Override the base class implementation to use grbl-specific `$J=`ogging
  //  notation. We're also going to slow the speed down just slightly so that
  //  we can keep the planner full.
  //----------------------------------------------------------------------------
  override moveGantryJogToXYZ(x: number, y: number, z: number, mmPerMin: number) {
    this.sendMessage('command', 'gcode', 'G21');  // set to millimeters
    this.sendMessage('command', 'gcode', `G91`);
    this.sendMessage('command', 'gcode', `$J=X${x.toFixed(4)} Y${y.toFixed(4)} Z${z.toFixed(4)} F${mmPerMin * 0.98}`);
    this.sendMessage('command', 'gcode', 'G90');  // back to absolute coordinates
  }

};
