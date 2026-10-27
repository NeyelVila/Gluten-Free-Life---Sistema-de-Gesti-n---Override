import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Badge, Spinner, cx } from '../components/ui';
import { errMsg, post } from '../lib/api';
import { money } from '../lib/format';
import { refrescarCache } from '../lib/sync';
import { toast } from '../store/stores';

interface Fila { codigo: any; producto: any; categoria: any; precio: any; modalidad: any; costo?: any; stock?: any; stock_minimo?: any }
interface Validacion {
  total: number;
  correctos: { fila: number; codigo: string; producto: string; categoria: string; precio: number; modalidad: string; accion: 'crear' | 'actualizar' }[];
  errores: { fila: number; codigo: string; producto: string; errores: string[] }[];
}
interface Resultado { importados: number; creados: number; actualizados: number; con_errores: number }

const norm = (s: string) => s.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const ALIAS: Record<keyof Fila, string[]> = {
  codigo: ['codigo', 'cod', 'codigodebarras', 'codigobarra', 'ean', 'sku'],
  producto: ['producto', 'nombre', 'descripcion', 'articulo'],
  categoria: ['categoria', 'rubro', 'familia'],
  precio: ['precio', 'preciodeventa', 'precioventa', 'pvp'],
  modalidad: ['modalidad', 'tipo', 'tipodeventa', 'unidad'],
  costo: ['costo', 'preciodecosto', 'preciocosto'],
  stock: ['stock', 'stockactual', 'existencia'],
  stock_minimo: ['stockminimo', 'minimo'],
};

