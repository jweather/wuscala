var slides, judges;
var palette = [
	'#850a16', '#00739f', '#d0d29c', '#f7921d', '#506c68', '#7a5671', '#fecd64', '#4b4b4d'
];
var editor = null;

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

	palette.forEach(function(color) {
		$('#qEditBG').append($('<option/>').val(color).data('color', color));
	});
	$('#qEditBG').colorselector();
	
	CKEDITOR.replace('qEditText', {
		toolbarGroups: [
			{ name: 'basicstyles', groups: [ 'basicstyles', 'cleanup' ] },
			{ name: 'paragraph', groups: [ 'list', 'indent', 'blocks', 'align', 'bidi', 'paragraph' ] },
		],
		removeButtons: 'Cut,Copy,Paste,Undo,Redo,Anchor,Strike,Subscript,Superscript,About,Link,Unlink'
	});
	editor = CKEDITOR.instances.qEditText;
}); // window.load

function page(name, quiet) {
	var p = $('.page[data-page="' + name + '"]');
	if (!p.length) {
		alert("unknown page name: " + name);
		return;
	}
	
	//if (p.is(':visible')) return; // already shown -- reload anyway
	$('.page').hide();
	p.show();
	
	// li highlight
	$('a[data-page]').parents('li').removeClass('active');
	$('a[data-page="' + name + '"]').parents('li').addClass('active');
	
	if (quiet) return;
	
	switch (name) {
		case 'preview':
			refreshFullscreen();
			break;
		case 'login':
			$('#loginUser').focus();
			break;
		case 'docket':
			refreshDocket();
			break;
		case 'judges':
			refreshJudges();
			break;
		case 'fullscreen':
			refreshFullscreen();
			break;
	}
}

function refreshFullscreen() {
	var active = slides[0].filter(function(slide) { return slide.active; }).length > 0;
	$('#fullscreenActive').toggle(active);
	
	$.get('/views/fullscreenList.ejs', function(templ) {
		var qList = ejs.compile(templ);
		$('#fullscreen').html(qList({slides: slides[0]}));
		
		$('.fsTable').sortable({
			handle: '.qThumb',
			stop: function() {
				var q = 0;
				console.log('reorganized slides for q=' + q);
				var updated = [];
				$(this).find('.qTR').each(function() {
					var slide = $(this).data('slide');
					updated.push(getSlide(q, slide));
				});
				slides[q] = updated;
				touchSlides(q);
			}
		});
	});
	
}	

