const { resolveAzurePrice } = require('./dist/services/universal-azure-pricing.service');
(async()=>{
  try {
    const res = await resolveAzurePrice({serviceName:'Virtual Machines', armSkuName:'Standard_F8s', region:'centralindia', usageQuantity:730, unitType:'Hour'});
    console.log(res);
  } catch(e){
    console.error(e);
  }
})();
