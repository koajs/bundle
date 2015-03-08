/**
 * Module Dependencies
 */

var app = module.exports = require('koa')();
var Browserify = require('browserify');
var dirname = require('path').dirname;
var assign = require('object-assign');
var Bundle = require('../../../');
var mount = require('koa-mount');
var join = require('path').join;
var fs = require('fs');
var kr = require('kr');

/**
 * Bundle
 */

var bundle = Bundle(function(file, fn) {
  var b = Browserify({ debug: file.debug })
    .on('error', fn)
    .add(file.path)
    .transform(require('babelify'))
    .bundle(fn);
});

app.use(bundle('dash.js', {
  root: __dirname
}));

/**
 * Mount
 */

app.use(kr.get('/', function *() {
  this.type = 'text/html';
  this.body = fs.createReadStream(__dirname + '/dash.html');
}));
