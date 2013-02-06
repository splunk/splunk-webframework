// Copyright 2012 Splunk, Inc.

define(function(require, exports, module) {
    var _ = require("underscore");
    var AppFx = require('./appfx');

    require("css!./messages.css");
    require("css!appfx/css/sprites.css");

    // Predefined control messages
    var messages = {
        'cancelled': {
            icon: "info-circle",
            level: "info",
            message: "Search was cancelled."
        },
        'empty': {
            icon: "blank",
            level: "",
            message: ""  
        },
        'no-events': {
            icon: "warning-sign",
            level: "warning",
            message: "Your search did not return any events."
        },
        'no-results': {
            icon: "warning-sign",
            level: "warning",
            message: "The search did not return any results."
        },
        'no-search': {
            icon: "info-circle", 
            level: "info", 
            message: "No search set."
        },
        'no-stats': {
            icon: "warning-sign",
            level: "warning",
            message: "Your search isn't generating any statistical results."
        },
        'not-started': {
            icon: "info-circle", 
            level: "info", 
            message: "No search started."
        },
        'waiting': {
            icon: "info-circle",
            level: "info",
            message: "Waiting for results..."
        }
    };
    
    var messageTemplate = '\
<div class="appfx-message-container">\
  <div class="appfx-message">\
    <i class="icon-<%= icon %> <%= level %>"></i><%= message %>\
  </div>\
</div>';

    var Messages = {
        // Render the indicated message into the given container element.
        // The `info` argument is either a message name (for predefined 
        // messages) or a literal message info structure.
        render: function(info, $el) {
            if (_.isString(info))
                info = messages[info]

            if (!info) {
                console.log("Warning: Unknown message: " + info);
                return;
            }

            $el.html(_.template(messageTemplate, info));
        }
    };

    return Messages;
});
