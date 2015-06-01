/**
 * Module Dependencies
 */

var external = require('./external.js');
var bundle = require('./bundle.js');
var roo = require('roo')(__dirname);


roo.use(external('react'));
roo.use(bundle());

bundle('./client.js');
bundle('./client.css');

roo.get('/', 'client.html');

roo.listen(5000, function() {
  var addr = this.address();
  console.log('listening on [%s]:%s', addr.address, addr.port);
})
