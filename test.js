// var Browserify = require('browserify');
// var supertest = require('supertest');
// var Bundle = require('./');
// var roo = require('roo')();

// var bundle = Bundle({}, function(file, fn) {
//   Browserify({ debug: file.debug })
//     .add(file.path)
//     .transform(require('babelify'))
//     .bundle(fn);
// });

// roo.use(bundle());

// bundle('new.js');
// bundle('react');

// var app = roo.listen();
// supertest(app)
// .get('/new.js')
// .end(function(err, res) {
//   if (err) throw err;
//   console.log('content', res.text);

//   supertest(app)
//   .get('/new.map.json')
//   .end(function(err, res) {
//     if (err) throw err;
//     console.log(res.text);
//     supertest(app)
//     .get('/react')
//     .end(function(err, res) {
//       if (err) throw err;
//       console.log(res.text);
//     })
//   })


// });
