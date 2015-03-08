
# koa-bundle

  Generic asset pipeline with caching, etags, minification, gzipping and sourcemaps.

  The child of [node-enchilada](https://github.com/defunctzombie/node-enchilada) and [static-cache](https://github.com/koajs/static-cache).

## Examples

- Browserify (with a callback and options)

```js
app.use(Bundle('app.js', { debug: true }, function(file, fn) {
  Browserify({ debug: file.debug })
    .add(file.path)
    .transform(require('babelify'))
    .bundle(fn);
}));
```

- Duo (using generators)

```js
app.use(Bundle('app.css', function *(file) {
  return yield Duo(file.root)
    .entry(file.path)
    .use(require('duo-sass')())
    .run();
});
```

- Gulp (using currying and globbing)

```js
var bundle = Bundler(function(file, fn) {
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

// ... in another file
app.use(bundle('app.{styl,css}', { root: __dirname }));
```

## Installation

```js
npm install koa-bundle
```

## API

#### `bundle(glob, settings, handler) => middleware`
#### `bundle(settings, handler)(glob) => middleware`
#### `bundle(handler)(glob) => middleware`

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
app.use(bundle('app.{js,css}'));
```

The `path` can be a glob and is relative to `settings.root` or `process.cwd()`. The `script[src]` and `link[href]` is relative the `root` specified.

## TODO

- Need someone to review the sourcemap implementation,
  don't have much experience with them. If you throw
  in the entry file, it looks all garbled.
- More examples
- Testing

## Credits

- [node-enchilada](https://github.com/defunctzombie/node-enchilada) and [browserify-middleware](https://github.com/forbeslindesay/browserify-middleware) for some ideas and general design.
- [static-cache](https://github.com/koajs/static-cache) for the caching, etagging and gzipping.
- sponsored by [Lapwing Labs](http://lapwinglabs.com).

## License

(The MIT License)

Copyright (c) 2015 Matthew Mueller &lt;matt@lapwinglabs.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
