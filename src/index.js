const restify = require('restify'),
    bunyan = require('bunyan'),
    fs = require('fs'),
    https = require('https'),
    regulator = require('./regulator');

const works = {};

require('./globals');

const crtPath = config.server.sslCertificate;
const keyPath = config.server.sslKey;

let server = restify.createServer({
  certificate: crtPath ? fs.readFileSync(crtPath, 'utf8') : undefined,
  key: keyPath ? fs.readFileSync(keyPath, 'utf8') : undefined,
  log: global.LOG.child({
    component: 'server',
    level: bunyan.INFO,
    streams: [{
      level: bunyan.DEBUG,
      type: 'raw',
      stream: new restify.bunyan.RequestCaptureStream({
        level: bunyan.WARN,
        maxRecords: 100,
        maxRequestIds: 1000,
        stream: process.stderr
      })
    }],
    serializers: bunyan.stdSerializers
  })
});

server.use(restify.acceptParser(server.acceptable));
server.use(restify.bodyParser());
server.use(restify.requestLogger());
server.use(restify.queryParser());

let io = require("socket.io")(server.server);
// ensure that the user is signed in
io.use( (socket, next) => {
  const token = socket.handshake.query.token;
  if(token) {
    const req = https.request({
      hostname: 'www.example.com',
      protocol: 'https:',
      path: `/api/users/from_token/?token=${token}`,
      method: 'HEAD',
      headers: {
        'Authorization': `Token ${token}`,
      },
    }, res => {
      if(res.statusCode === 200) {
        next();
      } else {
        next(new Error("Invalid auth token"));
      }
    });
    req.end();
    req.on('error', e => {
      next(new Error("Invalid token"));
    });
    return;
  }
  next(new Error("Invalid Authorization header"));
});

regulator.emitter.on('data', data => {
  if(data.args instanceof Array && data.args.length >= 1) {
    const work = data.args[0];

    if(!work.state) {
      work.state = data.event;
    }

    // update our local copy
    works[work.dwid] = work;
    io.emit(data.event, work);
  }
});

io.on('connection', socket => {
  socket.on(PROCESS_STATE.ENCODE, dwid => {
    const work = works[dwid];
    if(work !== undefined && work.state !== PROCESS_STATE.ERROR) {
      socket.emit('info', `DWID ${dwid} is already in process or complete`);
      return;
    }
    works[dwid] = {
      state: PROCESS_STATE.ENCODE,
      progress: undefined,
      message: 'Initiating',
      dwid: dwid,
    };
    io.emit(works[dwid].state, works[dwid]);
    regulator.processEncode(dwid);
  });
  socket.on('ready', () => {
    socket.emit('works', Object.values(works));
  });
});

server.listen(config.server.port,config.server.host,function() {
  LOG.info("Server started on port %s",config.server.port);
});
