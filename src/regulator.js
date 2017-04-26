require('./globals');

// used in retrieving running instances on reboot
const REMOTE_SERVER_TCP_PORT = 8675, // for connecting monitoring sockets

      // needs to be lower than the Idle Timeout in the Load Balancer's
      // connection settings (the default AWS setting is 60 seconds, so this
      // should probably be lower than that)
      HEARTBEAT_INTERVAL_MS = 30 * 1000,

      sockets = new Set(),
      EventEmitter = require('events'),
      jot = require('json-over-tcp'),
      AWS = require('aws-sdk'),
      net = require('net');

exports.emitter = new EventEmitter();

// Helper function for sending the standard event consumed by index.js
exports.sendWorkMessage = function(dwid, event, message = null) {
  exports.emitter.emit('data', {
    event: event,
    args: [{
      dwid: dwid,
      message: message,
    }]
  });
}

function attachSocket() {
  LOG.debug('Attaching sockets to', config.remoteHost);
  return new Promise( (resolve, reject) => {

    const sock = new jot.Socket();

    let interval = null;

    sock.once('connect', () => {
      LOG.debug('Connected to %s', config.remoteHost);
      // n.b. Because Amazon AWS' Elastic Load Balancer proxies requests, our
      // TCP connection to this port means zilch. We need to wait for a message
      // from the end service before anything can be assumed. If the endpoint
      // doesn't respond to our write, it should kick off an error event, which
      // will reject the promise (see sock.once('error', …) ).
      sock.write({'event': 'echo'});
      sock.once('data', () => {
        // it's alive! connection is set and data is being transmitted
        sockets.add(sock);
        resolve(sock);
        interval = setInterval( () => {
          sock.write({'event': 'heartbeat'});
        }, HEARTBEAT_INTERVAL_MS);
      });
    });

    sock.once('error', e => {
      sockets.delete(sock);
      reject(e);
      clearInterval(interval);
    });

    sock.once('close', () => {
      LOG.debug('Connection to %s closed', config.remoteHost);
      sockets.delete(sock);
      clearInterval(interval);
    });

    // TODO: ensure that remote host doesn't allow connections from anyone
    // but the management server
    sock.connect(REMOTE_SERVER_TCP_PORT, config.remoteHost);

    // this allows all existing sockets to funnel data to the same emitter
    // which makes listening easier
    sock.on('data', data => {
      exports.emitter.emit('data', data);
    });

  })
};

function autoScale() {
  if(!config.AutoScaling) {
    LOG.debug('No AutoScaling group found in config, not autoscaling.');
    return Promise.resolve();
  }

  const DESIRED_CAPACITY = 1;
  const scaling = new AWS.AutoScaling(config.AutoScaling);
  const gname = config.AutoScaling.AutoScalingGroupName;

  return scaling.describeAutoScalingGroups({AutoScalingGroupNames: [ gname ]})
  .promise()
  .then(data => {
    if(data.AutoScalingGroups.length <= 0) {
      let err = new Error(`No autoscaling groups found for ${gname}`);
      LOG.error(err);
      reject(err);
    }
    return data.AutoScalingGroups[0];
  })
  .then( group => {
    if(group.DesiredCapacity < DESIRED_CAPACITY) {
      LOG.debug(`Capacity set to ${group.DesiredCapacity}; increasing to ${DESIRED_CAPACITY}`);
      return scaling.setDesiredCapacity({
        AutoScalingGroupName: gname,
        DesiredCapacity: DESIRED_CAPACITY,
        HonorCooldown: false,
      })
      .promise()
    }
    return true;
  });
}

function waitForAvailable() {

  if(!config.ELB) {
    LOG.debug("No ELB configuration set up. Attempting immediate connection.");
    return Promise.resolve();
  }
  const elb = new AWS.ELB(config.ELB);

  return elb.waitFor('anyInstanceInService', {
    LoadBalancerName: config.ELB.LoadBalancerName
  }).promise();
}

exports.processEncode = function(dwid) {
  const st = PROCESS_STATE.ENCODE;

  exports.sendWorkMessage(dwid, st, 'Scaling servers');
  LOG.info(`Request to encode DWID: '${dwid}'`);

  autoScale()
  .then( () => exports.sendWorkMessage(dwid, st, 'Waiting for available') )
  .then( waitForAvailable )
  .then( () => exports.sendWorkMessage(dwid, st, 'Server found. Connecting.') )
  .then( attachSocket )
  .then( socket => {
    exports.sendWorkMessage(dwid, st, 'Reticulating splines');
    socket.write({'event': PROCESS_STATE.ENCODE, 'dwid': dwid});
  })
  .catch( err => {
    exports.sendWorkMessage(dwid, PROCESS_STATE.ERROR, err.message);
    global.LOG.error("Error initiating process", err);
  });
}
