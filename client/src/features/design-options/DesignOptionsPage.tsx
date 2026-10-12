import { Link, Navigate, useParams } from 'react-router-dom';
import { ErrorMessage, Loading } from '../../components/ui';
import { DESIGN_OPTIONS, OptionSwitcher, useDesignData, type DesignOptionId } from './shared';
import { OptionA, OptionB, OptionC, OptionD, OptionE } from './variants';

const OPTIONS: Record<DesignOptionId, typeof OptionA> = { a: OptionA, b: OptionB, c: OptionC, d: OptionD, e: OptionE };

/** Index of the five design options, each a genuinely different layout over the same data. */
export function DesignOptionsIndex() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Bản nháp để chọn</p>
      <h1 className="mt-2 text-2xl font-semibold">5 phương án giao diện</h1>
      <p className="mt-2 text-sm text-muted">
        Cùng dữ liệu thật 14 ngày, khác bố cục. Xem trên cả máy tính và điện thoại, sau đó chọn một phương án để áp dụng cho toàn
        bộ màn hình nghiệp vụ.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {DESIGN_OPTIONS.map((option) => (
          <li key={option.id}>
            <Link to={`/phuong-an/${option.id}`} className="card block p-5 transition-shadow hover:shadow-md">
              <p className="text-xs font-semibold text-accent">Phương án {option.id.toUpperCase()}</p>
              <p className="mt-1 text-lg font-semibold">{option.name}</p>
              <p className="mt-1 text-sm text-muted">{option.layout}</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-xs text-muted">
        Toàn bộ phương án là mã tự viết, không dùng mẫu hay hình ảnh của bên thứ ba. Phông chữ: Be Vietnam Pro và Playfair Display
        (Google Fonts, giấy phép SIL Open Font License 1.1).
      </p>
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-accent">
        ← Về giao diện hiện tại
      </Link>
    </main>
  );
}

export function DesignOptionPage() {
  const { id } = useParams();
  const option = DESIGN_OPTIONS.find((o) => o.id === id);
  const { data, isLoading, error } = useDesignData();
  if (!option) return <Navigate to="/phuong-an" replace />;
  const Option = OPTIONS[option.id];
  return (
    <>
      <OptionSwitcher current={option.id} />
      <ErrorMessage error={error} />
      {isLoading && <Loading />}
      {data && <Option data={data} />}
    </>
  );
}
