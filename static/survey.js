﻿
$(window).load(() => {
	
}); // window.load

function updateSurvey(results) {
	var sum = 0;
	console.log('survey results', results);
	var q1 = results[0];
	var keys = Object.keys(q1);
	
	keys.forEach(key => {
		sum += q1[key];
	});
	
	keys.forEach(key => {
		var pct = sum == 0 ? 0 : (q1[key] / sum);
		var bar = $('#q1' + key);
		bar.css({width: (pct*500)+'px'});
		bar.text(Math.round(pct*100, 2) + '%');
	});
}

// websocket
var ws;
var initted = false;
$(window).load(() => {
	function connect() {
		var url = 'ws://' + window.location.hostname + ':8001';
		console.log('Connecting to ' + url);
		ws = new WebSocket(url);
		ws.onopen = onOpen;
		ws.onmessage = onMessage;
		ws.onclose = onClose;
		ws.onerror = onError;
	}
	connect();

	function onOpen() {
		console.log('WS open');
	};

	function onError() {
		console.log('WS error');
	}

	function onMessage(ev) {
		var data = JSON.parse(ev.data);
		if (data.msg == 'survey') {
			console.log('updated survey results', data.data);
			updateSurvey(data.data);
		}
	}

	function onClose() {
		console.log('WS closed');
		setTimeout(connect, 1000);
	}
}); // window.load
