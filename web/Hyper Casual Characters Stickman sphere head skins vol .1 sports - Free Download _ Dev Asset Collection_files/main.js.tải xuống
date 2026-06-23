/*
* Plugin Name: WP Review Pro
* Plugin URI: http://mythemeshop.com/plugins/wp-review-pro/
* Description: Create reviews! Choose from Stars, Percentages, Circles or Points for review scores. Supports Retina Display, WPMU & Unlimited Color Schemes.
* Author: MyThemesShop
* Author URI: http://mythemeshop.com/
*/
jQuery(document).ready(function($) {
	
	$('.wp-review-comment-field.allowed-to-rate a').on('click', function() {
		var $this = $(this),
			$elem = $this.closest('.wp-review-comment-field');
		if ($elem.hasClass('allowed-to-rate')) {
			$elem.removeClass('has-not-rated-yet');
			$elem.find('.review-result').css('width', parseInt($this.data('input-value'))*20+'%');
			$elem.find('.wp_review_comment_rating').val($this.data('input-value'));
		}
	});
	
	// animate
	if ($('.review-wrapper').length) {
		$('.review-wrapper').wpr_appear().on('wpr_appear', function(event) {
	      // this element is now inside browser viewport
	      var $this = $(this);
	      if ($this.hasClass('delay-animation')) {
		      $this.removeClass('delay-animation');
		      if ($this.find('.wp-review-circle-rating').length) {
		      	$this.find('.wp-review-circle-rating').each(function(index, el) {
		      		if ($(el).closest('.wp-review-user-rating').length)
		      			return true; // don't animate circle-input

		      		var initial_value = $(el).data('initial_value');
		      		$({value: 0}).animate({value: initial_value}, {
					    duration: 2000,
					    easing:'swing',
					    step: function() 
					    {
					        $(el).val(Math.floor(this.value)).trigger('change');
					    },
					    complete: function() {
					    	$(el).val(initial_value).trigger('change');
					    }
					});
		      	});
	      	}
	      }
	    }).on('wpr_disappear', function(event) {
	      	var $this = $(this);
	    	//$this.addClass('delay-animation'); // rewind animation
	    });
	    $(window).load(function() {
	    	$.wpr_force_appear(); // if it's right there on window.load
	    });
	    
	}

	
	var $commentFeedback = $('.wp-review-feedback');
	$commentFeedback.on('click', 'a', function(e){
		var $this = $(this);

		e.preventDefault();

		if ( $this.hasClass('voted') || $this.siblings().hasClass('voted') || $commentFeedback.hasClass('processing') ) return;

		$.ajax({
			type: 'POST',
			url: wpreview.ajaxurl,
			beforeSend: function(){
				$commentFeedback.addClass('processing');
			},
			data: { action: 'mts_review_feedback', isHelpful: $this.data('value'), commentId: $this.data('comment-id') },
			success: function(data){
				$this.closest('.wp-review-feedback').find('a').removeClass('voted');
				$this.addClass('voted').find('.feedback-count').text('('+data+')');
			},
			error: function(jqXHR){
				alert(jqXHR.responseText);
			},
			complete: function() {
				$commentFeedback.removeClass('processing');
			}
		});
	});
	

	/* 
		Add class to comment form
	 */
	if ($('#wp-review-comment-title-field').length) {
		$('#wp-review-comment-title-field').closest('form').addClass('wp-review-comment-form');
	}

});

function wp_review_rate( $elem ) {// rating, postid, nonce ) {
	var is_comment_rating = ($elem.is('.wp-review-comment-rating-star') || !!$elem.closest('.wp-review-comment-rating-star').length);
	if ( is_comment_rating ) {
		return ''; // don't do anything if it's a comment rating element
	}
	var rating = $elem.find('.wp-review-user-rating-val').val();
	var postid = $elem.find('.wp-review-user-rating-postid').val();
	var token = $elem.find('.wp-review-user-rating-nonce').val();
	var $target = $elem;
	
	if ( ! $target.is('.wp-review-user-rating') )
		$target = $elem.closest('.wp-review-user-rating');

	if (rating == 0) {
		return '';
	}

	jQuery.ajax ({
		beforeSend: function() {
			$target.addClass('wp-review-loading');
		},
		data: { action: 'wp_review_rate', post_id: postid, nonce: token, review: rating },
		type: 'post',
		dataType: 'json',
		url: wpreview.ajaxurl,
		success: function( response ){
			$target.removeClass('wp-review-loading');
			if (typeof response.html !== 'undefined' && response.html != '') {
				$target.empty().append(response.html).addClass('has-rated');
			}
				
			// update text total
			if (typeof response.rating_total !== 'undefined' && response.rating_total != '') {
				$target.parent().find('.wp-review-user-rating-total').text(response.rating_total);	
			}
			// update rating count
			if (typeof response.rating_count !== 'undefined' && response.rating_count != '') {
				$target.parent().find('.wp-review-user-rating-counter').text(response.rating_count);				
			}
		}
	});

	
}