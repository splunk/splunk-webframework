// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {  
  // A small script, taken from http://jsfiddle.net/JEHmK/, to prevent an
  // accordion causing a dropdown to hide
  $(function () {
      $('body').off('click.collapse.data-api', '[data-toggle=collapse]');
      $('body').on('click.collapse.data-api', '[data-toggle=collapse]', function ( e ) {
        var $this = $(this), href
          , target = $this.attr('data-target')
            || e.preventDefault()
            || (href = $this.attr('href')) && href.replace(/.*(?=#[^\s]+$)/, '') //strip for ie7
          , option = $(target).data('collapse') ? 'toggle' : $this.data()
        $(target).collapse(option)
        if($this.parentsUntil('.dropdown-menu').length!==0){
            return false;
        }
      });
  });
});
