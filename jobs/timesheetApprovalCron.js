const { runAutoApprovals } = require('../services/timesheetApprovalService');

const runTimesheetApprovalCron = async () => {
  const result = await runAutoApprovals();
  if (result.processed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[cron] timesheet auto-approval processed ${result.processed} booking(s)`);
  }
  return result;
};

module.exports = { runTimesheetApprovalCron };
