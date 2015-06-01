/**
 * Module Dependencies
 */

var request = require('supertest');
var join = require('path').join;
var assert = require('assert');
var Bundle = require('..');
var http = require('http');
var roo = require('roo');

var fixtures = join(__dirname, 'fixtures');

describe('bundle', function() {

  it('should support mounts', function(done) {
    var bundle = Bundle({ root: fixtures }, function(file) {
      file.src = "some js asset";
      return file;
    })

    var app1 = roo(fixtures);
    app1.use(bundle('/simple.js'));

    var app2 = roo(join(fixtures, 'mount'));
    app2.use(bundle('/mount/mount.js'));

    app1.mount('/app2', app2);

    request(app1.listen())
      .get('/simple.js')
      .end(function(err, res) {
        if (err) return done(err);
        assert.equal('some js asset', res.text);

        request(app1.listen())
          .get('/mount/mount.js')
          .end(function(err, res) {
            if (err) return done(err);
            assert.equal('some js asset', res.text);
            done();
          })
      })

  })

})
