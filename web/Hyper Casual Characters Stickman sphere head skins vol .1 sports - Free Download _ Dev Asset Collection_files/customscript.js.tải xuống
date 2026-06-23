jQuery.fn.exists = function(callback) {
  var args = [].slice.call(arguments, 1);
  if (this.length) {
	callback.call(this, args);
  }
  return this;
};

/*----------------------------------------------------
 * Add 'ie' class for Internet Exporer
 *--------------------------------------------------*/
jQuery(document).ready(function($) {
	function GetIEVersion() {
		var sAgent = window.navigator.userAgent;
		var Idx = sAgent.indexOf("MSIE");

		// If IE, return version number.
		if (Idx > 0) 
			return parseInt(sAgent.substring(Idx+ 5, sAgent.indexOf(".", Idx)));

		// If IE 11 then look for Updated user agent string.
		else if (!!navigator.userAgent.match(/Trident\/7\./)) 
			return 11;

		else
			return 0; //It is not IE
	}
	if (GetIEVersion() > 0) {
		$("html").addClass("ie");
	}
});

/*----------------------------------------------------
 * Make all anchor links smooth scrolling
 *--------------------------------------------------*/
jQuery(document).ready(function($) {
 // scroll handler
  var scrollToAnchor = function( id, event ) {
	// grab the element to scroll to based on the name
	var elem = $("a[name='"+ id +"']");
	// if that didn't work, look for an element with our ID
	if ( typeof( elem.offset() ) === "undefined" ) {
	  elem = $("#"+id);
	}
	// if the destination element exists
	if ( typeof( elem.offset() ) !== "undefined" ) {
	  // cancel default event propagation
	  event.preventDefault();

	  // do the scroll
	  // also hide mobile menu
	  var scroll_to = elem.offset().top;
	  $('html, body').removeClass('mobile-menu-active').animate({
			  scrollTop: scroll_to
	  }, 600, 'swing', function() { if (scroll_to > 46) window.location.hash = id; } );
	}
  };
  // bind to click event
  $("a").click(function( event ) {
	// only do this if it's an anchor link
	  var href = $(this).attr("href");
	  var exclude = ['#tab-description', '#tab-additional_information', '#tab-reviews'];
	  if (exclude.includes(href)) {
		  return;
	  }
	  if (href && href.match("#") && href !== '#' && !$(this).hasClass('comment-reply-link')) {
	  // scroll to the location
	  var parts = href.split('#'),
		url = parts[0],
		target = parts[1];
	  if ((!url || url == window.location.href.split('#')[0]) && target)
		scrollToAnchor( target, event );
	}
  });
});

/*----------------------------------------------------
 * Responsive Navigation
 *--------------------------------------------------*/
if (mts_customscript.responsive && mts_customscript.nav_menu != 'none') {
	jQuery(document).ready(function($){
		$('#primary-navigation').append('<div id="mobile-menu-overlay" />');
		// merge if two menus exist
		if (mts_customscript.nav_menu == 'both' && !$('.navigation.mobile-only').length) {
			$('.navigation').not('.mobile-menu-wrapper').find('.menu').clone().appendTo('.mobile-menu-wrapper').hide();
		}
	
		$('.toggle-mobile-menu').click(function(e) {
			e.preventDefault();
			e.stopPropagation();
			$('body').toggleClass('mobile-menu-active');

			if ( $('body').hasClass('mobile-menu-active') ) {
				if ( $(document).height() > $(window).height() ) {
					var scrollTop = ( $('html').scrollTop() ) ? $('html').scrollTop() : $('body').scrollTop();
					$('html').addClass('noscroll').css( 'top', -scrollTop );
				}
				$('#mobile-menu-overlay').fadeIn();
			} else {
				var scrollTop = parseInt( $('html').css('top') );
				$('html').removeClass('noscroll');
				$('html,body').scrollTop( -scrollTop );
				$('#mobile-menu-overlay').fadeOut();
			}
		});
	}).on('click', function(event) {

		var $target = jQuery(event.target);
		if ( ( $target.hasClass("fa") && $target.parent().hasClass("toggle-caret") ) ||  $target.hasClass("toggle-caret") ) {// allow clicking on menu toggles
			return;
		}
		jQuery('body').removeClass('mobile-menu-active');
		jQuery('html').removeClass('noscroll');
		jQuery('#mobile-menu-overlay').fadeOut();
	});
}

/*----------------------------------------------------
 *  Dropdown menu
 * ------------------------------------------------- */
