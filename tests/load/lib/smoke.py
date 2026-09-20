"""Tiny local smoke helper: `python3 tests/load/lib/smoke.py <role> <METHOD> <path> [json]`"""
import json,subprocess,sys,hashlib
def lid(t):
    h=hashlib.md5(('edura-load:'+t).encode()).hexdigest()
    h=h[:12]+'5'+h[13:16]+'a'+h[17:]
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"
def req(role,m,p,body=None,idx=0,port=None,show=400):
    ck=json.load(open(f'tests/load/.sessions/{role}.json'))[idx]['cookie']
    port=port or (3006 if role in('super_admin','accountant') else 3003)
    a=['curl','-s','-o','/dev/stderr','-w','=> %{http_code} %{time_total}s %{size_download}B','-X',m,'-H','cookie: '+ck,'-H','content-type: application/json','-H','x-forwarded-for: 10.1.1.1',f'http://localhost:{port}{p}']
    if body is not None: a+=['-d',json.dumps(body)]
    r=subprocess.run(a,capture_output=True,text=True)
    print(f'{m} {p}\n   {r.stderr[:show]}\n   {r.stdout.strip()}')
    try: return json.loads(r.stderr)
    except Exception: return None
if __name__=='__main__':
    req(sys.argv[1],sys.argv[2],sys.argv[3],json.loads(sys.argv[4]) if len(sys.argv)>4 else None)
