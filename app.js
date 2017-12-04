// Copyright 2017
// Jeremy Weatherford
// Zenith Systems

// Developed as example code for Walsh University

// This server manages realtime communications for:
//  touchscreen kiosks -- webserver, REST API and websockets
//  Scala Player channel script -- websockets
//  Crestron control system -- TCP client

var express = require('express')
 , cookieParser = require('cookie-parser')
 , logger = require('morgan')
 , errorHandler = require('errorhandler')
 , bodyParser = require('body-parser')
 , http = require('http')
 , util = require('util')
 , net = require('net')
 , JSON5 = require('json5')
 , WebSocket = require('ws')
 , request = require('request')
;

// config
var webport = 8000, wsport = 8001;
var scalaAPI = 'http://scm.zenithav.net:8080/ContentManager/api/rest', scalaUser = 'api', scalaPass = 'Zenith5060';

// survey demo app
var surveyResults = [{A: 0, B: 0, C: 0, D: 0}];


var app = express();
app.set('port', webport);
app.set('view engine', 'ejs');

app.use(cookieParser('WCMSSession'));
app.use(cookieSession('WCMSSession'));

// no logging for these endpoints
app.use(express.static('static'));

app.use(logger('dev'));
app.use(errorHandler({showStack: true, dumpExceptions: true}));
app.use(bodyParser.json({strict: false}));

// web interface
app.get('/', function(req, res) {
	res.render('index');
});

app.get('/survey', function(req, res) {
	res.render('survey');
});

app.post('/laptopOn', function(req, res) {
	broadcast('laptop', 1);
	res.sendStatus(200);
});

app.post('/laptopOff', function(req, res) {
	broadcast('laptop', 0);
	res.sendStatus(200);
});


app.post('/survey', function(req, res) {
	var responses = req.body.responses;
	for (var i=0; i<responses.length; i++) {
		surveyResults[i][responses[i]]++;
	}
	broadcast('survey', surveyResults);
	return res.sendStatus(200);
	
	res.sendStatus(404); // not a valid response
});

app.get('/surveyResults', function(req, res) {
	res.send(surveyResults);
});

// express startup
http.createServer(app).listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});

function cookieSession(name) {
  return function (req, res, next) {
    req.session = req.signedCookies[name] || {};

    res.on('header', function(){
      res.cookie(name, req.session, { signed: true });
    });

    next();
  }
}

// websockets
var server = new WebSocket.Server({ port: wsport });
console.log('Websocket server listening on port ' + wsport);

server.on('connection', function(ws) {
	ws.send(JSON.stringify({msg: 'survey', data: surveyResults}));
	ws.on('message', function(msg) {
		console.log('RX ', msg);
	});
});

function broadcast(msg, data) {
	// send to websocket listeners
	var blob = JSON.stringify({msg: msg, data: data});
	server.clients.forEach(function(cli) {
		cli.send(blob);
	});
}

// maintain connection to Crestron to trigger laptop window
var crestronConnected = false;
var crestronClient = new net.Socket();
function crestronConnect() {
	crestronClient.connect(1138, '192.168.1.3');
}

crestronClient.on('connect', function() {
	console.log('crestron client connected');
	crestronConnected = true;
});

// todo: gather data by lines and parse
crestronClient.on('data', data => {
	console.log('crestron client RX:', data);
});

crestronClient.on('close', function() {
	console.log('crestron client disconnected');
	crestronConnected = false;
	setTimeout(crestronConnect, 10*1000);
});

crestronClient.on('error', function() {
	console.log('crestron client connection refused');
});
//crestronConnect();

setInterval(function() {
	if (crestronConnected)
		crestronClient.write('ping\n');
}, 30*1000);
