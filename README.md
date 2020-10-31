# AMQP-Messaging
Highly efficient library to communicate with other microservices using RabbitMQ(AMQP Protocol) in nodejs

We're using GZIP and MsgPack for serialization. We also do packing to have a high throughput in Rabbitmq. 

### Installing
Install via NPM:
```
$ npm install --save amqp-messaging
```

## Passing RabbitMQ Address:
you need to set rabbitmq host address in the ENV variable as below:
```
AMQP_SERVER_ADDRESS= 'rabbitmq'
```
## Creating messaging variable
```
const Messaging = require('amqp-messaging');
const messaging = new Messaging();
//now you can work with messaging APIs
``` 

## Work Queues
When you want to push to a queue and go ahead, You're not waiting for any responses. you can see this example:
```javascript
await messaging.addWorker('mySampleQueue', async(data)=>{
  console.log(data.name);//Do whatever you want with data received
  await Promise.resolve();
}, {
  prefetchCount: 10
});
await messaging.sendPush('mySampleQueue', {
  name: 'Mehran'
});
``` 
default prefetchCount is set to 1. If you set it more than 1 Rabbitmq will give more than 1 items at once.

## Publish/Subscribe
```javascript
await messaging.subscribe('myQueueToSubscrie', async(data)=>{
  console.log(`message is received: ${data}`);//do what ever you want
  
});
await messaging.publish('myQueueToPublish', {
  sample: 'ok'
});
```
## RPC
```javascript
await messaging.addWorker('findUser', async(data)=>{
  return Promise.resolve({
     name: 'Mehran'
  });
}, {
  prefetchCount: 10,
  ttl: 1000
});

//In another microservice:
const user = await messaging.rpcCall('findUser', {
  id: '1234'
}, {
  ttl: 1000
});
console.log(`user is: ${user.name}`);
```
`ttl` in addWorker is the time to live for the queue in RabbitMQ, messages will be removed from the queue if `ttl` reached

`ttl` in rpcCall option is how much should the caller wait for the response? Promise will be rejected if TTL reached

It's prefered to set both `ttl` variables the same value.


## Finish all jobs and stop all rabbitmq workers
You can stop Gracefully shutdown with command below. It will Pack and send All remaining items in the queue to Rabbitmq and cancels all Workers
```javascript
const graceful = async () => {
  try {
    await messaging.cancelWorkers();
  } catch (e) {
    console.log('something bad happened', e);
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
  process.exit(0);
};

process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);
process.on('SIGUSR1', graceful);
```

##Packing
This library is able to pack many messages into just one message and send a huge one to RabbitMQ Queue.

You need to set `pack` option in the `sendPush` method:
```javascript
await messaging.addWorker('mySampleQueue', async(data)=>{
  console.log(data.name);//Do whatever you want with data received
  await Promise.resolve();
}, {
  prefetchCount: 10
});
await messaging.sendPush('mySampleQueue', {
  name: 'Mehran'
},{
  pack: {
    size: 3,
    interval: 3000//ms
  }
});
await messaging.sendPush('mySampleQueue', {
  name: 'Navid'
},{
  pack: {
    size: 3,
    interval: 3000//ms
  }
});
```
In this example, the library will not send messages `Mehran` and `Navid` immediately, it will wait until 3 seconds or 3 items to be packed together.
Packing is very helpful to reduce Rabbitmq's high CPU usage by lowering publish rates.


## Develop
We're open for pull requests. in order to run tests just run `npm run test`

