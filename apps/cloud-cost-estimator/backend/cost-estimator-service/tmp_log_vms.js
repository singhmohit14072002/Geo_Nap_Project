const fs=require("fs");
const buf=fs.readFileSync('C:/geo_nap/tmp_last_extract.json');
const text=buf.toString('utf16le');
const data=JSON.parse(text);
const { extractAzureService } = require("./dist/services/azure-universal-extractor.service");
for (const r of data.azureEstimate.classifiedServices) {
  const svc=extractAzureService(r);
  if(svc && svc.serviceName==='Virtual Machines') {
    console.log(r.description);
    console.log(svc);
  }
}
