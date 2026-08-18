import os, re, sys
ROOT="/Users/ali/edura"
rows=[]
METH=re.compile(r'export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b')
GATES=[
 (re.compile(r'requireRole\(([^)]*)\)'), lambda m:'requireRole('+m.group(1).replace('"','').replace(' ','')+')'),
 (re.compile(r'requireCenterActor\('), lambda m:'requireCenterActor'),
 (re.compile(r'requireTeacherActor\('), lambda m:'requireTeacherActor'),
 (re.compile(r'requireSession\(\)'), lambda m:'requireSession'),
 (re.compile(r'getSessionUser\(\)'), lambda m:'getSessionUser'),
]
WRAP=re.compile(r'export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*([A-Za-z_]+)\(')
ALLOW=re.compile(r'allow:\s*([A-Z_]+)')
for app in ("erp","superadmin","www"):
    base=os.path.join(ROOT,"apps",app,"src","app")
    if not os.path.isdir(base): continue
    for dirpath,_,files in os.walk(base):
        if "route.ts" not in files: continue
        f=os.path.join(dirpath,"route.ts")
        p=dirpath[len(base):]
        url=re.sub(r'/\([^)]*\)','',p) or '/'
        src=open(f,encoding='utf-8',errors='replace').read()
        lines=src.split('\n')
        # find each exported method and scan its following block for a gate
        for i,line in enumerate(lines):
            mm=METH.search(line)
            if not mm: continue
            meth=mm.group(1)
            wm=WRAP.search(line)
            wrapper=wm.group(2) if wm else ''
            block='\n'.join(lines[i:i+25])
            gate=''
            for rx,fn in GATES:
                g=rx.search(block)
                if g: gate=fn(g); break
            al=ALLOW.search(block)
            allow=al.group(1) if al else ''
            rl='withRateLimit' if 'withRateLimit' in line or 'withRateLimit' in block[:200] else ''
            rows.append('\t'.join([app,url,meth,gate or 'NONE',wrapper,allow,rl,f[len(ROOT)+1:]]))
print('\n'.join(sorted(set(rows))))
