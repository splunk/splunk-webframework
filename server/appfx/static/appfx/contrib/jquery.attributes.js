define(function(require, exports, module) {  
  // A small jquery plugin to get all the attributes of an element
  (function($) {
      $.fn.attributes = function() {
          var attributes = {}; 
          if(!this.length)
              return this;
          $.each(this[0].attributes, function(index, attr) {
              attributes[attr.name] = attr.value;
          }); 
          return attributes;
      }
  })(jQuery);
});