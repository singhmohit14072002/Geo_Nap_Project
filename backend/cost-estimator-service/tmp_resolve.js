const { resolveAzurePrice } = require('./dist/services/universal-azure-pricing.service');
(async () => {
  try {
    const res = await resolveAzurePrice({
      serviceName: 'Bandwidth',
      region: 'centralindia',
      usageQuantity: 500,
      unitType: 'GB'
    });
    console.log(res);
  } catch (e) {
    console.error('err', e);
  }
})();
