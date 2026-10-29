"""Extract the approved design without modifying the reference prototypes."""
import re, json, base64
from pathlib import Path
from html.parser import HTMLParser
root = Path(__file__).resolve().parents[1]
out = root / 'apps/web/public/design'
out.mkdir(parents=True, exist_ok=True)
data = root / 'apps/web/src/design'
data.mkdir(parents=True, exist_ok=True)
class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tree=[]; self.stack=[]; self.body=False; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag=='body': self.body=True; return
        if not self.body:return
        if tag in ('script','style','noscript'): self.skip+=1; return
        if self.skip:return
        attrs=dict(attrs)
        attrs={k:v for k,v in attrs.items() if not k.startswith('on')}
        if attrs.get('href')=='admin-dashboard.html':attrs['href']='/admin'
        if attrs.get('href')=='portfolio.html':attrs['href']='/'
        if attrs.get('src','').startswith('data:image/webp;base64,'):
            (out/'portrait.webp').write_bytes(base64.b64decode(attrs['src'].split(',')[1]));attrs['src']='/design/portrait.webp'
        node={'tag':tag,'attrs':attrs,'children':[]}
        (self.stack[-1]['children'] if self.stack else self.tree).append(node)
        if tag not in ('img','input','br','hr','meta','link','source','wbr','area','embed'):self.stack.append(node)
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript'):
            self.skip=max(0,self.skip-1);return
        if tag=='body':self.body=False;return
        if self.skip:return
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i]['tag']==tag:self.stack=self.stack[:i];break
    def handle_data(self,text):
        if self.body and not self.skip:(self.stack[-1]['children'] if self.stack else self.tree).append(text)
for name in ('portfolio','admin-dashboard'):
    source=(root/f'prototypes/{name}.html').read_text(encoding='utf-8')
    parser=Parser();parser.feed(source)
    (data/f'{name}.json').write_text(json.dumps(parser.tree,ensure_ascii=False),encoding='utf-8')
    (out/f'{name}.css').write_text('\n'.join(re.findall(r'<style[^>]*>(.*?)</style>',source,re.S)),encoding='utf-8')
    if name=='portfolio':
        runtime=next(s for s in re.findall(r'<script[^>]*>(.*?)</script>',source,re.S) if 'const D=' in s)
        runtime='const D=window.RF_DATA;\n'+runtime.split('const $=',1)[1]
        runtime=runtime.replace('const D=window.RF_DATA;\n','const D=window.RF_DATA;\nconst $=',1)
        # The prepared responses are now managed in the real dashboard.
        a=runtime.index('const QA=['); b=runtime.index('const ch=',a)
        runtime=runtime[:a]+"const QA=D.assistant.map(p=>({cmd:p.command,label:p.label,q:p.question,a:()=>p.answer,go:p.goSection}));\n"+runtime[b:]
        runtime=runtime.replace("function archiveHash(key='all'){return '#projects/all'", "function archiveHash(key='all'){return '/projects'")
        runtime=runtime.replace("location.hash.split('?')[1]||''", "location.pathname==='/projects'?location.search.slice(1):location.hash.split('?')[1]||''")
        runtime=runtime.replace("'','#project/'+slug", "'','/projects/'+slug")
        runtime=runtime.replace("'','#projects'", "'','/#projects'")
        runtime=runtime.replace("const hash=location.hash;if(lastHash", "const hash=location.pathname.startsWith('/projects/')?'#project/'+location.pathname.split('/')[2]:location.pathname==='/projects'?'#projects/all'+location.search:location.hash;if(lastHash")
        runtime=runtime.replace("lastHash=location.hash}", "lastHash=null}")
        runtime=runtime.replace("const project=e.target.closest('a[data-project]');", "const home=e.target.closest('a[href^=\"#\"]');if(home&&location.pathname!=='/'&&/^#(home|about|stack|projects|experience|certificates|contact)$/.test(home.getAttribute('href'))){e.preventDefault();saveCurrentView();history.pushState({view:'home'},'','/'+home.getAttribute('href'));lastHash=null;route();return}const project=e.target.closest('a[data-project]');")
        runtime=runtime.replace('href="#project/${p.slug}"','href="/projects/${p.slug}"').replace('href="#project/${next.slug}"','href="/projects/${next.slug}"').replace('href="#projects/all"','href="/projects"')
        runtime=runtime.replace('esc(stackNames[i]||g.c)',"esc(({frontend:'Frontend',backend:'Backend','linux & servers':'Linux & servers',tooling:'Tooling'})[g.c.toLowerCase()]||g.c)")
        runtime=runtime.replace('admin-dashboard.html','/admin').replace("'','#'+link.dataset.go", "'','/#'+link.dataset.go")
        runtime=runtime.replace("lastHash=hash;", "lastHash=hash;dispatchEvent(new Event('rf-route'));")
        # Legacy interactions are scoped; no global lexical redeclarations on navigation.
        (out/'portfolio-runtime.js').write_text('(()=>{\n'+runtime+'\n})();',encoding='utf-8')
        templates=runtime[runtime.index('const esc='):runtime.index('let copyReset;')]
        detail=runtime[runtime.index('function caseBlock('):runtime.index('function route()')]
        prefix='''// Generated from the approved, escaped templates. Run scripts/extract-design.py to refresh.
import { RFProjects } from './visuals.js';
export function renderDesign(D, slug='') {
const elements=new Map();
const $=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',hidden:false,querySelectorAll:()=>[]});return elements.get(selector);};
const document={baseURI:'https://portfolio.invalid/'};
const window={RFProjects};
const history={state:{}};
const detailMain=$('#project-detail');
const archiveHash=()=>'/projects';
'''
        suffix="\nrenderArchive('all');if(slug){const p=projects.find(p=>p.slug===slug);if(p)renderDetail(p);}return Object.fromEntries([...elements].map(([key,value])=>[key.slice(1),{innerHTML:value.innerHTML,textContent:String(value.textContent),hidden:value.hidden}]));\n}\n"
        (data/'templates.js').write_text(prefix+templates+detail+suffix,encoding='utf-8')
for name in ('refinements.css','projects.css','splash.css','contact.css','admin-motion.css','projects.js','splash.js','locale-id.js','locale.js'):
    (out/name).write_bytes((root/'prototypes'/name).read_bytes())
p=out/'locale.js'
p.write_text(p.read_text(encoding='utf-8').replace("function translate(value) {", "function translate(value) {\n    const custom=window.RF_COPY?.[normalize(value)];\n    if(custom){const next=locale==='id'?(custom.id||custom.en):(custom.en||normalize(value));if(next)return value.match(/^\\s*/)[0]+next+value.match(/\\s*$/)[0];}"),encoding='utf-8')
# The project visuals share the safe URL helper with the portfolio renderer.
p=out/'projects.js';p.write_text(p.read_text(encoding='utf-8').replace('href="#project/${p.slug}"','href="/projects/${p.slug}"').replace('href="#project/${next.slug}"','href="/projects/${next.slug}"').replace('const e =','const safeURL=(value)=>{if(!value)return "";try{const u=new URL(value,document.baseURI);return ["https:","http:"].includes(u.protocol)?u.href:""}catch{return ""}};\n  const e ='),encoding='utf-8')
(data/'visuals.js').write_text(p.read_text(encoding='utf-8').replace('window.RFProjects =','export const RFProjects =').replace('document.baseURI',"'https://portfolio.invalid/'"),encoding='utf-8')
print('Extracted approved markup, CSS, portrait, and interaction assets.')
