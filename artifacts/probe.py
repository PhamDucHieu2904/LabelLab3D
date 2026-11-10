import bpy, os, json
open('D:/program project/3D mockup web version/artifacts/probe-env.json','w').write(json.dumps({'file':bpy.data.filepath,'source':os.environ.get('PULLCAP_CAP_SOURCE')}))
