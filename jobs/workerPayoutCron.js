const { runWorkerPayoutRetryJob } = require('../services/workerTransferService');

const runWorkerPayoutCron = async () => {
  const result = await runWorkerPayoutRetryJob({ limit: 100 });
  if (result.transferred > 0 || result.failed > 0 || result.checkout_reconciled > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[cron] worker payout retry: checked=${result.checked} transferred=${result.transferred} failed=${result.failed} skipped=${result.skipped} checkout_reconciled=${result.checkout_reconciled || 0}`
    );
  }
  return result;
};

module.exports = { runWorkerPayoutCron };
