import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const statuses = {
  available: { label: 'متاح', icon: '▣' },
  occupied: { label: 'مشغول', icon: '▤' },
  reserved: { label: 'محجوز', icon: '◷' },
  cleaning: { label: 'تنظيف', icon: '✦' },
  maintenance: { label: 'صيانة', icon: '⚒' }
};
const names = ['الطوارئ','العناية المركزة','الباطنية','الجراحة'];
const STORE = 'hospital-management-workspace-v1';
function seed() {
  const beds=[]; let count=0;
  names.forEach((departmentName,section) => {
    for(let room=1;room<=3;room++) for(let bed=1;bed<=4;bed++){
      count++;
      const status=count%17===0?'maintenance':count%11===0?'cleaning':count%5===0?'reserved':count%3===0?'occupied':'available';
      beds.push({id:String(count),label:'B'+String(bed).padStart(2,'0'),roomName:String(section+1)+String(room).padStart(2,'0'),departmentName,status,reference:status==='reserved'||status==='occupied'?'REF-'+String(count).padStart(4,'0'):''});
    }
  });
  return beds;
}
function loadLocal() {
  try { const value=JSON.parse(localStorage.getItem(STORE)); if(Array.isArray(value)&&value.length===48) return value; } catch {}
  return seed();
}
function App() {
  const [beds,setBeds]=React.useState(loadLocal);
  const [department,setDepartment]=React.useState('الكل');
  const [filter,setFilter]=React.useState('all');
  const [selected,setSelected]=React.useState(null);
  const [reference,setReference]=React.useState('');
  const [view,setView]=React.useState('grid');
  const [notice,setNotice]=React.useState('');
  const [source,setSource]=React.useState('local');
  const [busy,setBusy]=React.useState(false);
  const [history,setHistory]=React.useState([]);
  const refresh=React.useCallback(async()=>{
    try {
      const response=await fetch(API+'/api/beds',{signal:AbortSignal.timeout(3500)});
      if(!response.ok) throw Error('Connection failed');
      const result=await response.json();
      if(!Array.isArray(result)) throw Error('Invalid response');
      setBeds(result.map(b=>({...b,reference:''})));
      setSource('api');
      setNotice('');
    } catch {
      setSource('local');
    }
  },[]);
  React.useEffect(()=>{refresh();},[refresh]);
  React.useEffect(()=>{if(source==='local'){try{localStorage.setItem(STORE,JSON.stringify(beds));}catch{}}},[beds,source]);
  const counts=Object.fromEntries(Object.keys(statuses).map(s=>[s,beds.filter(b=>b.status===s).length]));
  const occupancy=beds.length?Math.round(counts.occupied/beds.length*100):0;
  const departments=[...new Set(beds.map(b=>b.departmentName))];
  const shown=beds.filter(b=>(department==='الكل'||b.departmentName===department)&&(filter==='all'||b.status===filter));
  const current=selected?beds.find(b=>b.id===selected):null;
  const operations={available:[['حجز','reserved'],['تسجيل دخول','occupied'],['صيانة','maintenance']],reserved:[['تسجيل دخول','occupied'],['إلغاء الحجز','available']],occupied:[['تسجيل خروج','cleaning']],cleaning:[['جاهز للاستخدام','available']],maintenance:[['إنهاء الصيانة','available']]};
  function changeStatus(status){
    if(!current||busy)return;
    if(source==='api'){setNotice('تغيير الحالة عبر السيرفر يتطلب تفعيل صلاحيات المستخدم.');return;}
    if(!operations[current.status]?.some(([,s])=>s===status))return;
    const needsReference=['reserved','occupied'].includes(status)&&!current.reference;
    if(needsReference&&!/^[A-Za-z0-9_-]{3,32}$/.test(reference.trim())){setNotice('أدخل رقم مرجع من 3 إلى 32 حرفاً أو رقماً.');return;}
    setBusy(true);
    const nextRef=status==='reserved'||status==='occupied'?(current.reference||reference.trim()):'';
    setBeds(previous=>previous.map(b=>b.id===current.id?{...b,status,reference:nextRef}:b));
    setHistory(previous=>[{bed:current.label,room:current.roomName,from:current.status,to:status,time:new Date().toLocaleTimeString('ar-SA')},...previous].slice(0,8));
    setSelected(null);setReference('');setNotice('تم تحديث حالة السرير بنجاح.');setBusy(false);
  }
  function exportCSV(){
    const rows=[['Bed','Room','Department','Status','Reference'],...beds.map(b=>[b.label,b.roomName,b.departmentName,b.status,b.reference||''])];
    const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='hospital-beds.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-icon">✚</span><div><strong>إدارة الأسرة</strong><small>Bed Management System</small></div></div><nav><a className="nav-active" href="#dashboard">▦ <span>لوحة التحكم</span></a><a href="#beds">▤ <span>إدارة الأسرة</span></a><a href="#activity">◷ <span>سجل العمليات</span></a></nav><div className="side-foot">نظام إدارة الطاقة الاستيعابية</div></aside>
    <main className="main" id="dashboard">
      <header className="topbar"><div><p className="eyebrow">HOSPITAL OPERATIONS</p><h1>لوحة إدارة الأسرة</h1><p className="subtle">متابعة الطاقة الاستيعابية وحالة الأسرة حسب الأقسام</p></div><div className="header-actions"><span className="live"><i/> حالة النظام نشطة</span><button className="button outline" onClick={()=>{setNotice('');refresh();}}>↻ تحديث</button></div></header>
      <section className="stats">
        {[['إجمالي الأسرة',beds.length,'total'],['أسرة متاحة',counts.available,'available'],['أسرة مشغولة',counts.occupied,'occupied'],['أسرة محجوزة',counts.reserved,'reserved'],['قيد التنظيف',counts.cleaning,'cleaning'],['الصيانة',counts.maintenance,'maintenance']].map(([title,value,key])=><article className={'stat '+key} key={key}><span>{title}</span><strong>{value}</strong><small>{key==='total'?'إجمالي الطاقة الاستيعابية':statuses[key]?.label}</small></article>)}
      </section>
      <section className="overview"><div><h2>معدل الإشغال</h2><p className="subtle">نسبة الأسرة المشغولة من إجمالي الأسرة</p><div className="meter"><span style={{width:occupancy+'%'}}/></div></div><strong>{occupancy}%</strong></section>
      <section className="workspace" id="beds"><div className="workspace-head"><div><h2>خريطة الأسرة</h2><p className="subtle">اختر القسم ثم اضغط على أي سرير لعرض تفاصيله</p></div><div className="view-toggle"><button className={view==='grid'?'active':''} onClick={()=>setView('grid')}>▦ بطاقات</button><button className={view==='table'?'active':''} onClick={()=>setView('table')}>☷ جدول</button></div></div>
        <div className="tabs">{['الكل',...departments].map(d=><button key={d} className={department===d?'active':''} onClick={()=>setDepartment(d)}>{d==='الكل'?'جميع الأقسام':d}</button>)}</div>
        <div className="filterline"><span>{shown.length} سرير</span><label>الحالة <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">جميع الحالات</option>{Object.entries(statuses).map(([key,s])=><option value={key} key={key}>{s.label}</option>)}</select></label><button className="button outline" onClick={exportCSV}>↓ تصدير CSV</button>{source==='local'&&<button className="button outline" onClick={()=>{if(window.confirm('إعادة ضبط بيانات الأسرة؟')){setBeds(seed());setHistory([]);setNotice('تمت إعادة ضبط البيانات.');}}}>↺ إعادة ضبط</button>}</div>
        {view==='grid'?<div className="bed-grid">{shown.map(b=><button className={'bed-card '+b.status} key={b.id} onClick={()=>{setSelected(b.id);setReference('');setNotice('');}}><span className="bed-top"><b>سرير {b.label}</b><span className="bed-icon">{statuses[b.status]?.icon}</span></span><span className="bed-room">غرفة {b.roomName}</span><span className="bed-bottom"><span className="dot"/> {statuses[b.status]?.label||b.status}</span></button>)}</div>:<div className="table-scroll"><table><thead><tr><th>السرير</th><th>القسم</th><th>الغرفة</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody>{shown.map(b=><tr key={b.id}><td>{b.label}</td><td>{b.departmentName}</td><td>{b.roomName}</td><td><span className={'chip '+b.status}>{statuses[b.status]?.label}</span></td><td><button className="text-button" onClick={()=>setSelected(b.id)}>عرض</button></td></tr>)}</tbody></table></div>}
        {!shown.length&&<p className="empty">لا توجد أسرة مطابقة للفلاتر المحددة.</p>}
        <div className="legend">{Object.entries(statuses).map(([key,s])=><span key={key}><i className={'legend-dot '+key}/>{s.label}</span>)}</div>
      </section>
      <section className="activity" id="activity"><h2>آخر العمليات</h2>{history.length?<ul>{history.map((h,i)=><li key={i}>سرير {h.bed} — غرفة {h.room}: {statuses[h.from]?.label} ← {statuses[h.to]?.label} <small>{h.time}</small></li>)}</ul>:<p className="subtle">ستظهر هنا آخر تغييرات حالة الأسرة.</p>}</section>
      {notice&&<div className="toast" role="status">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
    </main>
    {current&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><section className="modal" role="dialog" aria-modal="true" aria-label="تفاصيل السرير" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>تفاصيل السرير {current.label}</h2><button className="close" onClick={()=>setSelected(null)}>×</button></div><div className="detail"><span>القسم</span><b>{current.departmentName}</b><span>الغرفة</span><b>{current.roomName}</b><span>الحالة</span><b><span className={'chip '+current.status}>{statuses[current.status]?.label}</span></b>{current.reference&&<><span>رقم المرجع</span><b>{current.reference}</b></>}</div>{source==='local'&&['available','reserved'].includes(current.status)&&!current.reference&&<label className="ref-field">رقم المرجع<input value={reference} maxLength={32} onChange={e=>setReference(e.target.value)} placeholder="REF-1001"/></label>}<div className="modal-actions">{operations[current.status]?.map(([label,status])=><button className="button" disabled={busy||source==='api'} key={label} onClick={()=>changeStatus(status)}>{label}</button>)}</div>{source==='api'&&<p className="subtle">تعديل حالات الأسرة يتطلب تسجيل الدخول والصلاحيات.</p>}</section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
