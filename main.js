
/*jslint node:true, vars:true, bitwise:true, unparam:true */
/*jshint unused:true */

// load required modules
// helps control asynchronous flow
var async = require('async');
// utility for handling file paths
var path = require('path');
// runs a command in a shell and buffers the output
var exec = require('child_process').exec;
// launches a child process
var spawn = require('child_process').spawn;
// http request client
var request = require('request');
// IBM Watson services client
var watson = require('watson-developer-cloud');
// robotics programming framework
var five = require('johnny-five');
// edison IO library
var Edison = require('edison-io');
// english number utility
var numify = require('numstr').numify;

// globals
// reference to led object
var led = null;
// keeps track of if we are already working on a command
var working = false;

// initialize watson text-to-speech service
var textToSpeech = watson.text_to_speech({
  username: 'c3f77887-ce72-4e6f-898e-5ec84586311f',
  password: 'Zjehoy3O86U6',
  version: 'v1'
});

// initialize watson speech-to-text service
var speechToText = watson.speech_to_text({
  username: 'f41a73ac-5a2d-4d8d-afc9-913ae23edaf4',
  password: 'YIBaFt8W8pR2',
  version: 'v1'
});

// accepts a string and reads it aloud
function tts (text, cb) {
  // build tts parameters
  var params = {
    text: text,
    accept: 'audio/wav'
  };
    
    var paramsA = {
    text: "I am sorry, but I could not complete your request.",
    accept: 'audio/wav'
  };
    
textToSpeech.synthesize(paramsA);

  // create gtstreamer child process to play audio
  // "fdsrc fd=0" says file to play will be on stdin
  // "wavparse" processes the file as audio/wav
  // "pulsesink" sends the audio to the default pulse audio sink device
  var gst = exec('gst-launch-1.0 fdsrc fd=0 ! wavparse ! pulsesink',
    function (err) {
      if (cb){
        if (err) { return cb(err); }    
        cb();
      }

  });
  // use watson and pipe the text-to-speech results directly to gst
  textToSpeech.synthesize(params).pipe(gst.stdin);
}

function emptyCallback() {
    return;
}

// listens for audio then returns text
function stt (cb) {
  var duration = 5000;
  console.log('listening for %s ms ...', duration);
  // create an arecord child process to record audio
  var arecord = spawn('arecord', ['-D', 'hw:2,0', '-f', 'S16_LE', '-r44100']);
  // build stt params using the stdout of arecord as the audio source
  var params = {
    audio: arecord.stdout,
    content_type: 'audio/wav',
    continuous: true    // listen for audio the full 5 seconds
  };
  // use watson to get answer text
  speechToText.recognize(params, function (err, res) {
      if(cb){
        if (err) { return cb(err); }
        var text = '';
        try {
          text = res.results[0].alternatives[0].transcript;
        } catch (e) { }
        console.log('you said: "%s"', text);
        cb(null, text.trim());
      }
   
  });
  // record for duration then kill the child process
  setTimeout(function () {
    arecord.kill('SIGINT');
  }, duration);
}

// plays a local wav file
function playWav (file, cb) {
  var filePath = path.resolve(__dirname, file);
  // create gtstreamer child process to play audio
  // "filesrc location=" says use a file at the location as the src
  // "wavparse" processes the file as audio/wav
  // "volume" sets the output volume, accepts value 0 - 1
  // "pulsesink" sends the audio to the default pulse audio sink device
    exec('gst-launch-1.0 filesrc location=' + filePath +
    ' ! wavparse ! volume volume=0.10 ! pulsesink', function (err) {
        if(cb){
            return cb(err);
        }
    });
    
  
}


// initialize edison board
var board = new five.Board({
  io: new Edison(),
  repl: false           // we don't need the repl for this project
});

// when the board is ready, listen for a button press
board.on('ready', function() {
    playWav('88877_DingLing.wav');
  var button = new five.Button(32);
  led = new five.Led(33);
  led.off();
  button.on('press', main);
});


// main function
function main() {
  if (working) { return; }
  working = true;
  async.waterfall([
    async.apply(playWav, '88877_DingLing.wav'),
    listen,
    search,
    speak
  ], finish);
}

// handle any errors clear led and working flag
function finish (err) {
  if (err) {
    tts('Nope.');
    console.log(err);
  }
  // stop blinking and turn off
  led.stop().off();
  working = false;
}

// listen for the audio input
function listen (cb) {
  // turn on the led
  led.on();
  stt(cb);
}

// perform a search using the duckduckgo instant answer api
function search (q, cb) {
  if (!q) {
      if(cb) {
          return cb(null, 'I\'m sorry I didn\'t hear you.');
      }

  }
  // blick the led every 100 ms
  led.blink(100);
  // run the query through numify for better support of calculations in
  // duckduckgo
  q = numify(q);
  console.log('searching for: %s', q);
  var requestOptions = {
    url: 'https://api.duckduckgo.com/',
    accept: 'application/json',
    qs: {
      q: q,
      format: 'json',
      no_html: 1,
      skip_disambig: 1
    }
  };
  request(requestOptions, function (err, res, body) {
      if(cb){
        if (err) { return cb(err); }
        var result = JSON.parse(body);
        // default response
        var text = 'I\'m sorry, I was unable to find any information on ' + q;
        if (result.Answer) {
          text = result.Answer;
        } else if (result.Definition) {
          text = result.Definition;
        } else if (result.AbstractText) {
          text = result.AbstractText;
        }
        cb(null, text);
      }
    
  });
}

// read the search results
function speak (text, cb) {
  // stop blinking and turn off
  led.stop().off();
  if (!text) {
      text="I am sorry, but I could not complete the request";
  }
  tts(text, cb);
}