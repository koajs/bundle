/**
 * Module Dependencies
 */

var mount = require('koa-mount');
var koa = require('koa');
var app = koa();

/**
 * Mount
 */

app.use(mount('/dash', require('./dash')));

app.listen(7000, function() {
  var addr = this.address();
  console.log('listening on [%s]:%d', addr.address, addr.port);
});
