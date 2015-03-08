/**
 * Module dependencies
 */

var convert = require('convert-source-map');
var debug = require('debug')('koa-bundle');
var compressible = require('compressible');
var normalize = require('path').normalize;
var basename = require('path').basename;
var exists = require('fs').existsSync;
var extname = require('path').extname;
var resolve = require('path').resolve;
var assign = require('object-assign');
var uglify = require('uglify-js');
var mime = require('mime-types');
var Glob = require('glob').sync;
var join = require('path').join;
var wrapfn = require('wrap-fn');
var crypto = require('crypto');
var zlib = require('zlib');
var csso = require('csso');
var cwd = process.cwd();
var fs = require('fs');

/**
 * Export `bundle`
 */

module.exports = bundle;

/**
 * Default settings
 */

var defaults = 'production' == process.env.NODE_ENV
  ? {
      debug: false,
      minify: true,
      cache: true,
      gzip: true
    }
  : {
      debug: true,
      minify: false,
      cache: false,
      gzip: false
    }
;

/**
 * Initialize `bundle`
 *
 * @param {String} path
 * @param {Object} options
 * @param {Function|Generator} fn
 */

function bundle(path, settings, fn) {
  if ('function' == typeof path) fn = path, settings = {}, path = null;
  else if ('object' == typeof path) fn = settings, settings = path, path = null;
  else if ('function' == typeof settings) fn = settings, settings = {};
  settings = assign(defaults, settings);

  return path
    ? middleware(path, settings, fn)
    : function(path, o) { return middleware(path, assign(settings, o || {}), fn); }
}

/**
 * Create the middleware
 *
 * @param {String} filepath
 * @param {Object} settings
 * @param {Function|Generator} fn
 */

function middleware(path, settings, fn) {
  var root = settings.root = settings.root || cwd;
  var files = Glob(path, { cwd: root });
  var entries = {};
  var maps = {};

  // if no files, let `fullpath(root, entry)` try resolving
  !files.length && files.push(path);

  // create files for each entry
  files.forEach(function(entry) {
    var path = fullpath(root, entry);
    var type = extname(path).slice(1);

    // set up the routing
    var route = nm(entry)
      ? join(root, entry) + '.' + type
      : path

    entries[route] = {
      type: type,
      plugin: fn || passthrough,
      path: path,
      mtime: null,
      md5: null,
      size: 0
    };
  });

  return function *bundle(next) {
    // only accept HEAD and GET
    if (this.method !== 'HEAD' && this.method !== 'GET') return yield* next;

    // decode for `/%E4%B8%AD%E6%96%87`
    // normalize for `//index`
    var path = join(root, decode(normalize(this.path)));

    if (settings.debug && maps[path]) {
      debug('fetching sourcemap: %s', path);
      this.body = maps[path];
      return yield* next;
    } else if (!entries[path]) {
      return yield* next;
    }

    var file = entries[path];
    var encodings = this.acceptsEncodings();

    if (settings.cache && file.md5) {
      debug('asset cached')
      // HACK: set status to 2xx make sure that fresh gets called
      this.status = 200;
      this.response.etag = file.md5;

      // don't send anything for repeat clients
      if (this.fresh) {
        debug('asset still fresh, returning 304');
        return this.status = 304;
      }

      if (settings.gzip && file.zip && shouldGzip(file, encodings)) {
        debug('serving cached gzipped asset');
        this.remove('Content-Length');
        this.set('Content-Encoding', 'gzip');
        return this.body = file.zip;
      } else if (file.src) {
        debug('serving cached asset');
        return this.body = file.src
      }
    }

    debug('building the asset');
    var src = yield function(done) {
      wrapfn(file.plugin, done)(assign(file, settings));
    }
    debug('built the asset');

    if (src) file.src = src.toString();
    this.type = file.type;

    // generate sourcemaps in debug mode
    var srcmap = null;
    var mapping = null;

    if (settings.debug) {
      debug('building the source map');
      srcmap = convert.fromComment(file.src);
      srcmap = srcmap.sourcemap ? srcmap : false;

      if (srcmap) {
        file.src = convert.removeComments(file.src);
        srcmap.setProperty('file', file.path);
        mapping = path.replace(extname(path), '.map.json');
      } else {
        debug('unable to build the sourcemap');
      }
    }

    // minify the code
    if (settings.minify) {
      debug('minifying the asset');
      switch (file.type) {
        case 'js':
          file.src = compress(file, srcmap);
          break;
        case 'css':
          file.src = csso.justDoIt(file.src);
          break;
      }
    }

    // add in the sourcemap
    if (settings.debug && srcmap) {
      debug('adding in the source mapping url %s', basename(mapping));
      file.src += '\n//# sourceMappingURL=' + basename(mapping);
      maps[mapping] = srcmap.toObject();
    }

    // caching the asset
    if (settings.cache) {
      file.md5 = md5(file.src);
      debug('caching the asset md5(%s)', file.md5);
      this.response.etag = file.md5;
    }

    // finally calculate the file size
    file.size = file.src.length;

    // gzip the asset or serve it directly
    if (settings.gzip && shouldGzip(file, encodings)) {
      debug('serving the gzipped asset');
      this.remove('Content-Length');
      this.set('Content-Encoding', 'gzip');
      file.zip = yield gzip(file.src);
      this.body = file.zip;
    } else {
      debug('serving the asset');
      this.body = file.src;
    }
  }
}

