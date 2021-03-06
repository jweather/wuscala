﻿// Copyright 2017
// Jeremy Weatherford
// Zenith Systems
// Developed as example code for Walsh University

var library = [];

$(window).load(() => {
	$('.page').hide();
	$('#pageContainer').removeClass('hidden'); // only used while loading

	$.ajaxSetup({
		cache: false,
		contentType: 'application/json',
		error: function(xhr, textStatus, error) {
			alert("Server error: " + xhr.responseText);
		}
	});

	// on startup
	$('#loginError').text('');
	$('#logout').hide();
	
	page('survey');

	$('a[data-page]').click(function() {
		page($(this).data('page'));
	});
	
	$('#capture0').click(() => {
		$('#laptopSent').show().delay(1000).hide(0);
		$.post('/laptopOff', null, () => {});
	});
	
	$('#capture1').click(() => {
		$('#laptopSent').show().delay(1000).hide(0);
		$.post('/laptopOn', null, () => {});
	});
	
	$('#surveySubmit').click(() => {
		var a1 = $('input[name=question1]:checked').val();
		if (!a1) return;
		
		$.post('/survey', JSON.stringify({responses: [a1]}), () => {
			$('#surveySent').show().delay(3000).hide(0);
			$('input[name=question1]:checked').attr('checked', false);
		});
	});
	
	$('#library').on('click', '.contentRow', function() {
		var url = $(this).data('url');
		var video = $('#video')[0];
		video.src = url;
		video.play();
		
		// notify Scala to play this video as well
		ws.send(JSON.stringify({topic: 'video', data: $(this).data('filename')}));
	});
	
}); // window.load

// switch pages
function page(name) {
	var p = $('.page[data-page="' + name + '"]');
	if (!p.length) {
		alert("unknown page name: " + name);
		return;
	}
	
	$('.page').hide();
	p.show();
	
	// li highlight
	$('a[data-page]').parents('li').removeClass('active');
	$('a[data-page="' + name + '"]').parents('li').addClass('active');
}

function contentRow(video) {
	var row = $('<div/>').addClass('contentRow')
		.data('url', video.url).data('name', video.name).data('filename', video.filename);
	row.append($('<img/>').addClass('thumb').attr('src', video.thumb));
	row.append($('<div/>').addClass('name').text(video.name));
	return row;
}

function updateLibrary(videos) {
	library = videos;
	$('#library').html('');
	
	videos.forEach(file => {
		$('#library').append(contentRow(file));
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
		if (!initted) {
			page('survey');
			$('#startupLoader').hide();
		}
	};

	function onError() {
		console.log('WS error');
	}

	function onMessage(ev) {
		var data = JSON.parse(ev.data);
		if (data.topic == 'library') {
			console.log('updated video library from server with ' + data.data.length + ' videos');
			updateLibrary(data.data);

		} else if (data.topic == 'token') {
			// browser has to have cookies set in order to stream video directly from Scala Content Manager
			console.log('WS RX token', data.data);
			$('#cookieFrame').remove();
			
			// effectively a XSS attack to set cookies for the Content Manager's domain
			$('body').append($('<iframe/>').attr('src', data.data).attr('id', 'cookieFrame'));
		}
	}

	function onClose() {
		console.log('WS closed');
		setTimeout(connect, 1000);
		initted = false;
		$('.page').hide();
		$('#startupLoader').show();
	}
}); // window.load
