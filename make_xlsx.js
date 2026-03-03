const XLSX = require('xlsx');
const path = 'C:/geo_nap/tmp_azure_sample.xlsx';
const ws_data = [
  ['Azure Estimate Export'],
  ['Generated for test'],
  [],
  ['Service category','Service type','Region','Description'],
  ['Compute','Virtual Machines','Central India','1 F8s Windows 730 hours'],
  ['Storage','Managed Disks','Central India','2 P10 disks'],
  ['Networking','Bandwidth','Central India','500 GB outbound'],
];
const ws = XLSX.utils.aoa_to_sheet(ws_data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, path);
console.log('written', path);
