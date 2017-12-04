
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
	refreshUser();

	$('a[data-page]').click(() => {
		page($(this).data('page'));
	});
	
	$('#capture0').click(() => {
		$.post('/laptopOff', null, () => {});
	});
	
	$('#capture1').click(() => {
		$.post('/laptopOn', null, () => {});
	});
	
	$('#surveySubmit').click(() => {
		var a1 = $('input[name=question1]:checked').val();
		if (!a1) return;
		
		$.post('/survey', JSON.stringify({responses: [a1]}), () => {
			alert("Thank you for your response!  Look up at the video wall for the results so far.");
		});
	});
	
}); // window.load

function page(name, quiet) {
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
	
	if (quiet) return;

	// need to refresh anything when switching pages?
	switch (name) {
		
	}
}

function refreshUser() {
	$('#loginError').text('');
	$('#logout').hide();
	
	page('survey');

	// no login required
	// websocket onConnect sets up page
}

function contentRow(name, url, thumb) {
	var row = $('<div/>').addClass('contentRow').data('url', url)
		.draggable({helper: 'clone', appendTo: 'body', zIndex: 100});
	row.append($('<img/>').addClass('thumb').attr('src', thumb));
	row.append($('<div/>').addClass('name').text(name));
	return row;
}

function updateLibrary(videos) {
	$('#library').html('');
	$('#library').append(contentRow('[Blank]', '[null]', 'blank'));
	$('#library').append(contentRow('[Laptop Input]', '[laptop]', 'laptop'));
	
	// todo: use Scala thumbnails instead
	videos.forEach(file => {
		$('#library').append(contentRow(file.name, file.url, file.thumb));
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
		if (data.msg == 'library') {
			console.log('updated video library from server');
			updateLibrary(data.data);
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
