/**
 * Module Dependencies
 */

var Browserify = require('browserify');
var resolve = require('path').resolve;
var join = require('path').join;
var npm = require('rework-npm');
var rework = require('rework');
var Bundle = require('../../');
var myth = require('myth');
var fs = require('fs');

/**
 * Transforms
 */

var babelify = require('babelify');
var envify = require('envify');

/**
 * $NODE_PATH
 */

var nodePath = join(__dirname, '..', '..');

/**
 * Export `bundle`
 */

module.exports = Bundle({ root: __dirname }, function(file, fn) {
  var options = {
    extensions: ['.jsx'],
    debug: file.debug,
    paths: nodePath
  }

  if ('jsx' == file.type) {
    file.type = 'js';
  }

  if ('js' == file.type) {
    Browserify(options)
      .on('error', fn)
      .external(['react'])
      .add(file.path)
      .transform(babelify)
      .transform(envify)
      .bundle(fn);
  } else if ('css' == file.type) {
    fs.readFile(file.path, 'utf8', function(err, str) {
      if (err) return fn(err);

      try {
        var css = rework(str, { source: file.path })
          .use(npm({ root: join(__dirname, '..', '..') }))
          .use(myth())
          .toString({ sourcemap: !!file.debug });
      } catch (e) {
        return fn(e);
      }

      fn(null, css);
    });
  } else {
    fs.readFile(file.path, fn);
  }

});