function refreshUser() {
	$('#loginError').text('');
	$('#logout').hide();

	// todo: check login first
	$.get('/slides', function(resp) {
		slides = resp;
		page('preview');
		refreshSlides();
		refreshFAQ();
		$('#startupLoader').hide();
		$('#logout').show();
	});
	
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

// fullscreen
$('#fullClear').click(function() {
	slides[0].forEach(function(slide) {
		slide.active = false;
	});
	saveSlides(0);
});

// q1 and q3 slide lists
var slidesDirty = [false, false, false, false, false];
function refreshSlides() {
	refreshFullscreen();
	$.get('/views/qList.ejs', function(templ) {
		var qList = ejs.compile(templ);
		[1, 3].forEach(function(q) {
			$('#qList' + q).html(qList({q: q, slides: slides[q]}));
		});
		
		$('.qTable').sortable({
			handle: '.qThumb',
			stop: function() {
				var q = $(this).closest('.qPage').data('q');
				console.log('reorganized slides for q=' + q);
				var updated = [];
				$(this).find('.qTR').each(function() {
					var slide = $(this).data('slide');
					updated.push(getSlide(q, slide));
				});
				slides[q] = updated;
				touchSlides(q);
			}
		});
	});
}

$(document).on('click', '.qActive', function qActive() {
	var q = $(this).closest('.qPage').data('q');
	var name = $(this).closest('tr').data('slide');
	console.log('click ' + q + ' ' + name);
	var slide = getSlide(q, name);
	if (!slide)
		return console.log('slide not found');
	slide.active = !slide.active;
	console.log(' active is now ' + slide.active);
	$(this).toggleClass('btn-primary', slide.active);
	$(this).text(slide.active ? 'Enabled' : 'Disabled');
	touchSlides(q);
	$('.qSave:visible').show();
});

$(document).on('click', '.qPreviewURL', function() {
	var url = $(this).data('url');
	var win = window.open(url, '_blank');
	win.focus();
});

var editQ, editIdx, editSlide = null;
$(document).on('click', '.qEdit', function() {
	var name = $(this).closest('tr').data('slide'), q = $(this).closest('.qPage').data('q');
	if (name == 'FAQ')
		return page('faq'); // special edit page
	
	editQ = q;
	editIdx = slides[q].indexOf(getSlide(q, name));
	editSlide = clone(getSlide(q, name));
	showQEdit();
});
$(document).on('click', '.qNew', function() {
	var q = $(this).closest('.qPage').data('q');
	
	editQ = q; editIdx = -1;
	
	editSlide = {
		name: '', title: '', text: '', bg: palette[0],
		view: ['quad', 'intro', '?', 'announce'][q],
		active: true
	}
	if (editQ == 0)
		editSlide.active = false; // not active by default
	
	showQEdit();
});
function showQEdit() {
	$('#qEditName').val(editSlide.name);
	$('#qEditTitle').val(editSlide.title);
	$('#qEditSubtitle').val(editSlide.subtitle);
	editor.setData(editSlide.text);
	
	$('#qEditBG').colorselector("setColor", editSlide.bg);
	$('#qEditPhotoPreview').attr('src', editSlide.photo);
	$('#qEditPhotoClear').toggle(editSlide.photo != '' && editQ != 0);
	
	$('#qEditTitle').parents('.form-group').toggle(editQ != 0);
	$('#qEditText').parents('.form-group').toggle(editQ != 0);
	$('#qEditBG').parents('.form-group').toggle(editQ != 0);

	$('#qEditSubtitle').parents('.form-group').toggle(editQ == 3);
	
	$('#qModal').modal();
}
$(document).on('click', '#qEditPhotoClear', function() {
	editSlide.photo = '';
	$('#qEditPhotoPreview').attr('src', '');
	$('#qEditUpload').val('');
});

$(document).on('click', '#qSave', function() {
	var name = $('#qEditName').val();
	if (!name) return alert('Please enter a name.');
	if (editIdx == -1 || name != slides[editQ][editIdx].name) { // renaming?
		if (getSlide(editQ, name) != null) return alert('That name is already in use.');
	}
	editSlide.name = name;
	if (editQ == 0) {
		if (editSlide.photo == '') return alert('Please upload a photo to use');
	} else {
		editSlide.title = $('#qEditTitle').val();
		editSlide.subtitle = $('#qEditSubtitle').val();
		editSlide.text = editor.getData();
		editSlide.bg = $('#qEditBG').val();
	}
	
	if (editIdx == -1)
		slides[editQ].push(editSlide);
	else
		slides[editQ][editIdx] = editSlide;

	saveSlides(editQ, function(err) {
		console.log('qSave callback');
		$('#qModal').modal('hide');
	});
});
$(document).on('click', '#qDelete', function() {
	if (editIdx == -1) { // never existed
		$('#qModal').modal('hide');
		return;
	}
	slides[editQ].splice(editIdx, 1);
	saveSlides(editQ, function(err) {
		$('#qModal').modal('hide');
	});
});
$(document).on('click', '.qSave', function() {
	saveSlides($(this).closest('.qPage').data('q'));
});
function touchSlides(q) {
	slidesDirty[q] = true;
	$('.qPage[data-q='+q+'] .qSave').fadeIn();
}

function saveSlides(q, cb) {
	$.post('/slides/quad/' + q, JSON.stringify(slides[q]), function(update) {
		console.log('saved quad' + q + ' slides');
		slides = update;
		slidesDirty[q] = false;
		$('.qPage[data-q='+q+'] .qSave').fadeOut();
		setTimeout(refreshSlides, 500); // allow time for modals to hide first
		if (cb) { cb(null); }
	}).fail(function(e) {
		console.log('update failed: ' + e);
		if (cb) { cb(e); }
	});
}

// FAQ
function refreshFAQ() {
	$.get('/views/faqList.ejs', function(templ) {
		var faq = getSlide(3, 'FAQ');
		$('#faq').html(ejs.render(templ, {questions: faq.questions}));
		$('#faqTable').sortable({
			handle: '.faqThumb',
			stop: function() {
				console.log('reorganized FAQs');
				var faq = getSlide('FAQ');
				var updated = [];
				$('#faqTable .faqEdit').each(function() {
					var idx = $(this).data('idx');
					updated.push(faq.questions[idx]);
				});
				faq.questions = updated;
				saveFAQs(faq);
			}
		});
	});
}

var editFAQ = null;
$(document).on('click', '.faqEdit', function() {
	var idx = $(this).data('idx');
	editFAQ = idx;
	var qa = getSlide('FAQ').questions[idx];
	$('#faq-q').val(qa[0]);
	$('#faq-a').val(qa[1]);
	
	$('#faqEdit').modal();
});

$(document).on('click', '.faqAdd', function() {
	editFAQ = null;
	$('#faq-q').val('');
	$('#faq-a').val('');
	
	$('#faqEdit').modal();
});

$(document).on('click', '#faqSave', function() {
	var faq = getSlide('FAQ');
	var qa = [$('#faq-q').val(), $('#faq-a').val()];
	if (qa[0] == '') return alert('Please enter a question.');
	if (qa[1] == '') return alert('Please enter an answer.');
	
	if (editFAQ == null) {
		faq.questions.push(qa);
	} else {
		faq.questions[editFAQ] = qa;
	}
	saveFAQs(faq);
});

$(document).on('click', '#faqDelete', function() {
	if (editFAQ != null) {
		var faq = getSlide('FAQ');
		faq.questions.splice(editFAQ, 1);
	}
	saveFAQs(faq);
});

function saveFAQs(faq) {
	$.post('/slides/name/FAQ', JSON.stringify(faq), function() {
		console.log('updated');
		editFAQ = null;
		$('#faqEdit').modal('hide');
		setTimeout(refreshFAQ, 500);
	}).fail(function(res) {
		console.log(res.responseText);
	});
}

// docket
function refreshDocket() {
	$.get('/docket', function(data) {
		showDocket(data);
	});
}
function showDocket(data) {
	$.get('/views/docketList.ejs', function(templ) {
		$('#docket').html(ejs.render(templ, {docket: data}));
	});
}
$(document).on('click', '#docketRefresh', function() {
	$('#docketStatus').text('Refreshing...');
	$.post('/docket/refresh', function(data) {
		console.log('updated docket');
		showDocket(data);
	}).fail(function(res) {
		$('#docketStatus').html('Refresh failed: ' + res.responseText);
	});
});

// fullscreen slides



// utility
function getSlide(q, name) {
	for (var i=0; i<slides[q].length; i++) {
		if (slides[q][i].name == name) return slides[q][i];
	}
	return null;
}

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

// slide photos
$(document).on('change', '#qEditUpload', function(e) {
	editSlide.changed = true;
	var files = e.target.files || e.dataTransfer.files; // browser differences
	var file = files[0];
	var type = 'image';//$(e.target).data('type');
	var guid = Math.floor(Math.random()*0x100000000).toString(36);
	var saneName = editSlide.name.replace(/[^A-Za-z0-9]/g, '.');
	var fname = 'Q' + editQ + ' ' + saneName + '.' + guid + '.' + file.name.split('.').pop();
	console.log('uploading ' + file.name + ' as ' + fname);
	if (type == 'image') {
		if (file.type.indexOf("image") != 0) {
			alert('File does not appear to be an image: ' + file.type);
			return;
		} else {
			$('#qEditUploading').show();
			
			// local preview
			var reader = new FileReader();
			reader.onload = function(e) {
				$('#qEditPhotoPreview').attr('src', e.target.result);
			}
			reader.readAsDataURL(file);
			
			apiUpload(file, fname);
		}
	} else if (type == 'video') {
		if (file.type.indexOf('video') != 0) {
			alert('File does not appear to be a video: ' + file.type);
			return;
		} else if (file.size > 100*1024*1024) {
			alert('File must be under 100MB (file size ' + Math.floor(file.size/1024/1024) + 'MB)');
			return;
		} else {
			$('#qEditUploading').show();
			
			apiUpload(file, fname);
		}		
	}
});

function apiUpload(file, fname) {
	var data = new FormData();
	editSlide.uploads = fname;
	data.append('upload', file);
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
			editSlide.photo = 'uploads/' + fname;
			$('#qEditUploading').hide();
			delete editSlide.uploads;
		},
		error: function(jqXHR, textStatus, errorThrown) {
			console.log('upload errors ' + textStatus);
			$('#qEditUploading').hide();
			delete editSlide.uploads;
		}
	});	
	return;
}
