
/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.4 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.4',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && navigator && document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value !== 'string') {
                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    //Allow getting a global that expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite and existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                pkgs: {},
                shim: {},
                map: {},
                config: {}
            },
            registry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; ary[i]; i += 1) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                        //End of the line. Keep at least one non-dot
                        //path segment at the front so it can be mapped
                        //correctly to disk. Otherwise, there is likely
                        //no path mapping for a path starting with '..'.
                        //This can still fail, but catches the most reasonable
                        //uses of ..
                        break;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgName, pkgConfig, mapValue, nameParts, i, j, nameSegment,
                foundMap, foundI, foundStarMap, starI,
                baseParts = baseName && baseName.split('/'),
                normalizedBaseParts = baseParts,
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name && name.charAt(0) === '.') {
                //If have a base name, try to normalize against it,
                //otherwise, assume it is a top-level require that will
                //be relative to baseUrl in the end.
                if (baseName) {
                    if (getOwn(config.pkgs, baseName)) {
                        //If the baseName is a package name, then just treat it as one
                        //name to concat the name with.
                        normalizedBaseParts = baseParts = [baseName];
                    } else {
                        //Convert baseName to array, and lop off the last part,
                        //so that . matches that 'directory' and not name of the baseName's
                        //module. For instance, baseName of 'one/two/three', maps to
                        //'one/two/three.js', but we want the directory, 'one/two' for
                        //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    }

                    name = normalizedBaseParts.concat(name.split('/'));
                    trimDots(name);

                    //Some use of packages may use a . path to reference the
                    //'main' module name, so normalize for that.
                    pkgConfig = getOwn(config.pkgs, (pkgName = name[0]));
                    name = name.join('/');
                    if (pkgConfig && name === pkgName + '/' + pkgConfig.main) {
                        name = pkgName;
                    }
                } else if (name.indexOf('./') === 0) {
                    // No baseName, so this is ID is resolved relative
                    // to baseUrl, pull off the leading dot.
                    name = name.substring(2);
                }
            }

            //Apply map config if available.
            if (applyMap && (baseParts || starMap) && map) {
                nameParts = name.split('/');

                for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break;
                                }
                            }
                        }
                    }

                    if (foundMap) {
                        break;
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            return name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                removeScript(id);
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);
                context.require([id]);
                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        normalizedName = normalize(name, parentName, applyMap);
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                getModule(depMap).on(name, fn);
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                //Array splice in the values since the context code has a
                //local var ref to defQueue, so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [defQueue.length - 1, 0].concat(globalDefQueue));
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return mod.exports;
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            return (config.config && getOwn(config.config, mod.map.id)) || {};
                        },
                        exports: defined[mod.map.id]
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var map, modId, err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(registry, function (mod) {
                map = mod.map;
                modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks is the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error.
                            if (this.events.error) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            if (this.map.isDefine) {
                                //If setting exports via 'module' is in play,
                                //favor that over return value and exports. After that,
                                //favor a non-undefined return value over exports use.
                                cjsModule = this.module;
                                if (cjsModule &&
                                        cjsModule.exports !== undefined &&
                                        //Make sure it is not already the exports value
                                        cjsModule.exports !== this.exports) {
                                    exports = cjsModule.exports;
                                } else if (exports === undefined && this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = [this.map.id];
                                err.requireType = 'define';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        delete registry[id];

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', this.errback);
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' + args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths and packages since they require special processing,
                //they are additive.
                var pkgs = config.pkgs,
                    shim = config.shim,
                    objs = {
                        paths: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (prop === 'map') {
                            mixin(config[prop], value, true, true);
                        } else {
                            mixin(config[prop], value, true);
                        }
                    } else {
                        config[prop] = value;
                    }
                });

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;
                        location = pkgObj.location;

                        //Create a brand new object on pkgs, since currentPackages can
                        //be passed in again, and config.pkgs is the internal transformed
                        //state for all package configs.
                        pkgs[pkgObj.name] = {
                            name: pkgObj.name,
                            location: location || pkgObj.name,
                            //Remove leading dot in main, so main paths are normalized,
                            //and remove any trailing .js, since different package
                            //envs have different conventions: some use a module name,
                            //some use a file name.
                            main: (pkgObj.main || 'main')
                                  .replace(currDirRegExp, '')
                                  .replace(jsSuffixRegExp, '')
                        };
                    });

                    //Done with modifications, assing packages back to context config
                    config.pkgs = pkgs;
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext, url,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        url = context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext || '.fake');
                        return ext ? url : url.substring(0, url.length - 5);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overriden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext) {
                var paths, pkgs, pkg, pkgPath, syms, i, parentModule, url,
                    parentPath;

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;
                    pkgs = config.pkgs;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');
                        pkg = getOwn(pkgs, parentModule);
                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        } else if (pkg) {
                            //If module name is just the package name, then looking
                            //for the main module.
                            if (moduleName === pkg.name) {
                                pkgPath = pkg.location + '/' + pkg.main;
                            } else {
                                pkgPath = pkg.location;
                            }
                            syms.splice(0, i, pkgPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/\?/.test(url) ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callack function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    return onError(makeError('scripterror', 'Script error', evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = function (err) {
        throw err;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = config.xhtml ?
                    document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                    document.createElement('script');
            node.type = config.scriptType || 'text/javascript';
            node.charset = 'utf-8';
            node.async = true;

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEvenListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            //In a web worker, use importScripts. This is not a very
            //efficient use of importScripts, importScripts will block until
            //its script is downloaded and evaluated. However, if web workers
            //are in play, the expectation that a build has been done so that
            //only one script needs to be loaded anyway. This may need to be
            //reevaluated if other use cases become common.
            importScripts(url);

            //Account for anonymous modules
            context.completeLoad(moduleName);
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = dataMain.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                    dataMain = mainScript;
                }

                //Strip off any trailing .js since dataMain is now
                //like a module name.
                dataMain = dataMain.replace(jsSuffixRegExp, '');

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(dataMain) : [dataMain];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = [];
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps.length && isFunction(callback)) {
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        (context ? context.defQueue : globalDefQueue).push([name, deps, callback]);
    };

    define.amd = {
        jQuery: true
    };


    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));
define("splunkjs/contrib/require", function(){});

define('splunkjs/config',{});
// reference this from another build profile with mainConfigFile: './shared.build.profile.js'
require.config({
    baseUrl: '../',
    preserveLicenseComments: false,
    wrap: {
        startFile: [
            // load the json2 library so that all modules get the cross-browser JSON support
            // without having to declare it as a dependency
            '../contrib/json2.js'
        ],
        end: ' '
    },
    stubModules: ['contrib/text'],
    map: {
        "*": {
            css: "splunkjs/contrib/require-css/css"
        }
    },
    paths: {
        // paths outside of baseUrl
        'templates': '../../templates',

        // jQuery and contrib plugins
        'jquery': 'contrib/jquery-1.8.2',
        'jquery.history': 'contrib/jquery.history',
        'jquery.bgiframe': 'contrib/jquery.bgiframe.min',
        'jquery.cookie': 'contrib/jquery.cookie',

        // internal jQuery plugins
        'splunk.jquery.csrf': 'splunk.jquery.csrf_protection',
        'splunk.widget.popupmenu': 'splunk.widget.popupMenu',

        // jQuery UI plugins
        'jquery.ui.core': 'contrib/jquery/ui/jquery.ui.core',
        'jquery.ui.widget': 'contrib/jquery/ui/jquery.ui.widget',
        'jquery.ui.datepicker': 'contrib/jquery/ui/jquery.ui.datepicker',
        'jquery.ui.button': 'contrib/jquery/ui/jquery.ui.button',
        'jquery.ui.menu': 'contrib/jquery/ui/jquery.ui.menu',
        'jquery.ui.popup': 'contrib/jquery/ui/jquery.ui.popup',
        'jquery.ui.position': 'contrib/jquery/ui/jquery.ui.position',
        'jquery.ui.mouse': 'contrib/jquery/ui/jquery.ui.mouse',
        'jquery.ui.draggable': 'contrib/jquery/ui/jquery.ui.draggable',
        'jquery.ui.droppable': 'contrib/jquery/ui/jquery.ui.droppable',
        'jquery.ui.sortable': 'contrib/jquery/ui/jquery.ui.sortable',
        'jquery.ui.dialog': 'contrib/jquery/ui/jquery.ui.dialog',
        'jquery.ui.resizable': 'contrib/jquery/ui/jquery.ui.resizable',
        'jquery.ui.effect': 'contrib/jquery/ui/jquery.ui.effect',
        'jquery.ui.effect-bounce': 'contrib/jquery/ui/jquery.ui.effect-bounce',
        'jquery.ui.effect-shake': 'contrib/jquery/ui/jquery.ui.effect-shake',

        // bootstrap components
        // FIXME: bootstrap.button collides with jquery.ui.button on the jQuery prototype !!
        'bootstrap.affix': 'contrib/bootstrap-2.3.1/bootstrap-affix',
        'bootstrap.alert': 'contrib/bootstrap-2.3.1/bootstrap-alert',
        'bootstrap.button': 'contrib/bootstrap-2.3.1/bootstrap-button',
        'bootstrap.carousel': 'contrib/bootstrap-2.3.1/bootstrap-carousel',
        'bootstrap.collapse': 'contrib/bootstrap-2.3.1/bootstrap-collapse',
        'bootstrap.dropdown': 'contrib/bootstrap-2.3.1/bootstrap-dropdown',
        'bootstrap.modal': 'contrib/bootstrap-2.3.1/bootstrap-modal',
        'bootstrap.popover': 'contrib/bootstrap-2.3.1/bootstrap-popover',
        'bootstrap.scrollspy': 'contrib/bootstrap-2.3.1/bootstrap-scrollspy',
        'bootstrap.tab': 'contrib/bootstrap-2.3.1/bootstrap-tab',
        'bootstrap.tooltip': 'contrib/bootstrap-2.3.1/bootstrap-tooltip',
        'bootstrap.transition': 'contrib/bootstrap-2.3.1/bootstrap-transition',
        'bootstrap.typeahead': 'contrib/bootstrap-2.3.1/bootstrap-typeahead',

        // other contrib libraries
        'moment': 'contrib/moment',
        'underscore': 'contrib/underscore',
        'backbone': 'contrib/backbone',
        'highcharts': 'contrib/highcharts-2.3.5/highcharts',
        'highcharts.runtime_patches': 'contrib/highcharts-2.3.5/runtime_patches',
        'json': 'contrib/json2',
        'backbone_validation': 'contrib/backbone-validation-amd',
        'prettify': 'contrib/google-code-prettify/prettify',
        /* augments builtin prototype */
        'strftime': 'contrib/strftime',
        'swfobject': 'contrib/swfobject',
        'leaflet': 'contrib/leaflet/leaflet',
        'jg_global': 'contrib/jg_global',
        'jgatt': 'contrib/jg_library',
        'lowpro': 'contrib/lowpro_for_jquery',
        'spin': 'contrib/spin',

        // Splunk legacy
        'splunk': 'splunk',
        'splunk.legend': 'legend',
        'splunk.logger': 'logger',
        'splunk.util': 'util',
        'splunk.pdf': 'pdf',
        'splunk.i18n': 'build/helpers/i18n.stub',
        'splunk.config': 'build/helpers/splunk.config.stub',
        'splunk.paginator': 'paginator',
        'splunk.messenger': 'messenger',
        'splunk.time': 'splunk_time',
        'splunk.timerange': 'time_range',
        'splunk.window': 'window',
        'splunk.jabridge': 'ja_bridge',
        'splunk.print': 'print',
        'splunk.session': 'session',
        
        // splunkjs
        "async": "splunkjs/contrib/requirejs-plugins/async",
        "select2": "contrib/select2-3.3.1"
    },
    shim: {

        /* START splunkjs */
        'splunkjs/splunk': {
            deps: ['jquery'],
            exports: 'splunkjs'
        },
        
        /* Select2*/
        "select2/select2": {
            deps: ["jquery"],
            exports: "Select2"
        },

        /* START contrib jQuery plugins */
        'jquery.cookie': {
            deps: ['jquery']
        },
        'jquery.history': {
            deps: ['jquery'],
                exports: 'History'
        },
        'jquery.bgiframe': {
            deps: ['jquery']
        },

        "jquery.attributes": {
            deps: ['jquery']
        },

        "jquery.spin": {
            deps: ['jquery']
        },

        "jquery.sparkline": {
            deps: ['jquery']
        },

        "jquery.deparam": {
            deps: ['jquery']
        },

        /* START internal jQuery plugins */
        'splunk.jquery.csrf_protection': {
            deps: ['jquery.cookie', 'splunk.util']
        },

        /* START jQuery UI plugins */
        'jquery.ui.core': {
            deps: ['jquery']
        },
        'jquery.ui.widget': {
            deps: ['jquery.ui.core']
        },
        'jquery.ui.position': {
            deps: ['jquery.ui.widget']
        },
        'jquery.ui.mouse': {
            deps: ['jquery.ui.widget']
        },
        'jquery.ui.popup': {
            deps: ['jquery.ui.widget', 'jquery.ui.position']
        },
        'jquery.ui.sortable': {
            deps: ['jquery.ui.widget', 'jquery.ui.mouse', 'jquery.ui.draggable', 'jquery.ui.droppable']
        },
        'jquery.ui.draggable': {
            deps: ['jquery.ui.widget', 'jquery.ui.mouse']
        },
        'jquery.ui.droppable': {
            deps: ['jquery.ui.widget', 'jquery.ui.mouse']
        },
        'jquery.ui.resizable': {
            deps: ['jquery.ui.widget', 'jquery.ui.mouse']
        },
        'jquery.ui.datepicker': {
            deps: ['jquery', 'jquery.ui.widget', 'splunk.i18n'],
            exports: 'jquery.ui.datepicker',
            init: function(jQuery, widget, i18n) {
                var initFn = i18n.jQuery_ui_datepicker_install;
                if (typeof initFn === 'function') {
                    initFn(jQuery);
                }
                return jQuery.ui.datepicker;
            }
        },
        'jquery.ui.button': {
            deps: ['jquery.ui.widget']
        },
        'jquery.ui.menu': {
            deps: ['jquery.ui.widget', 'jquery.ui.position']
        },
        'jquery.ui.dialog': {
            deps: ['jquery.ui.widget']
        },
        'jquery.ui.effect': {
            deps: ['jquery']
        },
        'jquery.ui.effect-bounce': {
            deps: ['jquery.ui.effect']
        },
        'jquery.ui.effect-shake': {
            deps: ['jquery.ui.effect']
        },

        // bootstrap components
        'bootstrap.affix': {
            deps: ['jquery']
        },
        'bootstrap.alert': {
            deps: ['jquery']
        },
        'bootstrap.button': {
            deps: ['jquery']
        },
        'bootstrap.carousel': {
            deps: ['jquery']
        },
        'bootstrap.collapse': {
            deps: ['jquery']
        },
        'bootstrap.dropdown': {
            deps: ['jquery']
        },
        'bootstrap.modal': {
            deps: ['jquery']
        },
        'bootstrap.popover': {
            deps: ['jquery', 'bootstrap.tooltip']
        },
        'bootstrap.scrollspy': {
            deps: ['jquery']
        },
        'bootstrap.tab': {
            deps: ['jquery']
        },
        'bootstrap.tooltip': {
            deps: ['jquery']
        },
        'bootstrap.transition': {
            deps: ['jquery']
        },
        'bootstrap.typeahead': {
            deps: ['jquery']
        },

        /* START other contrib libraries */
        underscore: {
            deps: ['splunk.i18n'],
            exports: '_',
            init: function(i18n) {
                // use underscore's mixin functionality to add the ability to localize a string
                this._.mixin({
                    t: function(string) {
                        return i18n._(string);
                    }
                });
                // can't put underscore in no conflict mode here because Backbone needs to find it on the global scope
                return this._;
            }
        },
        backbone: {
            deps: ['jquery', 'underscore'],
            exports: 'Backbone',
            init: function($, _) {
                // now that Backbone has a reference to underscore, we need to give the '_' back to i18n
                _.noConflict();

                // inject a reference to jquery in case we ever run it in no conflict mode
                // set up for forward compatibility with Backbone, setDomLibrary is being replaced with Backbone.$
                if(this.Backbone.hasOwnProperty('setDomLibrary')) {
                    this.Backbone.setDomLibrary($);
                }
                else {
                    this.Backbone.$ = $;
                }
                return this.Backbone.noConflict();
            }
        },
        "backbone.nested": {
            // Not sure if needed
            deps: ['backbone'],
            exports: 'Backbone.NestedModel'
        },
        highcharts: {
            deps: ['jquery', 'highcharts.runtime_patches'],
            exports: 'Highcharts',
            init: function($, runtimePatches) {
                runtimePatches.applyPatches(this.Highcharts);
                return this.Highcharts;
            }
        },
        json: {
            exports: 'JSON'
        },
        swfobject: {
            exports: 'swfobject'
        },
        prettify: {
            exports: 'prettyPrint'
        },
        leaflet: {
            deps: ['jquery', 'splunk.util', 'contrib/text!contrib/leaflet/leaflet.css', 'contrib/text!contrib/leaflet/leaflet.ie.css'],
            exports: 'L',
            init: function($, SplunkUtil, css, iecss) {
                // resolve image urls
                css = css.replace(/url\(images/g, "url(" + SplunkUtil.make_url("/static/js/contrib/leaflet/images"));

                // inject css into head
                $("head").append("<style type=\"text/css\">" + css + "</style>");

                // if IE <= 8, inject iecss into head
                if ($.browser.msie && (Number($.browser.version) <= 8))
                    $("head").append("<style type=\"text/css\">" + iecss + "</style>");
            }
        },
        jg_global: {
            // exports just needs to be one of the globals that is created so that require can verify that the source was loaded
            exports: 'jg_namespace',
            init: function() {
                return {
                    jg_namespace: this.jg_namespace,
                    jg_extend: this.jg_extend,
                    jg_static: this.jg_static,
                    jg_mixin: this.jg_mixin,
                    jg_has_mixin: this.jg_has_mixin
                };
            }
        },
        jgatt: {
            deps: ['jg_global'],
            exports: 'jgatt'
        },
        lowpro: {
            deps: ['jquery']
        },

        /* Start Splunk legacy */
        splunk: {
            exports: 'Splunk'
        },
        'splunk.util': {
            deps: ['jquery', 'splunk', 'splunk.config'],
            exports: 'Splunk.util',
            init: function($, Splunk, config) {
                return $.extend({ sprintf: this.sprintf }, Splunk.util);
            }
        },
        'splunk.legend': {
            deps: ['splunk'],
                exports: 'Splunk.Legend'
        },
        'splunk.logger': {
            deps: ['splunk', 'splunk.util'],
                exports: 'Splunk.Logger'
        },
        'splunk.pdf': {
            deps: ['splunk', 'splunk.util', 'jquery'],
            exports: 'Splunk.pdf'
        },
        strftime: {
            deps: []
        },
        'splunk.paginator': {
            deps: ['splunk'],
                exports: 'Splunk.paginator'
        },
        'splunk.jquery.csrf': {
            deps: ['jquery', 'jquery.cookie', 'splunk.util']
        },
        'splunk.messenger': {
            deps: ['splunk', 'splunk.util', 'splunk.logger', 'splunk.i18n', 'lowpro'],
            exports: 'Splunk.Messenger'
        },
        'splunk.time': {
            deps: ['jg_global', 'jgatt'],
            exports: 'splunk.time'
        },
        'splunk.timerange': {
            deps: ['splunk', 'splunk.util', 'splunk.logger', 'splunk.i18n', 'splunk.time', 'lowpro'],
            exports: 'Splunk.Timerange',
            init: function(Splunk) {
                Splunk.namespace("Globals");
                if (!Splunk.Globals.timeZone)
                    Splunk.Globals.timeZone = new Splunk.TimeZone(Splunk.util.getConfigValue('SERVER_ZONEINFO'));
                return Splunk.TimeRange;
            }
        },
        'splunk.window': {
            deps: ['splunk', 'splunk.util', 'splunk.i18n'],
            exports: 'Splunk.window'
        },
        'splunk.jabridge': {
            deps: ['splunk'],
            exports: 'Splunk.JABridge'
        },
        'splunk.print': {
            deps: ['jquery', 'lowpro', 'splunk', 'splunk.logger'],
            exports: 'Splunk.Print'
        },
        'splunk.session': {
            deps: ['lowpro', 'splunk', 'jquery', 'splunk.logger', 'splunk.util', 'swfobject'],
            exports: 'Splunk.Session'
        }
    }
})


;
define("profiles/shared", function(){});


requirejs.config({"paths":{"splunkjs/contrib/require":"splunkjs/config","splunkjs/config":"splunkjs/config","profiles/shared":"splunkjs/config","strftime":"splunkjs/mvc","jquery":"splunkjs/mvc","splunk":"splunkjs/mvc","splunk.config":"splunkjs/mvc","splunk.util":"splunkjs/mvc","splunk.i18n":"splunkjs/mvc","underscore":"splunkjs/mvc","backbone":"splunkjs/mvc","util/console":"splunkjs/mvc","splunkjs/mvc/basetokenmodel":"splunkjs/mvc","splunkjs/mvc/registry":"splunkjs/mvc","splunkjs/contrib/jquery.deparam":"splunkjs/mvc","splunkjs/mvc/protections":"splunkjs/mvc","splunkjs/mvc/tokensafestring":"splunkjs/mvc","splunkjs/mvc/basemodel":"splunkjs/mvc","splunkjs/mvc/tokenutils":"splunkjs/mvc","splunkjs/mvc/utils":"splunkjs/mvc","splunkjs/mvc/contextbound":"splunkjs/mvc","path":"splunkjs/mvc","/package.json":"splunkjs/mvc","/index.js":"splunkjs/mvc","/lib/log.js":"splunkjs/mvc","/lib/utils.js":"splunkjs/mvc","/lib/context.js":"splunkjs/mvc","/lib/paths.js":"splunkjs/mvc","/lib/jquery.class.js":"splunkjs/mvc","/lib/http.js":"splunkjs/mvc","/lib/service.js":"splunkjs/mvc","/lib/async.js":"splunkjs/mvc","/lib/platform/client/proxy_http.js":"splunkjs/mvc","/lib/entries/browser.ui.entry.js":"splunkjs/mvc","/contrib/script.js":"splunkjs/mvc","/browser.entry.js":"splunkjs/mvc","splunkjs/splunk":"splunkjs/mvc","splunkjs/mvc/mvc":"splunkjs/mvc","splunkjs/mvc":"splunkjs/mvc","contrib/text":"splunkjs/mvc","splunkjs/contrib/require-css/normalize":"splunkjs/mvc","splunkjs/contrib/require-css/css":"splunkjs/mvc","jquery.ui.core":"splunkjs/mvc","jquery.ui.widget":"splunkjs/mvc","jquery.ui.position":"splunkjs/mvc","jquery.ui.datepicker":"splunkjs/mvc","jquery.ui.mouse":"splunkjs/mvc","jquery.ui.resizable":"splunkjs/mvc","jquery.ui.draggable":"splunkjs/mvc","lowpro":"splunkjs/mvc","jquery.bgiframe":"splunkjs/mvc","bootstrap.tooltip":"splunkjs/mvc","bootstrap.modal":"splunkjs/mvc","bootstrap.dropdown":"splunkjs/mvc","bootstrap.transition":"splunkjs/mvc","bootstrap.tab":"splunkjs/mvc","select2/select2":"splunkjs/mvc","highcharts.runtime_patches":"splunkjs/mvc","highcharts":"splunkjs/mvc","splunk.legend":"splunkjs/mvc","splunk.logger":"splunkjs/mvc","jquery.cookie":"splunkjs/mvc","splunk.jquery.csrf":"splunkjs/mvc","splunk.print":"splunkjs/mvc","jg_global":"splunkjs/mvc","jgatt.events.EventData":"splunkjs/mvc","jgatt.utils.TypeUtils":"splunkjs/mvc","jgatt.properties.Property":"splunkjs/mvc","jgatt.utils.Dictionary":"splunkjs/mvc","jgatt.properties.MPropertyTarget":"splunkjs/mvc","jgatt.utils.ErrorUtils":"splunkjs/mvc","jgatt.events.Event":"splunkjs/mvc","jgatt.events.ChainedEvent":"splunkjs/mvc","jgatt.events.MEventTarget":"splunkjs/mvc","jgatt.events.MObservable":"splunkjs/mvc","jgatt.geom.Point":"splunkjs/mvc","jgatt.geom.Matrix":"splunkjs/mvc","jgatt.geom.Rectangle":"splunkjs/mvc","jgatt.graphics.Caps":"splunkjs/mvc","jgatt.utils.NumberUtils":"splunkjs/mvc","jgatt.graphics.ColorUtils":"splunkjs/mvc","jgatt.graphics.GradientType":"splunkjs/mvc","jgatt.graphics.Graphics":"splunkjs/mvc","jgatt.graphics.Joints":"splunkjs/mvc","jgatt.properties.PropertyEventData":"splunkjs/mvc","jgatt.graphics.brushes.Brush":"splunkjs/mvc","jgatt.graphics.brushes.DrawingUtils":"splunkjs/mvc","jgatt.utils.FunctionUtils":"splunkjs/mvc","jgatt.properties.ObservableProperty":"splunkjs/mvc","jgatt.graphics.brushes.TileBrush":"splunkjs/mvc","jgatt.properties.ObservableArrayProperty":"splunkjs/mvc","jgatt.graphics.brushes.GradientFillBrush":"splunkjs/mvc","jgatt.graphics.brushes.GroupBrush":"splunkjs/mvc","jgatt.graphics.brushes.SolidFillBrush":"splunkjs/mvc","jgatt.graphics.brushes.SolidStrokeBrush":"splunkjs/mvc","jgatt.graphics.brushes.StretchMode":"splunkjs/mvc","jgatt.motion.easers.Easer":"splunkjs/mvc","jgatt.motion.Tween":"splunkjs/mvc","jgatt.properties.ArrayProperty":"splunkjs/mvc","jgatt.motion.GroupTween":"splunkjs/mvc","jgatt.motion.interpolators.Interpolator":"splunkjs/mvc","jgatt.motion.interpolators.NumberInterpolator":"splunkjs/mvc","jgatt.motion.MethodTween":"splunkjs/mvc","jgatt.motion.PropertyTween":"splunkjs/mvc","jgatt.motion.TweenRunner":"splunkjs/mvc","jgatt.motion.easers.CubicEaser":"splunkjs/mvc","jgatt.motion.easers.EaseDirection":"splunkjs/mvc","jgatt.utils.Comparator":"splunkjs/mvc","jgatt.utils.AlphabeticComparator":"splunkjs/mvc","jgatt.utils.NaturalComparator":"splunkjs/mvc","jgatt.utils.ArrayUtils":"splunkjs/mvc","jgatt.utils.FunctionComparator":"splunkjs/mvc","jgatt.utils.GroupComparator":"splunkjs/mvc","jgatt.utils.NumericComparator":"splunkjs/mvc","jgatt.utils.PropertyComparator":"splunkjs/mvc","jgatt.utils.ReverseComparator":"splunkjs/mvc","jgatt.utils.SequentialNumericComparator":"splunkjs/mvc","jgatt.utils.StringUtils":"splunkjs/mvc","jgatt.validation.ValidateEventData":"splunkjs/mvc","jgatt.validation.ValidatePass":"splunkjs/mvc","jgatt.validation.ValidateQueue":"splunkjs/mvc","jgatt.validation.MValidateTarget":"splunkjs/mvc","jgatt":"splunkjs/mvc","splunkjs/ready":"splunkjs/mvc","uri/route":"splunkjs/mvc","splunkjs/mvc/drilldown":"splunkjs/mvc","splunkjs/mvc/basemanager":"splunkjs/mvc","mixins/xhrmanagement":"splunkjs/mvc","util/math_utils":"splunkjs/mvc","util/general_utils":"splunkjs/mvc","util/splunkd_utils":"splunkjs/mvc","splunkjs/compiled/splunkd_utils":"splunkjs/mvc","backbone_validation":"splunkjs/mvc","validation/ValidationMixin":"splunkjs/mvc","models/Base":"splunkjs/mvc","splunkjs/mvc/tokenawaremodel":"splunkjs/mvc","splunkjs/mvc/settings":"splunkjs/mvc","splunkjs/mvc/basesplunkview":"splunkjs/mvc","splunkjs/mvc/messages":"splunkjs/mvc","splunkjs/mvc/splunkresultsmodel":"splunkjs/mvc","splunkjs/mvc/searchmodel":"splunkjs/mvc","splunkjs/mvc/searchmanager":"splunkjs/mvc","splunkjs/mvc/savedsearchmanager":"splunkjs/mvc","splunkjs/mvc/simplesplunkview":"splunkjs/mvc","splunkjs/compiled/models":"splunkjs/compiled/models","collections/Base":"splunkjs/compiled/models","models/SplunkDWhiteList":"splunkjs/compiled/models","models/services/ACL":"splunkjs/compiled/models","models/ACLReadOnly":"splunkjs/compiled/models","models/SplunkDBase":"splunkjs/compiled/models","models/fetch_data/EAIFetchData":"splunkjs/compiled/models","collections/SplunkDsBase":"splunkjs/compiled/models","models/SystemMenuSection":"splunkjs/compiled/models","collections/SystemMenuSections":"splunkjs/compiled/models","models/FlashMessage":"splunkjs/compiled/models","collections/FlashMessages":"splunkjs/compiled/models","models/services/AppLocal":"splunkjs/compiled/models","collections/services/AppLocals":"splunkjs/compiled/models","models/services/authentication/CurrentContext":"splunkjs/compiled/models","collections/services/authentication/CurrentContexts":"splunkjs/compiled/models","models/services/data/ui/Manager":"splunkjs/compiled/models","collections/services/data/ui/Managers":"splunkjs/compiled/models","moment":"splunkjs/compiled/models","util/moment":"splunkjs/compiled/models","util/time_utils":"splunkjs/compiled/models","models/services/data/ui/Time":"splunkjs/compiled/models","collections/services/data/ui/Times":"splunkjs/compiled/models","models/services/data/ui/View":"splunkjs/compiled/models","collections/services/data/ui/Views":"splunkjs/compiled/models","models/services/Message":"splunkjs/compiled/models","collections/services/Messages":"splunkjs/compiled/models","models/services/SavedSearch":"splunkjs/compiled/models","collections/services/SavedSearches":"splunkjs/compiled/models","models/services/search/TimeParser":"splunkjs/compiled/models","collections/services/search/TimeParsers":"splunkjs/compiled/models","models/Application":"splunkjs/compiled/models","models/DateInput":"splunkjs/compiled/models","models/TimeRange":"splunkjs/compiled/models","models/services/authentication/User":"splunkjs/compiled/models","models/services/data/ui/Nav":"splunkjs/compiled/models","models/services/data/UserPref":"splunkjs/compiled/models","models/services/server/ServerInfo":"splunkjs/compiled/models","helpers/user_agent":"splunkjs/compiled/models","util/router_utils":"splunkjs/compiled/models","models/classicurl":"splunkjs/compiled/models","splunkjs/compiled/views":"splunkjs/compiled/views","views/Base":"splunkjs/compiled/views","views/shared/Modal":"splunkjs/compiled/views","views/shared/controls/Control":"splunkjs/compiled/views","views/shared/delegates/Base":"splunkjs/compiled/views","views/shared/delegates/PopdownDialog":"splunkjs/compiled/views","views/shared/delegates/Popdown":"splunkjs/compiled/views","views/shared/controls/SyntheticSelectControl":"splunkjs/compiled/views","views/shared/controls/SyntheticRadioControl":"splunkjs/compiled/views","views/shared/controls/SyntheticCheckboxControl":"splunkjs/compiled/views","views/shared/controls/TextareaControl":"splunkjs/compiled/views","views/shared/controls/LabelControl":"splunkjs/compiled/views","views/shared/controls/TextControl":"splunkjs/compiled/views","views/shared/controls/DateControl":"splunkjs/compiled/views","views/shared/controls/ControlGroup":"splunkjs/compiled/views","views/shared/delegates/StopScrollPropagation":"splunkjs/compiled/views","views/shared/delegates/TextareaResize":"splunkjs/compiled/views","helpers/FlashMessagesHelper":"splunkjs/compiled/views","views/shared/FlashMessages":"splunkjs/compiled/views","views/shared/timerangepicker/dialog/Presets":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/Relative":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/RealTime":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/daterange/BetweenDates":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/daterange/BeforeDate":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/daterange/AfterDate":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/daterange/Master":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/dateandtimerange/timeinput/HoursMinutesSeconds":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/dateandtimerange/timeinput/Master":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/dateandtimerange/Master":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/advanced/timeinput/Hint":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/advanced/timeinput/Master":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/advanced/Master":"splunkjs/mvc/timepickerview","views/shared/delegates/Accordion":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/dialog/Master":"splunkjs/mvc/timepickerview","views/shared/timerangepicker/Master":"splunkjs/mvc/timepickerview","splunkjs/mvc/sharedmodels":"splunkjs/mvc/timepickerview","splunkjs/mvc/timepickerview":"splunkjs/mvc/timepickerview","views/shared/results_table/ResultsTableHeader":"splunkjs/mvc/tableview","views/shared/results_table/renderers/BaseCellRenderer":"splunkjs/mvc/tableview","views/shared/results_table/ResultsTableRow":"splunkjs/mvc/tableview","views/shared/delegates/ColumnSort":"splunkjs/mvc/tableview","views/shared/delegates/TableDock":"splunkjs/mvc/tableview","views/shared/delegates/TableHeadStatic":"splunkjs/mvc/tableview","helpers/grid/RowIterator":"splunkjs/mvc/tableview","helpers/Printer":"splunkjs/mvc/tableview","jquery.sparkline":"splunkjs/mvc/tableview","views/shared/results_table/renderers/NullCellRenderer":"splunkjs/mvc/tableview","views/shared/results_table/renderers/NumberCellRenderer":"splunkjs/mvc/tableview","views/shared/results_table/renderers/SparklineCellRenderer":"splunkjs/mvc/tableview","views/shared/results_table/renderers/StringCellRenderer":"splunkjs/mvc/tableview","views/shared/results_table/renderers/TimeCellRenderer":"splunkjs/mvc/tableview","views/shared/results_table/ResultsTableMaster":"splunkjs/mvc/tableview","splunkjs/mvc/paginatorview":"splunkjs/mvc/tableview","splunkjs/mvc/tableview":"splunkjs/mvc/tableview","util/jscharting_utils":"splunkjs/mvc/chartview","splunkjs/mvc/chartview":"splunkjs/mvc/chartview","js_charting/util/math_utils":"splunkjs/mvc/chartview","js_charting/helpers/DataSet":"splunkjs/mvc/chartview","js_charting/util/dom_utils":"splunkjs/mvc/chartview","js_charting/helpers/EventMixin":"splunkjs/mvc/chartview","js_charting/util/color_utils":"splunkjs/mvc/chartview","js_charting/util/parsing_utils":"splunkjs/mvc/chartview","js_charting/visualizations/Visualization":"splunkjs/mvc/chartview","js_charting/components/ColorPalette":"splunkjs/mvc/chartview","js_charting/components/axes/Axis":"splunkjs/mvc/chartview","js_charting/helpers/Formatter":"splunkjs/mvc/chartview","js_charting/util/lang_utils":"splunkjs/mvc/chartview","js_charting/components/axes/CategoryAxis":"splunkjs/mvc/chartview","js_charting/util/time_utils":"splunkjs/mvc/chartview","js_charting/components/axes/TimeAxis":"splunkjs/mvc/chartview","js_charting/components/axes/NumericAxis":"splunkjs/mvc/chartview","js_charting/helpers/HoverEventThrottler":"splunkjs/mvc/chartview","js_charting/components/Legend":"splunkjs/mvc/chartview","js_charting/components/PanningScrollbar":"splunkjs/mvc/chartview","js_charting/components/Tooltip":"splunkjs/mvc/chartview","js_charting/series/Series":"splunkjs/mvc/chartview","js_charting/series/ManyShapeSeries":"splunkjs/mvc/chartview","js_charting/series/ColumnSeries":"splunkjs/mvc/chartview","js_charting/series/BarSeries":"splunkjs/mvc/chartview","js_charting/series/SingleShapeSeries":"splunkjs/mvc/chartview","js_charting/series/LineSeries":"splunkjs/mvc/chartview","js_charting/series/AreaSeries":"splunkjs/mvc/chartview","js_charting/series/PieSeries":"splunkjs/mvc/chartview","js_charting/series/MultiSeries":"splunkjs/mvc/chartview","js_charting/series/ScatterSeries":"splunkjs/mvc/chartview","js_charting/series/MultiScatterSeries":"splunkjs/mvc/chartview","js_charting/series/RangeSeries":"splunkjs/mvc/chartview","js_charting/series/series_factory":"splunkjs/mvc/chartview","js_charting/util/testing_utils":"splunkjs/mvc/chartview","js_charting/visualizations/charts/Chart":"splunkjs/mvc/chartview","js_charting/visualizations/charts/SplitSeriesChart":"splunkjs/mvc/chartview","js_charting/components/DataLabels":"splunkjs/mvc/chartview","js_charting/visualizations/charts/PieChart":"splunkjs/mvc/chartview","js_charting/visualizations/charts/ScatterChart":"splunkjs/mvc/chartview","js_charting/visualizations/gauges/Gauge":"splunkjs/mvc/chartview","js_charting/visualizations/gauges/RadialGauge":"splunkjs/mvc/chartview","js_charting/visualizations/gauges/FillerGauge":"splunkjs/mvc/chartview","js_charting/visualizations/gauges/HorizontalFillerGauge":"splunkjs/mvc/chartview","js_charting/visualizations/gauges/VerticalFillerGauge":"splunkjs/mvc/chartview","js_charting/visualizations/gauges/MarkerGauge":"splunkjs/mvc/chartview","js_charting/visualizations/gauges/HorizontalMarkerGauge":"splunkjs/mvc/chartview","js_charting/visualizations/gauges/VerticalMarkerGauge":"splunkjs/mvc/chartview","js_charting/js_charting":"splunkjs/mvc/chartview","contrib/text!views/shared/splunkbar/AppMenu.html":"splunkjs/mvc/headerview","views/shared/splunkbar/AppMenu":"splunkjs/mvc/headerview","contrib/text!views/shared/splunkbar/SystemMenuSection.html":"splunkjs/mvc/headerview","views/shared/splunkbar/SystemMenuSection":"splunkjs/mvc/headerview","contrib/text!views/shared/splunkbar/SystemMenu.html":"splunkjs/mvc/headerview","views/shared/splunkbar/SystemMenu":"splunkjs/mvc/headerview","contrib/text!views/shared/splunkbar/UserMenu.html":"splunkjs/mvc/headerview","views/shared/splunkbar/UserMenu":"splunkjs/mvc/headerview","views/shared/splunkbar/messages/Message":"splunkjs/mvc/headerview","views/shared/splunkbar/messages/LegacyMessage":"splunkjs/mvc/headerview","contrib/text!views/shared/splunkbar/messages/Master.html":"splunkjs/mvc/headerview","views/shared/splunkbar/messages/Master":"splunkjs/mvc/headerview","contrib/text!views/shared/splunkbar/ActivityMenu.html":"splunkjs/mvc/headerview","views/shared/splunkbar/ActivityMenu":"splunkjs/mvc/headerview","contrib/text!views/shared/splunkbar/HelpMenu.html":"splunkjs/mvc/headerview","views/shared/splunkbar/HelpMenu":"splunkjs/mvc/headerview","spin":"splunkjs/mvc/headerview","views/shared/WaitSpinner":"splunkjs/mvc/headerview","contrib/text!views/shared/splunkbar/messages/NoConnectionOverlay.html":"splunkjs/mvc/headerview","views/shared/splunkbar/messages/NoConnectionOverlay":"splunkjs/mvc/headerview","models/services/configs/Web":"splunkjs/mvc/headerview","helpers/polling_manager":"splunkjs/mvc/headerview","contrib/text!views/shared/splunkbar/Master.html":"splunkjs/mvc/headerview","views/shared/splunkbar/Master":"splunkjs/mvc/headerview","contrib/text!views/shared/appbar/NavItem.html":"splunkjs/mvc/headerview","contrib/text!views/shared/AppNav-SlideNavTemplate.html":"splunkjs/mvc/headerview","splunk.widget.slidenav":"splunkjs/mvc/headerview","views/shared/appbar/NavItem":"splunkjs/mvc/headerview","views/shared/appbar/AppNav":"splunkjs/mvc/headerview","contrib/text!views/shared/appbar/AppLabel.html":"splunkjs/mvc/headerview","views/shared/appbar/AppLabel":"splunkjs/mvc/headerview","contrib/text!views/shared/appbar/Master.html":"splunkjs/mvc/headerview","helpers/AppNav":"splunkjs/mvc/headerview","util/color_utils":"splunkjs/mvc/headerview","views/shared/appbar/Master":"splunkjs/mvc/headerview","splunkjs/mvc/headerview":"splunkjs/mvc/headerview","contrib/text!views/shared/footer/AboutDialog.html":"splunkjs/mvc/footerview","views/shared/footer/AboutDialog":"splunkjs/mvc/footerview","contrib/text!views/shared/footer/Master.html":"splunkjs/mvc/footerview","views/shared/footer/Master":"splunkjs/mvc/footerview","splunkjs/mvc/footerview":"splunkjs/mvc/footerview","splunk/charting/Legend":"splunkjs/mvc/splunkmapview","splunk/charting/ExternalLegend":"splunkjs/mvc/splunkmapview","contrib/text!contrib/leaflet/leaflet.css":"splunkjs/mvc/splunkmapview","contrib/text!contrib/leaflet/leaflet.ie.css":"splunkjs/mvc/splunkmapview","leaflet":"splunkjs/mvc/splunkmapview","splunk/events/GenericEventData":"splunkjs/mvc/splunkmapview","splunk/mapping/LatLon":"splunkjs/mvc/splunkmapview","splunk/mapping/LatLonBounds":"splunkjs/mvc/splunkmapview","splunk/viz/MRenderTarget":"splunkjs/mvc/splunkmapview","splunk/mapping/layers/LayerBase":"splunkjs/mvc/splunkmapview","splunk/viz/VizBase":"splunkjs/mvc/splunkmapview","splunk/mapping/Map":"splunkjs/mvc/splunkmapview","splunk/vectors/VectorElement":"splunkjs/mvc/splunkmapview","splunk/vectors/Group":"splunkjs/mvc/splunkmapview","splunk/vectors/VectorUtils":"splunkjs/mvc/splunkmapview","splunk/vectors/Viewport":"splunkjs/mvc/splunkmapview","splunk/mapping/layers/VectorLayerBase":"splunkjs/mvc/splunkmapview","splunk/palettes/ColorPalette":"splunkjs/mvc/splunkmapview","splunk/palettes/ListColorPalette":"splunkjs/mvc/splunkmapview","splunk/vectors/Shape":"splunkjs/mvc/splunkmapview","splunk/vectors/Wedge":"splunkjs/mvc/splunkmapview","splunk/viz/MDataTarget":"splunkjs/mvc/splunkmapview","splunk/mapping/layers/PieMarkerLayer":"splunkjs/mvc/splunkmapview","splunk/parsers/Parser":"splunkjs/mvc/splunkmapview","splunk/parsers/ParseUtils":"splunkjs/mvc/splunkmapview","splunk/parsers/NumberParser":"splunkjs/mvc/splunkmapview","splunk/mapping/parsers/LatLonBoundsParser":"splunkjs/mvc/splunkmapview","splunk/mapping/parsers/LatLonParser":"splunkjs/mvc/splunkmapview","splunk/palettes/FieldColorPalette":"splunkjs/mvc/splunkmapview","splunk/parsers/StringParser":"splunkjs/mvc/splunkmapview","splunk/parsers/ArrayParser":"splunkjs/mvc/splunkmapview","splunk/parsers/BooleanParser":"splunkjs/mvc/splunkmapview","splunk/parsers/ObjectParser":"splunkjs/mvc/splunkmapview","views/shared/Map":"splunkjs/mvc/splunkmapview","splunkjs/mvc/splunkmapview":"splunkjs/mvc/splunkmapview","util/beacon":"splunkjs/mvc/searchbarview","views/shared/searchbar/Apps":"splunkjs/mvc/searchbarview","util/dom_utils":"splunkjs/mvc/searchbarview","views/shared/searchbar/Input":"splunkjs/mvc/searchbarview","views/shared/searchbar/Submit":"splunkjs/mvc/searchbarview","views/shared/searchbar/Master":"splunkjs/mvc/searchbarview","splunkjs/mvc/searchbarview":"splunkjs/mvc/searchbarview","views/shared/SingleValue":"splunkjs/mvc/singleview","splunkjs/mvc/singleview":"splunkjs/mvc/singleview","swfobject":"splunkjs/mvc/timelineview","splunk.messenger":"splunkjs/mvc/timelineview","splunk.time.TimeZone":"splunkjs/mvc/timelineview","splunk.time.SimpleTimeZone":"splunkjs/mvc/timelineview","splunk.time.LocalTimeZone":"splunkjs/mvc/timelineview","splunk.time.TimeZones":"splunkjs/mvc/timelineview","splunk.time.DateTime":"splunkjs/mvc/timelineview","splunk.time.Duration":"splunkjs/mvc/timelineview","splunk.time.SplunkTimeZone":"splunkjs/mvc/timelineview","splunk.time.TimeUtils":"splunkjs/mvc/timelineview","splunk.time":"splunkjs/mvc/timelineview","splunk.timerange":"splunkjs/mvc/timelineview","splunk.window":"splunkjs/mvc/timelineview","splunk.jabridge":"splunkjs/mvc/timelineview","splunk/charting/LogScale":"splunkjs/mvc/timelineview","splunk/time/TimeZone":"splunkjs/mvc/timelineview","splunk/time/SimpleTimeZone":"splunkjs/mvc/timelineview","splunk/time/LocalTimeZone":"splunkjs/mvc/timelineview","splunk/time/TimeZones":"splunkjs/mvc/timelineview","splunk/time/DateTime":"splunkjs/mvc/timelineview","splunk/viz/GraphicsVizBase":"splunkjs/mvc/timelineview","splunk/charting/Histogram":"splunkjs/mvc/timelineview","splunk/charting/ClickDragRangeMarker":"splunkjs/mvc/timelineview","splunk/charting/CursorMarker":"splunkjs/mvc/timelineview","splunk/charting/NumericAxisLabels":"splunkjs/mvc/timelineview","splunk/charting/GridLines":"splunkjs/mvc/timelineview","splunk/time/Duration":"splunkjs/mvc/timelineview","splunk/time/TimeUtils":"splunkjs/mvc/timelineview","splunk/charting/TimeAxisLabels":"splunkjs/mvc/timelineview","splunk/charting/Tooltip":"splunkjs/mvc/timelineview","splunk/time/SplunkTimeZone":"splunkjs/mvc/timelineview","splunk/charting/Timeline":"splunkjs/mvc/timelineview","views/shared/CanvasTimeline":"splunkjs/mvc/timelineview","splunkjs/mvc/timelineview":"splunkjs/mvc/timelineview","collections/services/data/ui/Navs":"splunkjs/mvc/aceheader/aceheader","splunkjs/mvc/aceheader/acemenubuilder":"splunkjs/mvc/aceheader/aceheader","splunkjs/mvc/aceheader/aceheader":"splunkjs/mvc/aceheader/aceheader","splunkjs/mvc/d3chart/d3/d3.v2":"splunkjs/mvc/d3chart/d3chartview","splunkjs/mvc/d3chart/d3/fisheye":"splunkjs/mvc/d3chart/d3chartview","splunkjs/mvc/d3chart/d3/nv.d3":"splunkjs/mvc/d3chart/d3chartview","splunkjs/mvc/d3chart/d3chartview":"splunkjs/mvc/d3chart/d3chartview","splunkjs/compiled/forms":"splunkjs/compiled/forms","splunkjs/mvc/baseinputview":"splunkjs/compiled/forms","splunkjs/mvc/checkboxview":"splunkjs/compiled/forms","splunkjs/mvc/basechoiceview":"splunkjs/compiled/forms","splunkjs/mvc/basemultichoiceview":"splunkjs/compiled/forms","splunkjs/mvc/checkboxgroupview":"splunkjs/compiled/forms","splunkjs/mvc/radiogroupview":"splunkjs/compiled/forms","splunkjs/mvc/baseselectviewmixin":"splunkjs/compiled/forms","splunkjs/mvc/multiselectview":"splunkjs/compiled/forms","splunkjs/mvc/selectview":"splunkjs/compiled/forms","splunkjs/mvc/textboxview":"splunkjs/compiled/forms","splunkjs/mvc/progressbarview":"splunkjs/mvc/progressbarview","views/shared/jobstatus/Spinner":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/Count":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/Progress":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/Cancel":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/Stop":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/PlayPause":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/Reload":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/Messages":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/EditModal":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/Edit":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/sendbackgroundmodal/Settings":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/sendbackgroundmodal/Success":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/sendbackgroundmodal/Master":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/SendBackground":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/Inspect":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/DeleteModal":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/Delete":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/menu/Master":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/controls/Master":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/buttons/ShareDialog":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/buttons/ShareButton":"splunkjs/mvc/searchcontrolsview","models/AlertAction":"splunkjs/mvc/searchcontrolsview","models/services/search/jobs/Control":"splunkjs/mvc/searchcontrolsview","models/services/search/jobs/Summary":"splunkjs/mvc/searchcontrolsview","models/services/search/Job":"splunkjs/mvc/searchcontrolsview","util/Ticker":"splunkjs/mvc/searchcontrolsview","models/Job":"splunkjs/mvc/searchcontrolsview","util/pdf_utils":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/buttons/ExportResultsDialog":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/buttons/ExportButton":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/buttons/PrintButton":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/buttons/Master":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/SearchMode":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/AutoPause":"splunkjs/mvc/searchcontrolsview","views/shared/jobstatus/Master":"splunkjs/mvc/searchcontrolsview","splunkjs/mvc/searchcontrolsview":"splunkjs/mvc/searchcontrolsview","splunkjs/mvc/dataview":"splunkjs/mvc/dataview","async":"splunkjs/mvc/googlemapview","splunkjs/mvc/googlemapview":"splunkjs/mvc/googlemapview","models/SelectedField":"splunkjs/mvc/eventsviewerview","collections/SelectedFields":"splunkjs/mvc/eventsviewerview","models/services/configs/EventRenderer":"splunkjs/mvc/eventsviewerview","collections/services/configs/EventRenderers":"splunkjs/mvc/eventsviewerview","models/services/data/ui/WorkflowAction":"splunkjs/mvc/eventsviewerview","collections/services/data/ui/WorkflowActions":"splunkjs/mvc/eventsviewerview","collections/services/search/Jobs":"splunkjs/mvc/eventsviewerview","collections/Jobs":"splunkjs/mvc/eventsviewerview","models/Report":"splunkjs/mvc/eventsviewerview","models/fetch_data/ResultsFetchData":"splunkjs/mvc/eventsviewerview","models/services/search/jobs/Result":"splunkjs/mvc/eventsviewerview","views/shared/delegates/Modalize":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/shared/TableHead":"splunkjs/mvc/eventsviewerview","views/shared/PopTart":"splunkjs/mvc/eventsviewerview","models/services/search/IntentionsParser":"splunkjs/mvc/eventsviewerview","contrib/text!views/shared/FieldInfo.html":"splunkjs/mvc/eventsviewerview","views/shared/FieldInfo":"splunkjs/mvc/eventsviewerview","models/services/saved/FVTags":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/shared/fieldactions/TagDialog":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/shared/fieldactions/Master":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/shared/WorkflowActions":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/shared/TimeInfo":"splunkjs/mvc/eventsviewerview","models/UIWorkflowAction":"splunkjs/mvc/eventsviewerview","collections/UIWorkflowActions":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/shared/BaseFields":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/shared/EventFields":"splunkjs/mvc/eventsviewerview","keyboard/SearchModifier":"splunkjs/mvc/eventsviewerview","views/shared/JSONTree":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/shared/RawField":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/raw/body/Row":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/raw/body/Master":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/raw/Master":"splunkjs/mvc/eventsviewerview","views/shared/TableHead":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/list/body/row/SelectedFields":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/list/body/row/Master":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/list/body/Master":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/list/Master":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/table/TableHead":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/table/body/PrimaryRow":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/table/body/SecondaryRow":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/table/body/Master":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/table/Master":"splunkjs/mvc/eventsviewerview","views/shared/eventsviewer/Master":"splunkjs/mvc/eventsviewerview","splunkjs/mvc/eventsviewerview":"splunkjs/mvc/eventsviewerview","util/xml_utils":"splunkjs/mvc/simplexml","models/Dashboard":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/controller":"splunkjs/mvc/simplexml","models/services/authorization/Role":"splunkjs/mvc/simplexml","collections/services/authorization/Roles":"splunkjs/mvc/simplexml","views/shared/documentcontrols/dialogs/permissions_dialog/ACL":"splunkjs/mvc/simplexml","views/shared/documentcontrols/dialogs/permissions_dialog/Master":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dialog/dashboardtitle":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/mapper":"splunkjs/mvc/simplexml","models/DashboardReport":"splunkjs/mvc/simplexml","util/moment/compactFromNow":"splunkjs/mvc/simplexml","splunkjs/mvc/refreshtimeindicatorview":"splunkjs/mvc/simplexml","splunkjs/mvc/resultslinkview":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/DrilldownRadio":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/DrilldownRadioGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/StackModeControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/NullValueModeControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/GaugeStyleControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/SingleValueBeforeLabelControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/SingleValueAfterLabelControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/SingleValueUnderLabelControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/Statistics":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/Events":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/General":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/AxisTitleControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/AxisScaleControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/AxisIntervalControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/AxisMinValueControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/AxisMaxValueControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/LegendPlacementControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/LegendTruncationControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/custom_controls/GaugeAutoRangesControlGroup":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/XAxis":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/YAxis":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/Legend":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/color/ColorPicker":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/color/Ranges":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/color/Master":"splunkjs/mvc/simplexml","views/shared/vizcontrols/components/Master":"splunkjs/mvc/simplexml","views/shared/vizcontrols/Format":"splunkjs/mvc/simplexml","models/Visualization":"splunkjs/mvc/simplexml","views/shared/vizcontrols/Master":"splunkjs/mvc/simplexml","views/ValidatingView":"splunkjs/mvc/simplexml","views/shared/dialogs/DialogBase":"splunkjs/mvc/simplexml","views/shared/dialogs/TextDialog":"splunkjs/mvc/simplexml","views/shared/reportcontrols/details/History":"splunkjs/mvc/simplexml","views/shared/reportcontrols/details/Creator":"splunkjs/mvc/simplexml","views/shared/documentcontrols/details/App":"splunkjs/mvc/simplexml","models/Cron":"splunkjs/mvc/simplexml","views/shared/reportcontrols/details/Schedule":"splunkjs/mvc/simplexml","views/shared/ScheduleSentence":"splunkjs/mvc/simplexml","views/shared/reportcontrols/dialogs/schedule_dialog/step1/Schedule":"splunkjs/mvc/simplexml","views/shared/reportcontrols/dialogs/schedule_dialog/step1/Master":"splunkjs/mvc/simplexml","views/shared/reportcontrols/dialogs/schedule_dialog/Step2":"splunkjs/mvc/simplexml","views/shared/reportcontrols/dialogs/schedule_dialog/Master":"splunkjs/mvc/simplexml","views/shared/reportcontrols/details/EditSchedule":"splunkjs/mvc/simplexml","views/shared/reportcontrols/details/Acceleration":"splunkjs/mvc/simplexml","views/shared/reportcontrols/dialogs/AccelerationDialog":"splunkjs/mvc/simplexml","views/shared/reportcontrols/details/EditAcceleration":"splunkjs/mvc/simplexml","views/shared/documentcontrols/details/Permissions":"splunkjs/mvc/simplexml","views/shared/reportcontrols/details/EditPermissions":"splunkjs/mvc/simplexml","views/shared/reportcontrols/details/Master":"splunkjs/mvc/simplexml","views/dashboards/panelcontrols/titledialog/Modal":"splunkjs/mvc/simplexml","views/dashboards/panelcontrols/querydialog/Modal":"splunkjs/mvc/simplexml","collections/Reports":"splunkjs/mvc/simplexml","views/dashboards/panelcontrols/ReportDialog":"splunkjs/mvc/simplexml","views/dashboards/panelcontrols/CreateReportDialog":"splunkjs/mvc/simplexml","views/dashboards/panelcontrols/Master":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/paneleditor":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/element/base":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dialog/addpanel/inline":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dialog/addpanel/report":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dialog/addpanel/pivot":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dialog/addpanel/master":"splunkjs/mvc/simplexml","splunkjs/mvc/searchtemplate":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dialog/addpanel":"splunkjs/mvc/simplexml","models/services/ScheduledView":"splunkjs/mvc/simplexml","views/dashboards/table/controls/SchedulePDF":"splunkjs/mvc/simplexml","views/dashboards/table/controls/CloneSuccess":"splunkjs/mvc/simplexml","views/shared/delegates/PairedTextControls":"splunkjs/mvc/simplexml","views/dashboards/table/controls/CloneDashboard":"splunkjs/mvc/simplexml","views/dashboards/table/controls/ConvertSuccess":"splunkjs/mvc/simplexml","views/dashboards/table/controls/ConvertDashboard":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/formtokens":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/input/base":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/input/timerange":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/formmanager":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/editdashboard":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dragndrop":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/fieldsetview":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dashboard/title":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dashboard/description":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dashboard/row":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dashboard/panel":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/dashboard":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/element/table":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/element/chart":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/element/event":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/element/single":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/element/map":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/element/list":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/element/html":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml/urltokenmodel":"splunkjs/mvc/simplexml","splunkjs/mvc/postprocess":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/input/submit":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/input/text":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/input/dropdown":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/input/radio":"splunkjs/mvc/simplexml","splunkjs/mvc/simpleform/input":"splunkjs/mvc/simplexml","splunkjs/mvc/simplexml":"splunkjs/mvc/simplexml"}});

