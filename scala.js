// Copyright 2017
// Jeremy Weatherford
// Zenith Systems
// Developed as example code for Walsh University

// handle Scala Content Manager's REST API

var request = require('request');

var apiToken = null;
var sessionID = null;

var endpoint;

exports.apiToken = function() { return apiToken; }
exports.cookies = function() { return apiToken + ',' + sessionID; }

exports.login = function(url, user, pass, cb) {
	endpoint = url + '/api/rest';
	
	api('post', '/auth/login', {username: user, password: pass},
		function(body) {
				if (!body) {
					cb('Scala login failed!');
				} else {
					apiToken = body.apiToken;
					cb(null);
				}
		});
}

exports.listVideos = function(catName, cb) {
	api('get', '/categories', null, body => {
		var catID = null;
		if (!body.list) { return cb('category request failed'); }
		body.list.forEach(cat => {
			if (cat.name == catName) catID = cat.id;
		});
		if (catID == null) return cb('Category not found');
		
		api('get', '/media', {filters: "{categories: {values: [" + catID + "], comparator: 'in'}}"}, body => {
			if (!body) {
				cb('media request failed');
			} else {
				cb(null, body.list);
			}
		});
	});
}

function api(method, url, body, cb) {
    var opts = {url: endpoint + url};
    opts.json = true;
    opts.method = method;
		if (method == 'post')
			opts.body = body;
		else
			opts.qs = body;
    if (apiToken) {
        opts.headers = {apiToken: apiToken};
    }
    request(opts, function(err, res, body) {
        if (err) {
            return console.log(err);
        }
				var cookies = res.headers['set-cookie'];
				if (cookies) {
					var match = cookies[0].match(/JSESSIONID=([^;]+);/);
					sessionID = match[1];
				}
        cb(body);
    });
}
