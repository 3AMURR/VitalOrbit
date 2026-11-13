# Downloads ISA metadata zips for every public OSDR study.
# Usage: python3 scripts/download_osdr_metadata.py data/osdr_metadata
# Some requests time out; just re-run, existing files are skipped.
import json,urllib.request,os,sys
from concurrent.futures import ThreadPoolExecutor
out=sys.argv[1]; os.makedirs(out,exist_ok=True)
def get(u): return urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=120).read()
ids=[]
for frm in range(0,600,100):
    d=json.loads(get(f'https://osdr.nasa.gov/osdr/data/search?term=&type=cgene&from={frm}&size=100'))
    ids+= [h['_source']['Accession'] for h in d['hits']['hits']]
ids=sorted(set(ids)); print(len(ids),'studies')
tot=[0,0]
def one(a):
    try:
        n=a.split('-')[1]
        d=json.loads(get(f'https://osdr.nasa.gov/osdr/data/osd/files/{n}'))
        for k,v in d['studies'].items():
            tot[1]+=sum(f.get('file_size',0) for f in v['study_files'])
            for f in v['study_files']:
                if f['category']=='Study Metadata Files' and not f.get('restricted'):
                    p=os.path.join(out,f['file_name'])
                    if not os.path.exists(p):
                        open(p,'wb').write(get('https://osdr.nasa.gov'+f['remote_url'])); tot[0]+=1
    except Exception as e: print('ERR',a,e)
with ThreadPoolExecutor(8) as ex: list(ex.map(one,ids))
print('metadata files downloaded',tot[0],'| total OSDR size all files TB',tot[1]/1e12)
