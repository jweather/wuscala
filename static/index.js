var state = null;
var db = [];

var layouts = [
	[[0, 1/2, 2, 2], [0, 0, 2, 3]],
	[[0, 1/2, 2, 2]],
	[[0, 1, 1, 1], [1, 1, 1, 1]],
	[[0, 0, 2, 2], [0, 2, 1, 1], [1, 2, 1, 1]],
	[[0, 1/2, 1, 1], [1, 1/2, 1, 1], [0, 1.5, 1, 1], [1, 1.5, 1, 1]],
	[[0, 0, 1, 1], [1, 0, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1], [1/2, 1, 1, 1]],
	[[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1]]
];

$(window).load(function() {
	$('.page').hide();
	$('#pageContainer').removeClass('hidden'); // only used while loading

	var xhr = new XMLHttpRequest();
	if (!xhr.upload) {
		alert("Browser does not support background image uploads, please use a modern browser.");
	}

	var loggedOut = false;
	$.ajaxSetup({
		cache: false,
		contentType: 'application/json',
		error: function(xhr, textStatus, error) {
			if (xhr.status == 403) {
				if (!loggedOut) {
					loggedOut = true;
					alert("Session has expired -- you are now logged out.");
					window.location.href = '/index.html';
				}
			} else {
				if (!loggedOut)
					alert("Server error: " + xhr.responseText);
			}
		}
	});

	// on startup
	refreshUser();

	$('#login').click(function() {
		var user = $('#loginUser').val(), pass = $('#loginPass').val();
		$.get('/api/login', {user: user, pass: pass}, function(resp) {
			$('#loginPass').val('')
			refreshUser();
			if (resp.error) {
				$('#loginError').text(resp.error);
			}
		});
	});
	$('#loginPass').keyup(function(e) { if (e.keyCode == 13) $('#login').click(); });
	$('#logout').click(function() {
		alert('User authentication is not active.');
	});
	$('a[data-page]').click(function() {
		page($(this).data('page'));
	});
	
	$('#preview .window').droppable({drop: dragDrop, hoverClass: 'ui-drop-hover'});
	
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
		case 'login':
			$('#loginUser').focus();
			break;
	}
}

function refreshUser() {
	$('#loginError').text('');
	$('#logout').hide();

	// no login required
	// websocket onConnect sets up page
	
	/*
    $.get('/api/info', function(resp) {
		user = resp.user;
		$('.admin').toggle((user != null) && user.isAdmin);
        if (user == null) {
			page('login');
            return;
        }
		if (resp.user.isAdmin) {
			page('users');
        } else {
			page('players');
        }
		$('#userLoggedIn').show();
        $('#userText').text(user.user);
    });
	*/
}

// layouts
$(document).on('change', '#playbackLayout', function(e) {
	console.log('new layout', $(this).val());
	$('#playbackLayoutSpin').show();
	$.post('/layout', JSON.stringify({preset: $(this).val()}), function() {
		$('#playbackLayoutSpin').hide();
	});
});

var previewW = 192, previewH = 108;

function updateState(newState) {
	var changed = false;
	if (state == null) changed = true;
	else {
		if (newState.layout.preset != state.layout.preset) changed = true;
		else {
			for (var i=0; i<6; i++) {
				if (newState.layout.sources[i] != state.layout.sources[i]) changed = true;
			}
		}
	}
	if (!changed) return;
	
	state = newState;
	console.log('state changed, refreshing');
	
	var preset = state.layout.preset;
	for (var i=0; i<6; i++) {
		var win = $('#playbackWindow'+i);
		if (i >= layouts[preset].length) {
			win.hide();
		} else {
			win.css({left: layouts[preset][i][0]*previewW, top: layouts[preset][i][1]*previewH,
			width: layouts[preset][i][2]*previewW, height: layouts[preset][i][3]*previewH});
			win.show();
		}
	}
	
	$('#playbackLayout').val(state.layout.preset);
	for (var i=0; i<6; i++) {
		$('#playbackWindow' + i).text(state.layout.sources[i] || '[none]');
	}
}

