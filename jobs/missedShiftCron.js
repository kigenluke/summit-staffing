const { processMissedShifts } = require('../services/missedShiftService');

const runMissedShiftCron = async () => {
  const result = await processMissedShifts();
  if (result.processed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[cron] missed-shift auto-close processed ${result.processed} booking(s)`);
  }
  return result;
};

module.exports = { runMissedShiftCron };
