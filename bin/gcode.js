#!/usr/bin/env node

// G-code handler for cncjs-pendant-ps3 to abstract the code across different controller types
// by Chris Midgley <chris@koose.com>

// MIT License
//
// Copyright (c) 2020 Chris Midgley
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

module.exports = class {
    constructor(options) {

    }

    probe() {
        sendMessage('command', options.port, 'gcode', 'G91');
        sendMessage('command', options.port, 'gcode', 'G38.2 Z-15.001 F120');
        sendMessage('command', options.port, 'gcode', 'G90');
        sendMessage('command', options.port, 'gcode', 'G10 L20 P1 Z15.001');
        sendMessage('command', options.port, 'gcode', 'G91');
        sendMessage('command', options.port, 'gcode', 'G0 Z3');
        sendMessage('command', options.port, 'gcode', 'G90');
    }

    moveRelative(x=0, y=0, z=0) {
        if (options.verbose)
            console.log('moveRelative verbose');
        else
            console.log('moveRelative without verbose');
    }
};