/**
 * Gzip the file
 *
 * @param {String} src
 * @return {Buffer}
 */

function gzip(src) {
  var buf = new Buffer(src);
  return function (done) {
    zlib.gzip(buf, done)
  }
}

/**
 * Should we gzip?
 *
 * @param {Object} file
 * @param {Array} encodings
 * @return {Boolean}
 */

function shouldGzip(file, encodings) {
  return file.size > 1024
    && ~encodings.indexOf('gzip')
    && compressible(mime.lookup(file.type));
}

/**
 * Compress the file and
 * recalculate sourcemaps
 *
 * @param {Object} file
 * @param {Object} srcmap
 * @return {String}
 */

function compress(file, srcmap) {
  var opts = {
    fromString: true
  };

  if (srcmap) {
    opts.inSourceMap = srcmap.toObject();
    opts.outSourceMap = basename(file.path);
  }

  var src = file.src;
  var result = uglify.minify(src, opts);

  if (srcmap) {
    // prepare new sourcemap
    // we need to get the sources from bundled sources
    // uglify does not carry those through
    var srcs = srcmap.getProperty('sourcesContent');
    srcmap = convert.fromJSON(result.map);
    srcmap.setProperty('sourcesContent', srcs);
  }

  return result.code;
}

/**
 * Safely resolve a node_module
 *
 * @param {String} mod
 * @return {Boolean|String} mod
 */

function nm(mod) {
  try {
    return require.resolve(mod);
  } catch(e) {
    return false;
  }
}

/**
 * Calculate the MD5
 *
 * @param {String} src
 * @param {String} md5
 */

function md5(src) {
  return crypto
    .createHash('md5')
    .update(src)
    .digest('base64');
}

/**
 * Resolve the fullpath
 *
 * @param {String} root
 * @param {String} entry
 * @return {String}
 */

function fullpath(root, entry) {
  var isRelative = './' == entry.slice(0, 2);
  var isParent = '..' == entry.slice(0, 2);
  var isAbsolute = '/' == entry[0];
  var ret;

  if (isAbsolute) {
    ret = join(root, entry);
  } else if (isRelative || isParent) {
    ret = resolve(root, entry);
  } else {
    ret = nm(entry) || join(root, entry);
  }

  if (!exists(ret)) {
    throw new Error(entry + 'does not exist! resolved to: ' + ret);
  }

  return ret;
}

/**
 * Safely decode
 *
 * @param {String} path
 * @return {String} path
 */

function decode(path) {
  try {
    return decodeURIComponent(path);
  } catch (e) {
    return path;
  }
}

/**
 * Passthrough
 *
 * @param {Object} file
 * @return {Object} file
 */

function passthrough(file) {
  return file;
}
