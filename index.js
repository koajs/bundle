/**
 * Module dependencies
 */

var browser_resolve = require('browser-resolve').sync;
var convert = require('convert-source-map');
var debug = require('debug')('koa-bundle');
var compressible = require('compressible');
var normalize = require('path').normalize;
var basename = require('path').basename;
var relative = require('path').relative;
var escapeHTML = require('escape-html');
var read = require('fs').readFileSync;
var exists = require('fs').existsSync;
var extname = require('path').extname;
var resolve = require('path').resolve;
var assign = require('object-assign');
var filedeps = require('file-deps');
var uglify = require('uglify-js');
var toHTML = require('ansi-html');
var mime = require('mime-types');
var join = require('path').join;
var wrapfn = require('wrap-fn');
var isBuffer = Buffer.isBuffer;
var crypto = require('crypto');
var sep = require('path').sep;
var zlib = require('zlib');
var csso = require('csso');
var cwd = process.cwd();
var fs = require('fs');

/**
 * Export `bundle`
 */

module.exports = bundle;

/**
 * Is production?
 */

var production = 'production' == process.env.NODE_ENV;

/**
 * Default settings
 */

var defaults = production
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

function bundle(settings, fn) {
  if (arguments.length == 1) fn = settings, settings = {};
  settings = assign(defaults, settings);
  var root = settings.root || cwd;
  var entries = {};

  return function _bundle(settings2, path) {
    if (arguments.length == 2) {
      settings = assign(settings, settings2);
      root = settings.root;
      var obj = entry(root, path);
      entries[obj.route] = obj;
    } else if (arguments.length == 1) {
      if ('string' == typeof settings2) {
        root = settings.root;
        var obj = entry(root, settings2);
        entries[obj.route] = obj;
      } else {
        settings = assign(settings, settings2);
      }
    }

    return middleware.call(this, entries, settings, fn);
  }
}

/**
 * Add an entry
 *
 * @param {String} root
 * @param {String} path
 * @param {Object} options
 * @param {Object}
 */

function entry(root, mod, options) {
  var node_module = nm(root, mod);
  var route;
  var path;

  if (node_module) {
    route = relative(root, resolve(root, normalize(mod)));
    path = node_module;
  } else {
    path = fullpath(root, mod, options);
    if (path instanceof Error) return path;
    route = '/' + relative(root, path);
  }

  debug('GET /%s => %s', route, path);

  var type = extname(path).slice(1);

  return {
    route: join(root, route),
    mtime: null,
    type: type,
    path: path,
    md5: null,
    mod: mod,
    size: 0
  };
}

/**
 * Create the middleware
 *
 * @param {Array} entries
 * @param {Object} settings
 * @param {Function|Generator} fn
 */

