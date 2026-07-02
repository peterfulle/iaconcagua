import { listarProyectos, verProyecto, navegar } from '../scraper/iaconcagua.js';
import { valorUF, ufAClp } from './uf.js';

// Definiciones que ve Claude (function calling).
export const toolDefs = [
  {
    name: 'listar_proyectos',
    description:
      'Devuelve el catálogo COMPLETO y en vivo de proyectos inmobiliarios publicados en iaconcagua.com (nombre + slug). Úsalo cuando el cliente pregunta qué proyectos hay, en qué ciudades/comunas, o para encontrar el slug de un proyecto antes de ver su detalle.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ver_proyecto',
    description:
      'Abre en vivo la ficha de un proyecto de iaconcagua.com y devuelve su texto (precios en UF, tipologías, dormitorios, ubicación, estado de venta). Usa el "slug" del catálogo (ej: "parque-quilicura") o una URL completa. Úsalo siempre antes de dar precios o cotizar: los datos deben venir del sitio, nunca inventados.',
    input_schema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Slug del proyecto (ej: parque-quilicura) o URL completa de la ficha.',
        },
      },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'valor_uf',
    description:
      'Devuelve el valor oficial de la UF de hoy en pesos chilenos (CLP). Úsalo para convertir precios UF a pesos al cotizar.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'cotizar',
    description:
      'Convierte un monto en UF a pesos chilenos (CLP) usando el valor UF del día. Úsalo para armar la cotización final una vez que ya tienes el precio en UF desde ver_proyecto.',
    input_schema: {
      type: 'object',
      properties: {
        monto_uf: { type: 'number', description: 'Precio en UF a convertir.' },
      },
      required: ['monto_uf'],
      additionalProperties: false,
    },
  },
  {
    name: 'navegar_sitio',
    description:
      'Abre cualquier otra ruta de iaconcagua.com (artículos, secciones, filtros por ciudad) y devuelve su texto. Úsalo solo si listar_proyectos y ver_proyecto no bastan.',
    input_schema: {
      type: 'object',
      properties: {
        ruta: { type: 'string', description: 'Ruta relativa (ej: /articulos/...) o URL completa.' },
      },
      required: ['ruta'],
      additionalProperties: false,
    },
  },
];

// Ejecutores reales de cada tool. Devuelven texto (string) para el tool_result.
export async function runTool(name, input) {
  try {
    switch (name) {
      case 'listar_proyectos': {
        const p = await listarProyectos();
        if (!p.length) return 'No se pudieron leer proyectos del sitio en este momento.';
        return (
          `Proyectos publicados en iaconcagua.com (${p.length}):\n` +
          p.map((x) => `- ${x.nombre}  [slug: ${x.slug}]`).join('\n')
        );
      }
      case 'ver_proyecto': {
        const d = await verProyecto(input.slug);
        return (
          `Ficha en vivo: ${d.titulo}\nURL: ${d.url}\n` +
          (d.valoresUF.length ? `Valores UF detectados: ${d.valoresUF.join(', ')}\n` : '') +
          `\n--- Contenido de la página ---\n${d.texto}`
        );
      }
      case 'valor_uf': {
        const uf = await valorUF();
        return `Valor UF de hoy (${uf.fecha}): $${Number(uf.valor).toLocaleString('es-CL')} CLP.`;
      }
      case 'cotizar': {
        const uf = await valorUF();
        const clp = ufAClp(input.monto_uf, uf.valor);
        return `UF ${input.monto_uf} = $${clp} CLP (valor UF ${uf.fecha}: $${Number(
          uf.valor
        ).toLocaleString('es-CL')}).`;
      }
      case 'navegar_sitio': {
        const d = await navegar(input.ruta);
        return `${d.titulo}\nURL: ${d.url}\n\n${d.texto}`;
      }
      default:
        return `Herramienta desconocida: ${name}`;
    }
  } catch (err) {
    return `No pude completar "${name}": ${err.message}`;
  }
}
