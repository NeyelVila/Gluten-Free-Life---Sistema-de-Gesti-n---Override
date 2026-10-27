import Dexie, { type Table } from 'dexie';
import type { Producto, VentaPendiente } from './types';

class GflDB extends Dexie {
  productos!: Table<Producto, number>;
  ventasPendientes!: Table<VentaPendiente, string>;
  meta!: Table<{ key: string; value: any }, string>;
  constructor() {
    super('gluten-free-life');
    this.version(1).stores({
      productos: 'id_producto, nombre, codigo_barra, categoria',
      ventasPendientes: 'uuid_cliente, fecha_hora',
      meta: 'key',
    });
  }
}

export const localdb = new GflDB();

export const getMeta = async <T = any>(key: string): Promise<T | undefined> => (await localdb.meta.get(key))?.value;
export const setMeta = (key: string, value: any) => localdb.meta.put({ key, value });