jQuery(document).ready(function($) {
	
	function mtsDropdownMenu() {
		var wWidth = $(window).width();
		if(wWidth > 865) {
			$('.navigation ul.sub-menu, .navigation ul.children').hide();
			var timer;
			var delay = 100;
			$('.navigation li').hover( 
			  function() {
				var $this = $(this);
				timer = setTimeout(function() {
					$this.children('ul.sub-menu, ul.children').slideDown('fast');
				}, delay);
				
			  },
			  function() {
				$(this).children('ul.sub-menu, ul.children').hide();
				clearTimeout(timer);
			  }
			);
		} else {
			$('.navigation li').unbind('hover');
			$('.navigation li.active > ul.sub-menu, .navigation li.active > ul.children').show();
		}
	}

	mtsDropdownMenu();

	$(window).resize(function() {
		mtsDropdownMenu();
	});
});

/*---------------------------------------------------
 *  Vertical menus toggles
 * -------------------------------------------------*/
jQuery(document).ready(function($) {

	$('.widget_nav_menu, .navigation .menu').addClass('toggle-menu');
	$('.toggle-menu ul.sub-menu, .toggle-menu ul.children').addClass('toggle-submenu');
	$('.toggle-menu ul.sub-menu').parent().addClass('toggle-menu-item-parent');

	$('.toggle-menu .toggle-menu-item-parent').append('<span class="toggle-caret"><i class="fa fa-plus"></i></span>');

	$('.toggle-caret').click(function(e) {
		e.preventDefault();
		$(this).parent().toggleClass('active').children('.toggle-submenu').slideToggle('fast');
	});
});

/*----------------------------------------------------
 * Social button scripts
 *---------------------------------------------------*/
jQuery(document).ready(function($){
	$('.share-item a').on('click', function(){
		newwindow=window.open($(this).attr('href'),'','height=330,width=750');
		if (window.focus) {newwindow.focus()}
		return false;
	});
	(function(d, s) {
	  var js, fjs = d.getElementsByTagName(s)[0], load = function(url, id) {
		if (d.getElementById(id)) {return;}
		js = d.createElement(s); js.src = url; js.id = id;
		fjs.parentNode.insertBefore(js, fjs);
	  };
	jQuery('span.facebookbtn, span.facebooksharebtn, .facebook_like').exists(function() {
	  load('//connect.facebook.net/en_US/all.js#xfbml=1&version=v2.8', 'fbjssdk');
	});
	jQuery('span.twitterbtn').exists(function() {
	  load('//platform.twitter.com/widgets.js', 'tweetjs');
	});
	jQuery('span.linkedinbtn').exists(function() {
	  load('//platform.linkedin.com/in.js', 'linkedinjs');
	});
	jQuery('span.pinbtn').exists(function() {
	  load('//assets.pinterest.com/js/pinit.js', 'pinterestjs');
	});
	}(document, 'script'));
});

/*----------------------------------------------------
 * Lazy load avatars
 *---------------------------------------------------*/
jQuery(document).ready(function($){
	var lazyloadAvatar = function(){
		$('.comment-author .avatar').each(function(){
			var distanceToTop = $(this).offset().top;
			var scroll = $(window).scrollTop();
			var windowHeight = $(window).height();
			var isVisible = distanceToTop - scroll < windowHeight;
			if( isVisible ){
				var hashedUrl = $(this).attr('data-src');
				if ( hashedUrl ) {
					$(this).attr('src',hashedUrl).removeClass('loading');
				}
			}
		});
	};
	if ( $('.comment-author .avatar').length > 0 ) {
		$('.comment-author .avatar').each(function(i,el){
			$(el).attr('data-src', el.src).removeAttr('src').addClass('loading');
		});
		$(function(){
			$(window).scroll(function(){
				lazyloadAvatar();
			});
		});
		lazyloadAvatar();
	}
});

/*----------------------------------------------------
 * Function called if AdBlock is detected
 *---------------------------------------------------*/
jQuery(window).load(function() {
	jQuery('.blocker-enabled-check').exists(function() {
		var adBlockDetected = function () {
			jQuery('body').addClass('blocker-enabled');
		}

		if (typeof FuckAdBlock === 'undefined') {
			jQuery(document).ready(adBlockDetected);
		} else {
			var myFuckAdBlock = new FuckAdBlock;
			myFuckAdBlock.on(true, adBlockDetected);
		}
	});
});