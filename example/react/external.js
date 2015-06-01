/**
 * Module Dependencies
 */

var Browserify = require('browserify');
var basename = require('path').basename;
var extname = require('path').extname;
var resolve = require('path').resolve;
var Bundle = require('../..');

/**
 * Export `bundle`
 */

module.exports = Bundle({ root: __dirname, requires: ['react'] }, function(file, fn) {
  var path = file.path;
  var mod = file.mod;

  var options = {
    debug: file.debug,
    exposeAll: true,
    noparse: true
  }

  Browserify(options)
    .on('error', fn)
    .require(file.path, { expose: mod, basedir: file.root })
    .bundle(fn);
});
