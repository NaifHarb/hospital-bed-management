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
 sessionStorage.setItem('hospital-demo-account','admin');
 sessionStorage.setItem('hospital-bed-view-session','yes');
 const alerts=[];
 const context=createContext({structuredClone,localStorage,sessionStorage,alert:m=>alerts.push(m),confirm:()=>true,document:{addEventListener(){},getElementById:()=>({addEventListener(){}})},window:{matchMedia:()=>({addEventListener(){}})},fixture});
 const run=s=>runInContext(s,context);
 run(script.slice(0,startup));
 run('db=fixture;render=()=>persist();persist();');
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

test('competing Red Crescent requests cannot occupy the same bed', () => {
 const first = request('SRC-1');
 const second = request('SRC-2');
 const s = setup({beds:[bed('ER-1')], requests:[first, second], alerts:[], logs:[]});
 s.run("acceptRequestInline('SRC-1')");
 const afterFirst = s.read();
 s.run("acceptRequestInline('SRC-2')");
 assert.deepEqual(s.read(), afterFirst);
 assert.equal(afterFirst.requests[1].status, 'pending');
 assert.match(s.alerts[0], /لا يوجد سرير/);
});

test('rejection and authorization leave occupancy intact', () => {
 const s = setup({beds:[bed('ER-1')], requests:[request('SRC-1')], alerts:[], logs:[]});
 const before = s.read();
 s.run("sessionStorage.setItem('hospital-demo-account','nurse_icu'); acceptRequestInline('SRC-1'); rejectRequest('SRC-1')");
 assert.deepEqual(s.read(), before);
 s.run("sessionStorage.setItem('hospital-demo-account','coord'); rejectRequest('SRC-1'); acceptRequestInline('SRC-1')");
 const result = s.read();
 assert.equal(result.requests[0].status, 'rejected');
 assert.equal(result.requests[0].timeline.length, 1);
 assert.deepEqual(result.beds, before.beds);
});

test('nursing view only shows eligible actions and tasks in the selected department', () => {
 const beds = [
  {...bed('ER-1','cleaning'), dept:'الطوارئ'},
  {...bed('ER-2','maintenance'), dept:'الطوارئ'},
  {...bed('ICU-1','reserved'), dept:'العناية المركزة'}
 ];
 const tasks = [
  {bed:'ER-1',kind:'cleaning',status:'pending'},
  {bed:'ER-2',kind:'maintenance',status:'working'},
  {bed:'ICU-1',kind:'maintenance',status:'done'}
 ];
 const s = setup({beds, requests:[{...request('REQ-1'),bed:'ICU-1',status:'reserved'}], departmentTasks:tasks, alerts:[], logs:[]});
 const station = s.run("nursingDeptFilter='الطوارئ'; nursingPage()");
 assert.match(station, /ER-1/);
 assert.match(station, /بانتظار الاستلام/);
 assert.match(station, /قيد التنفيذ <b>1/);
 assert.doesNotMatch(station, /ICU-1|data-portal-action="arrival"/);
 const nurse = s.run("sessionStorage.setItem('hospital-demo-account','nurse_icu'); nursingPage()");
 assert.match(nurse, /ICU-1/);
 assert.match(nurse, /data-portal-action="arrival"/);
 assert.doesNotMatch(nurse, /ER-1|ER-2/);
 s.run("arrivalFromNursing('ICU-1'); dischargeFromNursing('ICU-1')");
 const result = s.read();
 assert.equal(result.beds[2].status, 'cleaning');
 assert.equal(result.requests[0].status, 'closed');
 assert.equal(result.departmentTasks.find(t=>t.bed==='ICU-1'&&t.kind==='cleaning').status, 'pending');
});

test('academic demo preset prepares one pending Red Crescent request and can be replayed',()=>{
 const s=setup({beds:[bed('ER-1')],requests:[],alerts:[],logs:[],settings:{reserveMin:0}});
 s.run('prepareAcademicDemo()');
 const first=s.read();
 const sample=first.requests.find(r=>r.id==='DEMO-AMB-001');
 assert.ok(sample);
 assert.equal(sample.status,'pending');
 assert.equal(sample.source,'الهلال الأحمر السعودي');
 assert.ok(first.beds.some(b=>b.status==='ready'&&b.type===sample.care));
 s.run("acceptRequestInline('DEMO-AMB-001')");
 assert.equal(s.read().requests.find(r=>r.id==='DEMO-AMB-001').status,'arrived');
 s.run('prepareAcademicDemo()');
 assert.equal(s.read().requests.filter(r=>r.id==='DEMO-AMB-001').length,1);
 assert.equal(s.read().requests.find(r=>r.id==='DEMO-AMB-001').status,'pending');
});
test('audit history search and offline launchers are exposed',()=>{
 assert.match(html,/filterAuditRows/);
 assert.match(html,/academicAuditTable/);
 assert.match(html,/prepareAcademicDemo/);
});

