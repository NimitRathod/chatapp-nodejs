const _ = require('lodash');
let TOKEN = 'sk_test_WtzRTAe7St2V7HsMthrxaIYG';
if(process.env.ENVIRONMENT === 'prod') {
     TOKEN = 'sk_live_L5yfj5sssdj8yXkputNK4YFDwb7';
}

const User = require('../models/User');
const paymentGateway = require('config/paymentGateway')(TOKEN);

module.exports = {
};
