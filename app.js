// Copyright 2017
// Jeremy Weatherford
// Zenith Systems
// Developed as example code for Walsh University

// This server manages realtime communications for:
//  touchscreen kiosks -- webserver, REST API and websockets
//  Scala Player channel script -- websockets
//  Scala Player content webpages -- websockets
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

var scala = require('./scala');

// config
var webport = 8000, wsport = 8001;
var scalaURL = 'http://scm.zenithav.net:8080/ContentManager', scalaUser = 'api', scalaPass = 'Zenith5060';
var scalaCategory = 'Walsh Kiosk Videos';

// survey demo app
var surveyResults = [{A: 0, B: 0, C: 0, D: 0}];

// video library
var library = [];

// long-poll message queues
var pollers = {};
var nextPollID = 0;


var app = express();
app.set('port', webport);
app.set('view engine', 'ejs');

app.use(cookieParser('WCMSSession'));
app.use(cookieSession('WCMSSession'));

// no logging for these endpoints
app.use(express.static('static'));
app.get('/poll/:id', longpoll);

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

// long poll /poll/:id
function longpoll(req, res) {
	var id = req.params.id;
	var resp = {msgs: [], id: id};
	if (!pollers[id]) {
		console.log('creating poll ID', nextPollID, 'for', id);
		
		id = nextPollID++;
		resp.id = id;
		pollers[id] = {last: new Date(), q: [], pending: null};
		resp.msgs = initialMsgs();
		return res.send(resp);
		
	} else if (pollers[id]) {
		pollers[id].last = new Date();
		if (pollers[id].q.length > 0) {
			resp.msgs = pollers[id].q;
			pollers[id].q = [];
			return res.send(resp); // immediate response
		} else {
			pollers[id].pending = res; // postpone response
			return;
		}
	} else {
		return res.sendStatus(404);
	}
}

setInterval(() => {
	var now = new Date();
	Object.keys(pollers).forEach(id => {
		if (pollers[id].pending && now - pollers[id].last > 5*1000) {
			// keepalive -- this interval is low so the Scala Python script has a chance to exit properly when requested
			pollers[id].pending.send({id: id, msgs: []});
			pollers[id].pending = null;
		} else if (now - pollers[id].last > 30*1000) {
			// nobody is polling this ID anymore, delete it
			console.log('expiring poll ID', id);
			delete pollers[id];
		}
	});
}, 1000);

// proxy Scala content requests so we can set the session cookie -- works for thumbnails, not videos
app.get('/scala/*', (req, res) => {
	var url = scalaURL + '/' + req.params[0];
	console.log('proxying to', url);
	
	var jar = request.jar();
	jar.setCookie(request.cookie('token=' + scala.apiToken()), scalaURL);
	
	var req = request({url:url, jar:jar}).pipe(res);
	res.pipe(req);
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

function initialMsgs() {
	return [
			{topic: 'survey', data: surveyResults},
			{topic: 'library', data: library},
			{topic: 'token', data: scalaURL + '/cookie.html#' + scala.cookies()}
	];
}

// websockets
var server = new WebSocket.Server({ port: wsport });
console.log('Websocket server listening on port ' + wsport);

server.on('connection', function(ws) {
	initialMsgs().forEach(msg => send(ws, msg));

	ws.on('message', function(msg) {
		console.log('RX ', msg);
		try {
			var data = JSON.parse(msg);
			console.log(data);
			if (data.topic == 'video') { // relay to Scala
				console.log('rebroadcasting video selection');
				broadcast('video', data.data);
			}	
		} catch(e) { }
	});
	ws.on('close', () => {
		console.log('websocket closed');
	});
});

function broadcast(topic, data) {
	// send to websocket listeners
	var msg = {topic: topic, data: data}
	server.clients.forEach(function(ws) {
		send(ws, msg);
	});

	// send to long pollers
	Object.keys(pollers).forEach(id => {
		if (pollers[id].pending) {
			// reply to open request
			pollers[id].pending.send({id: id, msgs: [msg]});
			pollers[id].pending = null;
		} else {
			// queue message
			pollers[id].q.push(msg);
		}
	});
}

function send(ws, msg) {
	ws.send(JSON.stringify(msg));
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


// scala API

function refreshScala() {
	scala.login(scalaURL, scalaUser, scalaPass, function(err) {
		scala.listVideos(scalaCategory, function(err, res) {
			if (err) return console.log('failed to refresh videos:', err);
			broadcast('token', scalaURL + '/cookie.html#' + scala.cookies());
			library = [];
			res.forEach(video => {
				library.push({name: video.name, filename: video.mediaItemFiles[0].filename,
					url: scalaURL + video.downloadPath, 
					thumb: scalaURL + video.thumbnailDownloadPaths.medium});
			});
			console.log('video library updated with ' + library.length + ' videos');
			broadcast('library', library);
		});
	});
}

// todo: faster
setInterval(refreshScala, 300*1000);
refreshScala();