test('forty-bed seed is repeatable and preserves existing records',()=>{
 const s=setup({beds:[bed('CUSTOM-1')],requests:[],alerts:[],logs:[],settings:{reserveMin:0}});
 s.run('ensureFortyDemoBeds(db);persist()');
 const first=s.read();
 assert.equal(first.beds.length,40);
 assert.ok(first.beds.some(b=>b.id==='CUSTOM-1'));
 assert.equal(new Set(first.beds.map(b=>b.id)).size,40);
 s.run('ensureFortyDemoBeds(db);persist()');
 assert.equal(s.read().beds.length,40);
});
test('fresh university demo contains forty beds across multiple departments',()=>{
 const s=setup({beds:[],requests:[],alerts:[],logs:[],settings:{reserveMin:0}});
 s.run('prepareAcademicDemo()');
 const data=s.read();
 assert.equal(data.beds.length,40);
 assert.ok(new Set(data.beds.map(b=>b.dept)).size>=6);
});

test('report KPIs navigate to bed status and requests',()=>{
 assert.match(html,/data-report-target/);
 assert.match(html,/function openReportKpi\(/);
 assert.match(html,/reportStat\('قيد التنظيف'/);
 assert.match(html,/reportStat\('طلبات مفتوحة'/);
});
test('nursing login departments are dynamically grouped without nursing prefix',()=>{
 assert.match(html,/function populateNursingLoginGroups\(/);
 assert.match(html,/LOGIN_GROUPS\[value\]=nursingAccounts.filter/);
 assert.match(html,/label.replace\(\/\^تمريض/);
 assert.match(html,/القسم المراد \/ المستخدم/);
});

test('notification bell toggles back to the previously viewed page',()=>{
 assert.match(html,/onclick="toggleAlertPage\(\)"/);
 assert.match(html,/function toggleAlertPage\(\)/);
 const s=setup({beds:[bed('ER-1')],requests:[],alerts:[],logs:[],settings:{reserveMin:0}});
 s.run("page='reports';render=()=>{};applySidebar=()=>{};go=key=>{page=key};toggleAlertPage()");
 assert.equal(s.run('page'),'alerts');
 s.run('toggleAlertPage()');
 assert.equal(s.run('page'),'reports');
});

test('theme toggle reverses on second click without changing hospital records',()=>{
 const s=setup({beds:[bed('ER-1')],requests:[],alerts:[],logs:[],settings:{reserveMin:0}});
 s.run('applyTheme=()=>{}');
 const before=s.run('currentTheme');
 s.run('toggleTheme()');
 assert.notEqual(s.run('currentTheme'),before);
 s.run('toggleTheme()');
 assert.equal(s.run('currentTheme'),before);
 assert.equal(s.read().beds.length,1);
});
test('sidebar toggle reverses on second click on desktop and mobile',()=>{
 const s=setup({beds:[bed('ER-1')],requests:[],alerts:[],logs:[],settings:{reserveMin:0}});
 s.run('applySidebar=()=>{};document.querySelector=()=>({focus(){}});mobileLayout.matches=false');
 const desktop=s.run('sidebarCollapsed');
 s.run('toggleSidebar()');
 assert.notEqual(s.run('sidebarCollapsed'),desktop);
 s.run('toggleSidebar()');
 assert.equal(s.run('sidebarCollapsed'),desktop);
 s.run('mobileLayout.matches=true');
 s.run('toggleSidebar()');
 assert.equal(s.run('mobileSidebarOpen'),true);
 s.run('toggleSidebar()');
 assert.equal(s.run('mobileSidebarOpen'),false);
});
test('user menu toggle and close maintain expanded state',()=>{
 const s=setup({beds:[bed('ER-1')],requests:[],alerts:[],logs:[],settings:{reserveMin:0}});
 s.run(`{
 const classes=new Set(['hidden']);
 const menu={classList:{contains:k=>classes.has(k),add:k=>classes.add(k),toggle:(k,force)=>force?classes.add(k):classes.delete(k)}};
 const button={setAttribute:(k,v)=>{menu.expanded=v}};
 document.getElementById=id=>id==='userMenu'?menu:button;
 globalMenu=menu;
 }`);
 s.run('toggleUserMenu()');
 assert.equal(s.run('globalMenu.expanded'),'true');
 s.run('toggleUserMenu()');
 assert.equal(s.run('globalMenu.expanded'),'false');
 s.run('toggleUserMenu();closeUserMenu()');
 assert.equal(s.run('globalMenu.expanded'),'false');
});
test('dashboard KPI click toggles filter off on repeated click',()=>{
 assert.match(html,/dashboardBedFilter === filter \? '' : filter/);
 assert.match(html,/aria-pressed/);
 assert.match(html,/id="clearDashboardFilter"/);
});
test('navigation buttons are intentionally page links rather than closable popovers',()=>{
 assert.ok(html.includes('data-view='));
 assert.match(html,/onclick="go\(/);
 assert.match(html,/function go\(k\)/);
});
