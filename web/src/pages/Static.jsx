import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty } from '../components/common.jsx';
import { ReportModal } from '../components/TrackActions.jsx';

export function Legal() {
  return (
    <div className="page narrow prose">
      <h1 className="page-title">الخصوصية والشروط وحقوق المحتوى</h1>

      <h2>حقوق المحتوى</h2>
      <p>
        كل أغنية منشورة على Darwish Music Studio لازم تكون إما عمل أصلي تملك المنصة حقوقه، أو محتوى حصلنا على ترخيص
        مناسب لنشره. أي محتوى لسه حقوقه قيد المراجعة بيفضل مخفي لحد ما تكتمل الموافقات، وأي محتوى ينتهي ترخيصه بيختفي
        تلقائيًا.
      </p>
      <p>
        لو إنت صاحب حقوق وشايف إن فيه محتوى منشور من غير إذنك، ابعتلنا من <Link to="/report">صفحة الإبلاغ</Link> واختار
        "حقوق ملكية / طلب إزالة"، وهنوقف المحتوى لحد ما نراجع الطلب.
      </p>

      <h2>البيانات اللي بنحفظها</h2>
      <ul>
        <li>بيانات الحساب: البريد الإلكتروني والاسم وكلمة مرور مشفرة.</li>
        <li>سجل الاستماع (لو مفعّل): الأغاني اللي سمعتها ومدة الاستماع، عشان "ذكرياتي" والاقتراحات.</li>
        <li>المفضلة وقوائم التشغيل.</li>
        <li>بيانات تشغيل مجمعة بدون هوية (عدد مرات الاستماع، أخطاء التشغيل، نوع الجهاز) لتحسين الخدمة.</li>
        <li>حالة التشغيل اللحظية (إنت أونلاين وبتسمع إيه دلوقتي) بتتحفظ في الذاكرة بس لحد دقيقة بعد ما تقفل، ومش بتتسجل.</li>
      </ul>
      <p>
        تقدر توقف سجل الاستماع أو تمسحه في أي وقت من <Link to="/settings">الإعدادات</Link>. مش بنبيع بياناتك ولا بنشاركها
        مع إعلانات.
      </p>

      <h2>شروط الاستخدام</h2>
      <ul>
        <li>المحتوى متاح للاستماع الشخصي. التنزيل متاح بس للأغاني اللي ترخيصها بيسمح بكده.</li>
        <li>ممنوع إعادة بث أو نشر المحتوى أو محاولة سحبه آليًا.</li>
        <li>طلبات الأغاني والرسائل على المحطات لازم تكون محترمة؛ الإدارة ممكن ترفض أو توقف أي حساب يسيء الاستخدام.</li>
      </ul>
    </div>
  );
}

export function ReportPage() {
  const [open, setOpen] = useState(true);
  return (
    <div className="page narrow">
      <h1 className="page-title">إبلاغ عن مشكلة</h1>
      <p className="muted">مشكلة في التشغيل، بيانات غلط، طلب إزالة محتوى، أو نسيت كلمة المرور؟ ابعتلنا.</p>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        فتح نموذج البلاغ
      </button>
      {open ? <ReportModal track={null} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export function NotFound() {
  return (
    <Empty icon="search" title="الصفحة دي مش موجودة">
      <Link to="/">ارجع للرئيسية</Link>
    </Empty>
  );
}
