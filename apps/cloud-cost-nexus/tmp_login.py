import requests
base='http://127.0.0.1:4001'
resp=requests.post(base+'/auth/login',json={'email':'demo@geonap.local','password':'Demo12345!'},timeout=10)
print(resp.status_code)
print(resp.text)