function contentType(fname) {
	var ext = fname.split('.').pop().toLowerCase();
	if (ext == 'png' || ext == 'jpg' || ext == 'gif') return 'image';
	if (ext == 'mov' || ext == 'mp4' || ext == 'wmv') return 'video';
	return 'unknown';
}

function contentRow(text, value, type) {
	var row = $('<div/>').addClass('contentRow').data('content', value)
		.draggable({helper: 'clone', appendTo: 'body', zIndex: 100});
	row.append($('<img/>').addClass('thumb').attr('src', 'content-' + type + '.png'));
	row.append($('<div/>').addClass('name').text(text));
	return row;
}

function updateDB(newDB) {
	db = newDB;
	
	$('#playbackLibrary').html('');
	$('#playbackLibrary').append(contentRow('[Blank]', '[null]', 'blank'));
	$('#playbackLibrary').append(contentRow('[Laptop Input]', '[laptop]', 'laptop'));
	
	db.files.forEach(file => {
		$('#playbackLibrary').append(contentRow(file, file, contentType(file)));
	});
}

function dragDrop(e, ui) {
	var window = $(this).data('window');
	var content = $(ui.draggable).data('content');
	console.log('dropped content', content, 'on window', window);
	
	$('#playbackLayoutSpin').show();
	$.post('/route', JSON.stringify({window: window, content: content}), function() {
		$('#playbackLayoutSpin').hide();
	});
		
}

// utility
function clone(from, to) {
    if (from == null || typeof from != "object") return from;
    if (from.constructor != Object && from.constructor != Array) return from;
    if (from.constructor == Date || from.constructor == RegExp || from.constructor == Function ||
        from.constructor == String || from.constructor == Number || from.constructor == Boolean)
        return new from.constructor(from);

    to = to || new from.constructor();

    for (var name in from)
    {
        to[name] = typeof to[name] == "undefined" ? clone(from[name], null) : to[name];
    }

    return to;
}

// upload
$(document).on('change', '#fUpload', function(e) {
	var files = e.target.files || e.dataTransfer.files; // browser differences
	var file = files[0];
	var fname = file.name;
	console.log('uploading ' + file.name);
	if (file.type.indexOf('image') != 0) {
		$('#fUploading').show();
			
		// local preview
		var reader = new FileReader();
		reader.onload = function(e) {
			$('#qEditPhotoPreview').attr('src', e.target.result);
		}
		reader.readAsDataURL(file);
		
		apiUpload(file, fname);
	} else if (file.type.indexOf('video') != 0) {
		if (file.size > 1000*1024*1024) {
			alert('File must be under 1000MB (file size ' + Math.floor(file.size/1024/1024) + 'MB)');
			return;
		} else {
			$('#fUploading').show();
			
			apiUpload(file, fname);
		}		
	} else {
		alert('Unknown file type: ' + file.type + ', expected image or video');
	}

});

var uploading = false;
function apiUpload(file, fname) {
	var data = new FormData();
	data.append('upload', file);
	uploading = true;
	$.ajax({
		url: '/upload/' + encodeURIComponent(fname),
		type: 'POST',
		data: data,
		cache: false,
		dataType: 'json',
		processData: false,
		contentType: false,
		success: function(data, textStatus, jqXHR) {
			console.log('upload success');
			$('#fUploading').hide();
			uploading = false;
		},
		error: function(jqXHR, textStatus, errorThrown) {
			console.log('upload errors ' + textStatus);
			$('#fUploading').hide();
			uploading = false;
		}
	});	
	return;
}

var ws;
var initted = false;
$(window).load(function() {
	function connect() {
		var url = 'ws://' + window.location.hostname + ':3001';
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
			page('playback');
			$('#startupLoader').hide();
		}
	};

	function onError() {
		console.log('WS error');
	}

	function onMessage(ev) {
		var data = JSON.parse(ev.data);
		if (data.msg == 'state') {
			console.log('updated state from server');
			updateState(data.data);
		} else if (data.msg == 'db') {
			console.log('server updated db');
			updateDB(data.data);
		}
	};

	function onClose() {
		console.log('WS closed');
		setTimeout(connect, 1000);
		initted = false;
		$('.page').hide();
		$('#startupLoader').show();
	}
}); // window.load
