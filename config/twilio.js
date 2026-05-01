const twilio = require('twilio');
const { env } = require('./env');

function isTwilioConfigured() {
  return Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.whatsappFrom);
}

function getTwilioClient() {
  if (!isTwilioConfigured()) return null;
  return twilio(env.twilio.accountSid, env.twilio.authToken);
}

module.exports = { isTwilioConfigured, getTwilioClient };

