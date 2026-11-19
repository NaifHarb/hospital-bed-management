import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const labels = { available:'متاح', occupied:'مشغول', reserved:'محجوز', cleaning:'تحت التنظيف', maintenance:'صيانة' };
const cards = [{ key:'total', title:'إجمالي الأسرة' }, ...Object.entries(labels).map(([key,title]) => ({key,title}))];

function App() {
  const [dashboard, setDashboard] = React.useState(null);
  const [beds, setBeds] = React.useState([]);
  const [departments, setDepartments] = React.useState([]);
  const [department, setDepartment] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [d, b, dep] = await Promise.all([
        fetch(`${API}/api/dashboard`),
        fetch(`${API}/api/beds`),
        fetch(`${API}/api/departments`)
      ]);
      if (![d,b,dep].every(r => r.ok)) throw new Error('تعذر تحميل البيانات من السيرفر');
      setDashboard(await d.json()); setBeds(await b.json()); setDepartments(await dep.json());
    } catch (e) { setError(e.message || 'خطأ في الاتصال'); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const visible = beds.filter(b => !department || b.departmentName === department);
  return <main className="layout">
    <header><div><p className="eyebrow">Hospital Bed Management</p><h1>إدارة الأسرة والطاقة الاستيعابية</h1><p className="muted">لوحة مراقبة تجريبية — بيانات غير حقيقية</p></div><button onClick={refresh} disabled={loading}>{loading?'جارٍ التحديث...':'تحديث البيانات'}</button></header>
    {error && <div role="alert" className="alert">{error} — تأكد من تشغيل API وقاعدة البيانات.</div>}
    <section className="stats" aria-label="إحصائيات الأسرة">{cards.map(({key,title})=><article className="stat" key={key}><span>{title}</span><strong>{dashboard?.[key] ?? '—'}</strong></article>)}</section>
    <section className="panel"><div className="sectionhead"><div><h2>قائمة الأسرة</h2><p className="muted">نسبة الإشغال: {dashboard?.occupancyRate ?? '—'}%</p></div><label>القسم <select value={department} onChange={e=>setDepartment(e.target.value)}><option value="">جميع الأقسام</option>{departments.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select></label></div>
      <div className="tablewrap"><table><thead><tr><th>السرير</th><th>الغرفة</th><th>القسم</th><th>الحالة</th></tr></thead><tbody>{visible.map(b=><tr key={b.id}><td>{b.label}</td><td>{b.roomName}</td><td>{b.departmentName}</td><td><span className={`status ${b.status}`}>{labels[b.status] || b.status}</span></td></tr>)}{!visible.length&&<tr><td colSpan="4" className="empty">{loading?'جارٍ التحميل...':'لا توجد أسرة للعرض'}</td></tr>}</tbody></table></div>
    </section><footer>نسخة أولية للعرض فقط — لا تُدخل بيانات مرضى حقيقية</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
