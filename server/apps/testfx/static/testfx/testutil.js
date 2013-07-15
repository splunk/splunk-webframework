define(function(require, exports, module) {
    var _ = require("underscore");
    
    var testutil = {
        // TODO: Rename as createUniqueName
        getUniqueName: function() {
            return _.uniqueId("deleteme_" + (new Date()).valueOf());
        },
        
        notImplemented: function(done) {
            done();
        },
        
        createUniqueDiv : function(attachTo, title){
            attachTo.append("</br><h4>+ "+title+"</h4>");
            var divName = this.getUniqueName();
            var newDiv = $("<div id='" + divName + "'></div>");
            attachTo.append(newDiv);
            return newDiv;
        },
        
        // ### Assertions ###
        
        assertEventuallyTrue: function(predicate, message, next) {
            var timeout = 1000; // ms
            var pollInterval = 20; // ms
        
            var endTime = new Date().getTime() + timeout;
        
            var poll = function() {
                if (predicate()) {
                    next();
                }
                else {
                    var curTime = new Date().getTime();
                    if (curTime < endTime) {
                        window.setTimeout(poll, pollInterval);
                    }
                    else {
                        throw "Timed out: " + message;
                    }
                }
            };
            poll();
        },
        
        // ### Mocks, Spies ###
        // 
        // TODO: Consider using a full spy/mock implementation from a
        //       testing library.
        
        createMethodSpy: function(parentObject, targetAttributeName) {
            var oldMethod = parentObject[targetAttributeName];
        
            var newMethod = function() {
                newMethod.callCount++;
                newMethod.callArguments = arguments;
            
                var returnValue = oldMethod.apply(this, arguments);
            
                newMethod.returnValue = returnValue;
            };
        
            newMethod.callCount = 0;
            newMethod.callArguments = null;
            newMethod.returnValue = undefined;
        
            newMethod.removeSpy = function() {
                parentObject[targetAttributeName] = oldMethod;
            };
        
            parentObject[targetAttributeName] = newMethod;
        },
        
        createMethodMock: function() {
            var nopObject = {
                nop: function() {}
            };
        
            testutil.createMethodSpy(nopObject, 'nop');
            return nopObject.nop;
        },
        
        createConstructorSpy: function(parentObject, targetAttributeName) {
            var OldConstructor = parentObject[targetAttributeName];
        
            // HACK: Depends on our class library implementation ("jquery.class").
            //       In particular, expects an "extend" method and an "init" method.
            //       This could be rewritten to be more robust with some more time.
            var NewConstructor = OldConstructor.extend({
                init: function() {
                    NewConstructor.callCount++;
                    NewConstructor.callArguments = arguments;
                
                    OldConstructor.prototype.init.apply(this, arguments);
                
                    NewConstructor.returnValue = this;
                }
            });
        
            NewConstructor.callCount = 0;
            NewConstructor.callArguments = null;
            NewConstructor.returnValue = undefined;
        
            NewConstructor.removeSpy = function() {
                parentObject[targetAttributeName] = OldConstructor;
            };
        
            parentObject[targetAttributeName] = NewConstructor;
        }
    };
    
    return testutil;
});
