var httpProxy = require('http-proxy');
var util = require('util');
var fs = require('fs');
var Cookies = require('cookies');
var dispatch = require('../contrib/dispatch/dispatch');
var crypto = require('crypto');

// Initial, empty config object
var config = {}

var decrypt = function (input, password, callback) {
    // Convert urlsafe base64 to normal base64
    var input = input.replace(/\-/g, '+').replace(/_/g, '/');
    // Convert from base64 to binary string
    var edata = new Buffer(input, 'base64').toString('binary')

    // Create key from password
    var m = crypto.createHash('md5');
    m.update(password)
    var key = m.digest('hex');

    // Create iv from password and key
    m = crypto.createHash('md5');
    m.update(password + key)
    var iv = m.digest('hex');

    // Decipher encrypted data
    var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv.slice(0,16));
    var decrypted = decipher.update(edata, 'binary') + decipher.final('binary');
    var plaintext = new Buffer(decrypted, 'binary').toString('utf8');

    callback(plaintext);
};

// If there is a config.json file, let's read it
if (process.env['APPFX_CONFIG']) {
    var configFile = JSON.parse(fs.readFileSync(process.env['APPFX_CONFIG']).toString("utf-8"));
    for(var k in configFile) {
        config[k] = configFile[k];
    }
}

var router = {};
router[util.format('/%s', config.mount)]        = util.format('127.0.0.1:%s/%s', config.appfx_port, config.mount);
router['/[^/]+/account/login']                  = util.format('127.0.0.1:%s/%s/accounts/login', config.appfx_port, config.mount);
router['/[^/]+/account/logout']                 = util.format('127.0.0.1:%s/%s/accounts/logout', config.appfx_port, config.mount);
router[util.format('%s/', config.proxy_path)]   = util.format('%s:%s', config.splunkd_host, config.splunkd_port);
router['/']                                     = util.format('%s:%s', config.splunkweb_host, config.splunkweb_port);

var options = {
    router: router
};

var dispatcherRouter = {};
dispatcherRouter[util.format('%s/(.*)', config.proxy_path)] = function(req, res, next) {
    var cookies = new Cookies(req, res);
    var encryptedSessionToken = cookies.get("session_token") || "";
    
    // Compare CSRF
    if (!/^(GET|HEAD|OPTIONS|TRACE)$/.test(req.method)) {
        var cookieCsrfToken = cookies.get("csrftoken");    
        var headerCsrfToken = req.headers["x-csrftoken"];
        
        if (cookieCsrfToken !== headerCsrfToken) {
            next({status: 401, reason: "CSRF Token did not match"}, false);
            return;
        }
    }
    
    decrypt(encryptedSessionToken, config.secret_key, function(sessionToken) {
        // Default to an empty session token if we don't have one
        req.headers["Authorization"] = sessionToken || "Splunk ";
        req.headers["Host"] = util.format('%s:%s', config.splunkd_host, config.splunkd_port);
        next(null, true);
    });
};

dispatcherRouter["/(.*)"] = function(req, res, next) {
    next(null, false);
};

var dispatcher = dispatch(dispatcherRouter);
var proxyServer = httpProxy.createServer(options, function(req, res, proxy) {
    if (config.debug) console.log(req.method, req.url);
    dispatcher(req, res, function(err, https) {
        if (err) {
            if (err.status) {
                res.statusCode = err.status;
                res.write(err.reason);
            }
            else {
                res.statusCode = 500;
                res.write(err);
            }
            
            res.end();
        }
        
        proxy.proxyRequest(req, res, {
            https: https
        }); 
    });
});

proxyServer.listen(config['proxy_port']);
