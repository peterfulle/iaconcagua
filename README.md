# 🏠 Agente Inmobiliario Aconcagua para WhatsApp

Asesora comercial **100% AI** que atiende por WhatsApp (incluyendo grupos), consulta **en vivo** los proyectos y precios de [iaconcagua.com](https://www.iaconcagua.com), convierte de **UF a pesos** con el valor del día y responde **simulando ser una persona real**.

- **Cerebro:** Claude (`claude-opus-4-8`) con *tool use* + thinking adaptivo.
- **WhatsApp:** [Baileys](https://github.com/WhiskeySockets/Baileys) (vinculación por QR, como WhatsApp Web).
- **Cotizador en vivo:** Playwright + stealth entra a iaconcagua.com como un humano (pasa el anti-bot de Cloudflare), lee proyectos/precios en UF y los convierte a CLP con [mindicador.cl](https://mindicador.cl).
- **Toque humano:** marca "leído", muestra "escribiendo…", agrega delays proporcionales y trocea mensajes largos.

---

## ⚠️ Léelo antes de usar

1. **Rota tu API key de Anthropic.** La que venía en `.env` fue compartida en texto plano; genera una nueva en <https://console.anthropic.com> y reemplázala.
2. **Automatizar WhatsApp va contra los Términos de Servicio de WhatsApp** y puede llevar al **baneo del número**. Usa un **número secundario**, nunca tu WhatsApp personal.
3. iaconcagua.com está protegido por **Cloudflare**. Si en tu servidor el modo headless es bloqueado, usa `HEADLESS=false`.

---

## 🚀 Instalación

Requiere **Node 20+**.

```bash
npm install          # instala deps + descarga Chromium de Playwright
cp .env.example .env # y completa ANTHROPIC_API_KEY
```

## ▶️ Uso

```bash
npm start
```

La primera vez muestra un **código QR** en la terminal: en tu teléfono ve a
**WhatsApp → Dispositivos vinculados → Vincular un dispositivo** y escanéalo.
Al conectar, el agente queda en línea. La sesión se guarda en `auth_wa/`
(no hace falta re-escanear cada vez).

## 🧪 Pruebas rápidas (sin WhatsApp)

```bash
npm run test:uf        # valor UF del día + conversión de ejemplo
npm run test:scraper   # lee el catálogo y una ficha de iaconcagua.com (verifica Cloudflare)
node scripts/test-scraper.js parque-quilicura   # probar un proyecto puntual
```

Si `test:scraper` falla por Cloudflare, pon `HEADLESS=false` en `.env` y reintenta.

---

## ⚙️ Configuración (`.env`)

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | Tu API key de Anthropic. |
| `MODEL` | Modelo Claude (por defecto `claude-opus-4-8`). |
| `EFFORT` | Esfuerzo de razonamiento: `low`/`medium`/`high`/`xhigh`/`max`. |
| `AGENT_NAME` | Nombre de la asesora (por defecto *Valentina*). |
| `HEADLESS` | `true`/`false`. Navegador visible = más confiable contra Cloudflare. |
| `GROUP_MODE` | `mention` (responde si la mencionan o hay palabra gatillo) o `always`. |
| `GROUP_TRIGGERS` | Palabras que activan al bot en grupos. |
| `ALLOWED_GROUPS` | IDs de grupos permitidos (vacío = todos). |
| `TYPING_*` | Ajustes de la simulación de escritura humana. |

---

## 🧩 Arquitectura

```
src/
├── index.js              Orquestador: WhatsApp ↔ agente, reglas de grupo, cola por chat
├── config.js             Carga y valida .env
├── whatsapp.js           Baileys: QR, conexión, entrada de mensajes, presencia humana
├── agent.js              Loop de Claude con tool use + memoria por chat (la "asesora")
├── humanize.js           Delays de escritura y troceo de mensajes
├── tools/
│   ├── index.js          Definiciones de tools + ejecutores
│   └── uf.js             Valor UF del día (mindicador.cl) y conversión a CLP
└── scraper/
    ├── browser.js        Playwright + stealth + espera de Cloudflare (contexto persistente)
    └── iaconcagua.js     Catálogo /proyectos, ficha de proyecto y navegación libre
```

### Herramientas que usa el agente
- `listar_proyectos` — catálogo en vivo de iaconcagua.com.
- `ver_proyecto` — abre una ficha y devuelve su texto (precios UF, tipologías, ubicación).
- `valor_uf` — valor UF del día en CLP.
- `cotizar` — convierte UF → CLP.
- `navegar_sitio` — abre cualquier otra ruta del sitio.

El agente **nunca inventa** precios: siempre los toma del sitio en tiempo real.

---

## 📝 Notas
- La memoria de conversación es en RAM (se pierde al reiniciar). Para producción, persístela en una BD.
- El cotizador cachea catálogo y fichas ~15 min para no reabrir el navegador en cada mensaje.
- Costos: cada mensaje puede gatillar varias llamadas a Claude (tool use). Considera `MODEL=claude-sonnet-5` si el volumen es alto.
