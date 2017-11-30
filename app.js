var express = require('express')
 , cookieParser = require('cookie-parser')
 , logger = require('morgan')
 , errorHandler = require('errorhandler')
 , bodyParser = require('body-parser')
 , http = require('http')
 , util = require('util')
 , fs = require('fs')
 , net = require('net')
 , process = require('process')
 , JSON5 = require('json5')
 , WebSocket = require('ws')
 , multipart = require('connect-multiparty')
 , request = require('request')
;

// runtime
var state = {layout: {preset: 5, sources: ['[laptop]', 'video2.mov', 'video3.mov', 'video4.mov', 'video5.mov', '[null]']}};


// DB
var db = JSON5.parse(fs.readFileSync('db.json'));
var site = JSON5.parse(fs.readFileSync('site.json'));

var app = express();
app.set('port', 3000);
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

// tested with 1.8GB mp4, no issues
app.post('/upload/:file', multipart({uploadDir: process.cwd() + '\\upload'}), function(req, res) {
	console.log('/upload');
	if (!req.files || !req.files['upload']) return res.status(500).send('No files uploaded');
	var file = req.files['upload'];
	console.log(file)
	var tempName = file.path;
	var fName = process.cwd() + '\\static\\uploads\\' + req.params.file;
	
	console.log('temp file = ' + tempName + ', destination = ' + fName);
	fs.rename(tempName, fName, function(err) {
		if (err) console.log('rename error', err);
		res.send({fname: req.params.file});
	});
});

app.post('/layout', function(req, res) {
	var preset = req.body.preset;
	state.layout.preset = preset;
	touchState();
	playbackClient.write('preset' + preset + '\r\n');
	res.sendStatus(200);
});

app.post('/route', function(req, res) {
	var window = req.body.window;
	var content = req.body.content;
	
	state.layout.sources[window] = content;
	touchState();
	
	playbackClient.write(window + ' ' + content + '\r\n');
	res.sendStatus(200);
});

// express startup
http.createServer(app).listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});


// util
var directoryBusy = false;
function refreshDirectory() {
	if (directoryBusy) return;
	directoryBusy = true;
	
	var add = [], unmatched = [];
	db.files.forEach(file => unmatched.push(file));
	
	fs.readdir(site.contentRoot, (err, files) => {
		files.forEach(file => {
			var i = unmatched.indexOf(file);
			if (i == -1) {
				console.log('adding file', file);
				add.push(file);
			} else {
				unmatched.splice(i, 1);
			}
		});
		if (add.length > 0 || unmatched.length > 0) {
			console.log('refreshDirectory found changes:', add.length, 'new and', unmatched.length, 'deleted');
			unmatched.forEach(file => db.files.splice(db.files.indexOf(file), 1));
			db.files = db.files.concat(add).sort();
			touchDB();
		}
		directoryBusy = false;
	});
}

function cookieSession(name) {
  return function (req, res, next) {
    req.session = req.signedCookies[name] || {};

    res.on('header', function(){
      res.cookie(name, req.session, { signed: true });
    });

    next();
  }
}

function touchDB() {
	fs.writeFileSync('db.json', JSON5.stringify(db, null, 4));
	broadcast('db', db);
}

function touchState() {
	broadcast('state', state);
}
	
// websockets
var wsport = 3001;
var server = new WebSocket.Server({ port: wsport });
console.log('Websocket server listening on port ' + wsport);

server.on('connection', function(ws) {
	ws.send(JSON.stringify({msg: 'state', data: state}));
	ws.send(JSON.stringify({msg: 'db', data: db}));
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

// video directory refresh
refreshDirectory();
setInterval(refreshDirectory, 5*1000);

// maintain connection to playback app
var playbackClient = new net.Socket();
function playbackConnect() {
	playbackClient.connect(1138, '127.0.0.1');
}

playbackClient.on('connect', function() {
	console.log('Playback client connected');
	
	// synchronize layout
	playbackClient.write('preset' + state.layout.preset + '\r\n');
	for (var i=0; i<6; i++) {
		playbackClient.write(i + ' ' + state.layout.sources[i] + '\r\n');
	}
});

playbackClient.on('data', data => {
	console.log('playback client RX:', data);
});

playbackClient.on('close', function() {
	console.log('Playback client disconnected');
	setTimeout(playbackConnect, 10*1000);
});

playbackClient.on('error', function() {
	console.log('Playback client connection refused');
});
playbackConnect();