export default function Importar() {
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [val, setVal] = useState<Validacion | null>(null);
  const [busy, setBusy] = useState<'leer' | 'importar' | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [faltan, setFaltan] = useState<string[]>([]);

  async function leer(file: File) {
    setRes(null); setVal(null); setFaltan([]);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return toast.error('Formato no soportado', 'Subí un archivo .xlsx o .csv');
    if (file.size > 5 * 1024 * 1024) return toast.error('El archivo es muy grande', 'El máximo es 5 MB.');
    setBusy('leer');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: true });
      if (!raw.length) throw new Error('El archivo no tiene filas de datos.');
      const mapa: Partial<Record<keyof Fila, string>> = {};
      for (const col of Object.keys(raw[0])) {
        for (const [campo, alias] of Object.entries(ALIAS)) if (!mapa[campo as keyof Fila] && alias.includes(norm(col))) mapa[campo as keyof Fila] = col;
      }
      const req: (keyof Fila)[] = ['codigo', 'producto', 'categoria', 'precio', 'modalidad'];
      const falta = req.filter((k) => !mapa[k]);
      if (falta.length) { setFaltan(falta); throw new Error(`Faltan columnas obligatorias: ${falta.join(', ')}.`); }
      const f: Fila[] = raw.map((r) => {
        const o: any = {};
        (Object.keys(ALIAS) as (keyof Fila)[]).forEach((k) => { if (mapa[k]) o[k] = r[mapa[k]!]; });
        return o;
      });
      setArchivo(file.name); setFilas(f);
      setVal(await post<Validacion>('/importacion/validar', { filas: f }));
    } catch (e) {
      setArchivo(null); setFilas([]);
      toast.error('No se pudo leer el archivo', errMsg(e));
    } finally { setBusy(null); }
  }

  async function importar() {
    setBusy('importar');
    try {
      const r = await post<Resultado>('/importacion/confirmar', { filas });
      setRes(r);
      refrescarCache(true).catch(() => undefined);
    } catch (e) { toast.error('No se pudo importar', errMsg(e)); } finally { setBusy(null); }
  }

  function plantilla() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Código', 'Producto', 'Categoría', 'Precio', 'Modalidad', 'Costo', 'Stock', 'Stock mínimo'],
      ['7790001000011', 'Almendras', 'Frutos secos', 8500, 'Granel', 6000, 4.2, 2],
      ['7790001000073', 'Harina de arroz', 'Harinas', 2100, 'Unidad', 1500, 14, 4],
    ]);
    ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catálogo');
    XLSX.writeFile(wb, 'plantilla-catalogo.xlsx');
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <button className="btn btn-sm btn-ghost" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4" /> Volver</button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Importar catálogo desde Excel</h1>
          <p className="text-ink-500">Columnas: Código, Producto, Categoría, Precio, Modalidad (Unidad o Granel). Opcionales: Costo, Stock, Stock mínimo.</p>
        </div>
        <button className="btn btn-md btn-secondary" onClick={plantilla}><Download className="h-5 w-5" /> Descargar plantilla de ejemplo</button>
      </div>

      {res ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 className="h-16 w-16 text-brand-600" />
          <h2 className="text-2xl font-extrabold">✅ Importación completada</h2>
          <p className="text-lg"><b>{res.importados}</b> producto(s) importados: {res.creados} nuevos y {res.actualizados} actualizados.{res.con_errores > 0 && <> {res.con_errores} fila(s) con errores no se importaron.</>}</p>
          <div className="mt-2 flex gap-3"><button className="btn btn-md btn-secondary" onClick={() => { setRes(null); setVal(null); setArchivo(null); setFilas([]); }}>Importar otro archivo</button><button className="btn btn-md btn-primary" onClick={() => nav('/inventario')}>Ver inventario</button></div>
        </div>
      ) : (
        <>
          <div
            className={cx('card grid cursor-pointer place-items-center gap-2 border-2 border-dashed px-6 py-12 text-center transition', drag ? 'border-brand-500 bg-brand-50' : 'border-brand-300 hover:bg-brand-50/50')}
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) leer(f); }}
            role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          >
            {busy === 'leer' ? <Spinner className="h-10 w-10 text-brand-600" /> : <UploadCloud className="h-12 w-12 text-brand-500" />}
            <p className="text-xl font-bold">Arrastrá tu archivo Excel aquí</p>
            <p className="text-ink-500">o</p>
            <span className="btn btn-md btn-primary"><FileSpreadsheet className="h-5 w-5" /> Seleccionar archivo</span>
            {archivo && <p className="mt-2 text-sm font-semibold text-brand-800">Archivo: {archivo}</p>}
            <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
          </div>
          {faltan.length > 0 && <p className="rounded-xl bg-peligro-50 p-3 text-sm font-semibold text-peligro-700">Revisá los encabezados del archivo. Faltan: {faltan.join(', ')}.</p>}

          {val && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="ok" className="!px-4 !py-1.5 !text-base">🟢 {val.correctos.length} producto(s) correctos</Badge>
                <Badge tone={val.errores.length ? 'crit' : 'mute'} className="!px-4 !py-1.5 !text-base">🔴 {val.errores.length} con errores</Badge>
              </div>

              {val.errores.length > 0 && (
                <section className="card overflow-x-auto border-peligro-100">
                  <h2 className="px-5 pt-4 text-lg font-bold text-peligro-700">Errores a corregir</h2>
                  <table className="mt-2 w-full text-[15px]">
                    <thead><tr><th className="th">Fila</th><th className="th">Código</th><th className="th">Producto</th><th className="th">Problema</th></tr></thead>
                    <tbody>{val.errores.map((e) => <tr key={e.fila} className="bg-peligro-50/50"><td className="td font-bold">{e.fila}</td><td className="td font-mono text-sm">{e.codigo || '—'}</td><td className="td">{e.producto || '—'}</td><td className="td text-peligro-700">{e.errores.join(' · ')}</td></tr>)}</tbody>
                  </table>
                </section>
              )}

              {val.correctos.length > 0 && (
                <section className="card overflow-x-auto">
                  <h2 className="px-5 pt-4 text-lg font-bold">Vista previa</h2>
                  <table className="mt-2 w-full text-[15px]">
                    <thead><tr><th className="th">Código</th><th className="th">Producto</th><th className="th">Categoría</th><th className="th !text-right">Precio</th><th className="th">Modalidad</th><th className="th">Acción</th></tr></thead>
                    <tbody>{val.correctos.slice(0, 100).map((p) => <tr key={p.fila}><td className="td font-mono text-sm">{p.codigo}</td><td className="td font-bold">{p.producto}</td><td className="td text-ink-500">{p.categoria}</td><td className="td text-right">{money(p.precio)}</td><td className="td">{p.modalidad === 'GRANEL' ? 'Granel' : 'Unidad'}</td><td className="td"><Badge tone={p.accion === 'crear' ? 'ok' : 'info'}>{p.accion === 'crear' ? 'Nuevo' : 'Actualiza'}</Badge></td></tr>)}</tbody>
                  </table>
                  {val.correctos.length > 100 && <p className="px-5 pb-3 text-sm text-ink-500">Mostrando los primeros 100 de {val.correctos.length}.</p>}
                </section>
              )}

              <button className="btn btn-lg btn-primary" disabled={!val.correctos.length || busy === 'importar'} onClick={importar}>
                {busy === 'importar' ? <Spinner /> : <CheckCircle2 className="h-5 w-5" />} Importar catálogo{val.errores.length > 0 && ' (solo las filas correctas)'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
