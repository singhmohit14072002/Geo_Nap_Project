const https=require('https');
const url="https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20'Bandwidth'%20and%20armRegionName%20eq%20'centralindia'%20and%20priceType%20eq%20'Consumption'&api-version=2023-01-01-preview&meterRegion='primary'";
https.get(url,(res)=>{let data='';res.on('data',d=>data+=d);res.on('end',()=>{console.log('status',res.statusCode);try{const j=JSON.parse(data);console.log('count',j.Items?.length);console.log('first',j.Items?.[0]);}catch(e){console.error(e);} });});
