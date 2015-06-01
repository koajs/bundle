
# koa-bundle

  Generic asset pipeline with caching, etags, minification, gzipping and sourcemaps.

  The child of [node-enchilada](https://github.com/defunctzombie/node-enchilada) and [static-cache](https://github.com/koajs/static-cache).

## Examples

- Browserify (with a callback and options)

```js
var bundle = Bundle({ debug: true }, function(file, fn) {
  Browserify({ debug: file.debug })
    .add(file.path)
    .transform(require('babelify'))
    .bundle(fn);
}))
app.use(bundle('app.js'));
```

- Duo (using generators)

```js
var bundle = Bundle(function *(file) {
  return yield Duo(file.root)
    .entry(file.path)
    .use(require('duo-sass')())
    .run();
})
app.use(bundle('app.css'));
```

- Gulp (using currying and globbing)

```js
var bundle = Bundler({ root: __dirname }, function(file, fn) {
  var gulp = Gulp.src(file.path, { cwd: file.root });

  if ('styl' == file.type) {
    gulp.pipe(styl())
      .on('error', fn);
  }

  gulp.pipe(myth())
    .on('error', fn)

  if ('production' == process.env.NODE_ENV) {
    gulp
      .pipe(csso())
      .on('error', fn);
  }

  gulp.on('end', fn);
});

// ... in another file, single middleware
app.use(bundle());

// multiple endpoints
bundle('app.styl');
bundle('app.js');
```

## Installation

```js
npm install koa-bundle
```

## API

#### `bundle(settings, handler) => bundler([path]) => middleware`
#### `bundle(handler)(glob) => bundler([path]) => middleware`

Create a bundler with an optional set of `settings` and a `handler`.

A `handler` can be a synchronous function, asynchronous function, generator or promise. The handler passes a `File` object that has the following properties:

```js
var File = {
  type: "js",
  src: "... JS ...",
  path: "dashboard.js",
  root: "/Users/Matt/Projects/..."
  minify: true,
  debug: false,
  cache: true,
  gzip: true,
}
```

---

The available `settings` are:

- `debug`: enables sourcemaps
- `minify`: minify JS and CSS
- `cache`: cache responses across requests and add etags
- `gzip`: gzip the response if it's supported

The default settings depend on the environment (`NODE_ENV`):

- Production:

  - `debug`: false
  - `minify`: true
  - `cache`: true
  - `gzip`: true

- Development:

  - `debug`: true
  - `minify`: false
  - `cache`: false
  - `gzip`: false

---

The bundler returns a function that you can then pass a `path` into:

```js
var bundle = Bundler(settings, handler);
app.use(bundle('app.js'));
```

The `path` is relative to `settings.root` or `process.cwd()`. The `script[src]` and `link[href]` is relative the `root` specified.

## TODO

- Warmup cache in production
- More examples
- Testing

## Credits

- [node-enchilada](https://github.com/defunctzombie/node-enchilada) and [browserify-middleware](https://github.com/forbeslindesay/browserify-middleware) for some ideas and general design.
- [static-cache](https://github.com/koajs/static-cache) for the caching, etagging and gzipping.
- sponsored by [Lapwing Labs](http://lapwinglabs.com).

## License

MIT

Copyright (c) 2015 Matthew Mueller &lt;matt@lapwinglabs.com&gt;
