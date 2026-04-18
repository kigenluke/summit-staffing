require('dotenv').config();

const twilio = require('twilio');

const getClient = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env');
  }

  return twilio(sid, token);
};

const sendSMS = async (phoneNumber, message) => {
  try {
    const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM;
    if (!from) {
      throw new Error('TWILIO_PHONE_NUMBER (or TWILIO_FROM) must be set in .env');
    }

    const client = getClient();

    return await client.messages.create({
      to: phoneNumber,
      from,
      body: message
    });
  } catch (err) {
    // swallow sms errors
    return null;
  }
};

module.exports = {
  sendSMS
};
