#!/bin/bash
P="psql "$DATABASE_URL" -P pager=off"
H='Content-Type: application/json'
hr(){ printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }
hr "PASO 1 · Login (POST /api/auth/login)"
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H "$H" -d '{"usuario":"admin","clave":"1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
echo "token JWT obtenido: ${TOKEN:0:28}…"
hr "PASO 2 · Estado inicial en PostgreSQL — Granola Sin TACC (id 8)"
$P -c "select id_producto, nombre, stock_actual, stock_minimo from producto where id_producto=8"
$P -c "select id_vencimiento, fecha_vencimiento, cantidad, estado from vencimiento_producto where id_producto=8 order by fecha_vencimiento"
$P -tc "select 'ventas en la base: '||count(*) from venta"
hr "PASO 3 · POST /api/ventas — 6 unidades, efectivo, recibe \$60.000"
curl -s -X POST localhost:4000/api/ventas -H "$H" -H "Authorization: Bearer $TOKEN" -d '{"canal_pago":"EFECTIVO","monto_recibido":60000,"items":[{"id_producto":8,"cantidad":6}]}' | python3 -c "
import sys,json;d=json.load(sys.stdin);v=d['venta']
print('HTTP 201 · ticket',v['numero_ticket'],'· total',v['total_cobrado'],'· recibido',v['monto_recibido'],'· vuelto',d['vuelto'],'·',v['estado'])
print('alertas_stock_critico:',json.dumps(d['alertas_stock_critico'],ensure_ascii=False))"
hr "PASO 4 · Estado final en PostgreSQL"
$P -c "select id_producto, nombre, stock_actual, stock_minimo from producto where id_producto=8"
$P -c "select id_vencimiento, fecha_vencimiento, cantidad, estado from vencimiento_producto where id_producto=8 order by fecha_vencimiento"
$P -c "select v.numero_ticket, v.total_cobrado, v.canal_pago, v.estado, d.cantidad, d.precio_unit_hist, d.subtotal from venta v join detalle_venta d using(id_venta) order by v.id_venta desc limit 1"
hr "PASO 5 · Caso de error: vender más que el stock (POST /api/ventas, 50 unidades)"
curl -s -w '\nHTTP %{http_code}\n' -X POST localhost:4000/api/ventas -H "$H" -H "Authorization: Bearer $TOKEN" -d '{"canal_pago":"TARJETA","items":[{"id_producto":8,"cantidad":50}]}'
$P -tc "select 'stock de Granola tras el rechazo: '||stock_actual from producto where id_producto=8"
$P -tc "select 'ventas totales en la base: '||count(*) from venta"
