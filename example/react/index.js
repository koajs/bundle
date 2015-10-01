/**
 * Module Dependencies
 */

var external = require('./external.js');
var bundle = require('./bundle.js');
var roo = require('roo')(__dirname);

roo.use(external('react'));
roo.use(bundle({ root: __dirname }));

bundle(__dirname + '/client.js?external');
bundle(__dirname + '/client.css');

roo.get('/', 'client.html');

roo.listen(5050, function() {
  var addr = this.address();
  console.log('listening on [%s]:%s', addr.address, addr.port);
})
