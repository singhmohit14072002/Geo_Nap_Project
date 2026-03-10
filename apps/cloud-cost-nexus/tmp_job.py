import json, requests, time
extract=json.load(open('C:/geo_nap/tmp_last_extract.json'))
base='http://127.0.0.1:4001'
token=requests.post(base+'/auth/login',json={'email':'demo@geonap.local','password':'Demo12345!'}).json()['token']
project='00000000-0000-0000-0000-000000000000'
payload={
  'projectId': project,
  'cloudProviders':['azure'],
  'region':'centralindia',
  'azureEstimate': extract['azureEstimate']
}
res=requests.post(base+'/estimate',json=payload,headers={'Authorization':f'Bearer {token}'})
print('submit',res.status_code,res.text)
job=res.json().get('jobId')
for _ in range(10):
  st=requests.get(f"{base}/estimate/{job}",headers={'Authorization':f'Bearer {token}'}).json()
  print(st)
  if st.get('status')=='COMPLETED':
    break
  time.sleep(1)
