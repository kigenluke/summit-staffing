const { processForgottenClockOuts } = require('../services/shiftClockService');

const runForgottenClockOutCron = async () => {
  const result = await processForgottenClockOuts();
  if (result.processed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[cron] forgotten clock-out processed ${result.processed} booking(s)`);
  }
  return result;
};

module.exports = { runForgottenClockOutCron };
