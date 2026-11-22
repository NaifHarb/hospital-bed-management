const assert = require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {test}=require('node:test');
const {createContext,runInContext}=require('node:vm');
const html=readFileSync(join(__dirname,'../docs/index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const startup=script.lastIndexOf('\nseedPortalTasks();');
assert.ok(startup>0);
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v))}}
function setup(fixture){
 const localStorage=storage(),sessionStorage=storage();
 sessionStorage.setItem('hospital-demo-account','manager');
 sessionStorage.setItem('hospital-bed-view-session','yes');
 const alerts=[];
 const context=createContext({structuredClone,localStorage,sessionStorage,alert:m=>alerts.push(m),confirm:()=>true,document:{addEventListener(){},getElementById:()=>({addEventListener(){}})},window:{matchMedia:()=>({addEventListener(){}})},fixture});
 const run=s=>runInContext(s,context);
 run(script.slice(0,startup));
 run('db=fixture;render=()=>{};persist();');
 return {run,alerts,read:()=>JSON.parse(localStorage.getItem('hospital-bed-ipad-v2'))};
}
function bed(id,status='ready',type='ملاحظة'){return {id,dept:'الطوارئ',type,status,clean:status==='ready',equipment:true}}
function request(id,source='الهلال الأحمر السعودي',care='ملاحظة'){return {id,source,care,priority:'عاجل',status:'pending',bed:'',patient:'اختبار'}}
test('Red Crescent acceptance occupies exactly one compatible bed and updates persisted data',()=>{
 const fixture={beds:[bed('ER-1'),bed('ER-2')],requests:[request('SRC-1')],alerts:[],logs:[],settings:{reserveMin:0}};
 const s=setup(fixture);
 s.run("acceptRequestInline('SRC-1')");
 const result=s.read();
 assert.equal(result.requests[0].status,'arrived');
 assert.equal(result.requests[0].bed,'ER-1');
 assert.equal(result.beds[0].status,'occupied');
 assert.equal(result.beds[1].status,'ready');
 assert.equal(result.beds.filter(b=>b.status==='occupied').length,1);
 s.run("acceptRequestInline('SRC-1')");
 assert.deepEqual(s.read(),result,'second acceptance is idempotent');
});
test('no compatible ready bed leaves Red Crescent request and occupancy unchanged',()=>{
 const fixture={beds:[bed('ICU-1','ready','عناية مركزة'),bed('ER-1','occupied')],requests:[request('SRC-2')],alerts:[],logs:[],settings:{reserveMin:0}};
 const s=setup(fixture),before=s.read();
 s.run("acceptRequestInline('SRC-2')");
 assert.deepEqual(s.read(),before);
 assert.match(s.alerts[0],/لا يوجد سرير/);
});
test('ordinary admission remains accepted without occupying a bed',()=>{
 const fixture={beds:[bed('ER-1')],requests:[request('REQ-1','الطوارئ')],alerts:[],logs:[],settings:{reserveMin:0}};
 const s=setup(fixture);
 s.run("acceptRequestInline('REQ-1')");
 assert.equal(s.read().requests[0].status,'accepted');
 assert.equal(s.read().beds[0].status,'ready');
});
test('nursing filters and Red Crescent styling are present',()=>{
 assert.match(html,/data-nursing-dept/);
 assert.match(html,/nursingDeptFilter/);
 assert.match(html,/request-red-crescent/);
 assert.match(html,/isRedCrescent\(r\)/);
});
