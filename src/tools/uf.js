// Valor de la UF (Unidad de Fomento) del día, desde mindicador.cl (API pública, sin Cloudflare).
let cache = null;

export async function valorUF() {
  if (cache && Date.now() - cache.t < 6 * 60 * 60 * 1000) return cache.v;
  const res = await fetch('https://mindicador.cl/api/uf');
  if (!res.ok) throw new Error(`mindicador.cl respondió ${res.status}`);
  const data = await res.json();
  const serie = data?.serie?.[0];
  const v = {
    valor: serie?.valor,
    fecha: serie?.fecha ? serie.fecha.slice(0, 10) : null,
    unidad: 'CLP',
  };
  cache = { t: Date.now(), v };
  return v;
}

export function ufAClp(montoUF, valorUFClp) {
  const clp = Math.round(Number(montoUF) * Number(valorUFClp));
  return clp.toLocaleString('es-CL');
}
