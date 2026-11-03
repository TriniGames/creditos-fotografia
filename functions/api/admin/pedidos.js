import { resumenPedidos } from '../../../lib/pedidos.js';
import { json, manejar } from '../../../lib/http.js';

export const onRequestGet = ({ env }) => manejar(async () =>
  json(await resumenPedidos(env), 200, { 'Cache-Control': 'no-store' }));