function middleware(entries, settings, fn) {
  var root = settings.root = settings.root || cwd;
  var ctx = this;
  var maps = {};

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
        this.type = file.type;
        return this.body = file.zip;
      } else if (file.src) {
        debug('serving cached asset');
        this.type = file.type;
        return this.body = file.src
      }
    }

    debug('building the asset');
    try {
      var src = yield function(done) {
        wrapfn(fn, done).call(ctx, assign(file, settings));
      }
    } catch(e) {
      var msg = e.stack ? e.stack : e.toString();
      console.error(msg);
      this.status = 500;

      if (!production) {
        this.body = 'css' == file.type ? write_css_error(msg) : write_js_error(msg);
        this.type = file.type;
        this.status = 200;
      }

      return;
    }
    debug('built the asset');

    if (src && file != src) file.src = src;
    this.type = file.type;

    // other types of assets
    // TODO: do more intelligent things with results (like etag images, fonts, etc)
    if (this.type !== 'application/javascript' && this.type !== 'text/css') {

      // caching the asset
      if (settings.cache) {
        file.md5 = md5(file.src);
        debug('caching the asset md5(%s)', file.md5);
        this.response.etag = file.md5;
      }

      return this.body = file.src;
    }

    // ensure UTF8 for JS and CSS
    file.src = file.src.toString()

    // adding in the other dependencies
    if (file.type == 'css') {
      var deps = filedeps(file.src, file.type);
      deps.forEach(function(dep) {
        if (http(dep)) return;
        dep = stripPath(dep);
        var obj = entry(root, dep, { catch: true });
        if (obj instanceof Error) {
          return debug('warning: %s', obj.message);
        }
        debug('added: dependency %s => %s', obj.route, obj.path)
        entries[obj.route] = obj;
      })
    }

    // generate sourcemaps in debug mode
    var srcmap = null;
    var mapping = null;

    if (settings.debug) {
      debug('building the source map');

      try {
        srcmap = convert.fromComment(file.src);
        srcmap = srcmap.sourcemap ? srcmap : false;
        file.src = convert.removeComments(file.src);
        srcmap.setProperty('file', file.path);
        mapping = path.replace(extname(path), '.map.json');
        debug('built the source map');
      } catch (e) {
        debug('unable to build the sourcemap: %s', e.toString());
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
    file.size = file.src ? file.src.length : 0;

    // gzip the asset or serve it directly
    if (settings.gzip && shouldGzip(file, encodings)) {
      debug('serving the gzipped asset');
      this.remove('Content-Length');
      this.set('Content-Encoding', 'gzip');
      this.type = file.type;
      file.zip = yield gzip(file.src);
      this.body = file.zip;
    } else {
      debug('serving the asset');
      this.type = file.type;
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

function nm(root, entry) {
  try {
    return browser_resolve(entry, { basedir: root });
  } catch (e) {
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
 * @param {Object} options
 * @return {String}
 */

function fullpath(root, entry, options) {
  options = options || {};
  options.catch = options.catch || false;

  var isRelative = './' == entry.slice(0, 2);
  var isParent = '..' == entry.slice(0, 2);
  var isAbsolute = '/' == entry[0];
  var ret;

  if (isAbsolute) {
    ret = join(root, entry);
  } else if (isRelative || isParent) {
    ret = resolve(root, entry);
  } else {
    ret = nm(root, entry) || join(root, entry);
  }

  if (!exists(ret)) {
    var err = new Error(entry + ' does not exist! resolved to: ' + ret);
    if (options.catch) return err;
    else throw err;
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

/**
 * Document.write
 *
 * @param {String} msg
 * @return {String}
 */

function write_js_error(msg) {
  return [
    'document.addEventListener("DOMContentLoaded", function() {',
    'document.write("',
    [
      '<pre style="padding: 50px;">',
      toHTML(escapeHTML(msg)).replace(/(\r\n|\n|\r)/gm, '<br/>').replace(/color\:\#fff\;/g, '').replace(new RegExp(cwd, 'g'), '.'),
      '</pre>'
    ].join('').replace(/['"]/gm, '\\$&'),
    '");',
    '});'
  ].join('');
}

/**
 * Document.write
 *
 * @param {String} msg
 * @return {String}
 */

function write_css_error(msg) {
  msg = 'CSS Error: \n\n' + msg;
  return [
    'html:after {',
    '  content: "' + msg.replace(/(\r\n|\n|\r)/gm, ' \\A ').replace(new RegExp(cwd, 'g'), '.') + '";',
    '  padding: 50px;',
    '  white-space: pre-wrap;',
    '  position: fixed;',
    '  color: white;',
    '  font-size: 14pt;',
    '  font-family: monospace;',
    '  top: 0;',
    '  left: 0;',
    '  right: 0;',
    '  bottom: 0;',
    '  background: #FF4743;',
    '  border: 2px solid red;',
    '  text-shadow: 1px 1px 0 red;',
    '}'
  ].join('\n');
}

/**
 * Check if `url` is an HTTP URL.
 *
 * @param {String} path
 * @param {Boolean}
 * @api private
 */

function http(url) {
  return url.slice(0, 4) === 'http'
    || url.slice(0, 3) === '://'
    || false;
}

/**
 * Strip a querystring or hash fragment from a `path`.
 *
 * @param {String} path
 * @return {String}
 * @api private
 */

function stripPath(path) {
  return path
    .split('?')[0]
    .split('#')[0];
}
