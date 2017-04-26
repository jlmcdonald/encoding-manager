# Installation

Create a config.local.js file in the `src/` directory with the following
contents

```javascript
module.exports = {
  development: { // the environment to use, picked by NODE_ENV
    server: {
      port: 8181,
      host: 'localhost',
      sslKey: '/path/to/ssl/key', // can be undefined
      sslCertificate: '/path/to/ssl/certificate', // can be undefined
    },
    // if empty, attempts a connection to remoteHost without attempting to autoscale
    // configuration parameters directly passed into the constructor for AWS.AutoScaling
    // see http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/AutoScaling.html#constructor-property
    AutoScaling: {
      accessKeyId: 'ABC123',
      secretAccessKey: 'ABC123',
      AutoScalingGroupName: 'ABC123',
      region: 'us-west-2',
      sslEnabled: true,
    },
    // if empty, attempts a connection to remoteHost without waiting for service
    ELB: {
      LoadBalancerName: '',
      accessKeyId: 'ABC123',
      secretAccessKey: 'ABC123',
      region: 'us-west-2',
      sslEnabled: true,
    },
    // can be a static instance or an AWS load balancer
    remoteHost: '127.0.0.1',
  }
}
```

Then run

1. `$ npm i`
2. `$ npm run build`
3. `$ cd app`
4. `$ bower i`
5. `$ npm start`
