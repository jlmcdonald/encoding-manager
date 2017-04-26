const bunyan = require('bunyan'),
      env = process.env.NODE_ENV || 'development';

global.config = require('./config.local')[env];
global.LOG = bunyan.createLogger({
    name: 'demo',
    level: bunyan.INFO,
    src: true
});

global.PROCESS_STATE = {
  ANNOTATE: 'tools.annotate',
  ENCODE: 'tools.encode',
  ENCRYPT: 'tools.encrypt',
  DONE: 'tools.done',
  PLAYLIST: 'tools.playlist',
  ERROR: 'tools.error',
};
