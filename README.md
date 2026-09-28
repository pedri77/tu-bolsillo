# Tu bolsillo

**¿Tu sueldo vale hoy lo mismo que antes?** Calculadora de poder adquisitivo, sueldos frente a precios por comunidad autónoma, los productos que más han subido y la gasolina más barata del día. Con datos oficiales y actualización automática.

Web: https://pedri77.github.io/tu-bolsillo/

## Datos
- **Precios:** INE, Índice de Precios de Consumo, base 2025 (ECOICOP ver.2), con series enlazadas desde 2002. Tablas 76125 (general y grupos), 76136 (comunidades autónomas) y 76128 (196 subclases).
- **Sueldos:** INE, Encuesta Trimestral de Coste Laboral, tabla 6061. Coste salarial total por trabajador y mes en industria, construcción y servicios, desde 2008.
- **Carburantes:** Ministerio para la Transición Ecológica y el Reto Demográfico, geoportal de gasolineras, con precios del día.

## Cómo funciona
- `scripts/actualizar_ine.py` y `scripts/actualizar_carburantes.py` descargan los datos y generan `site/data/*.json`. Solo usan la biblioteca estándar de Python y curl.
- GitHub Actions (`.github/workflows/actualizar.yml`) los ejecuta cada día, guarda los datos (incluido el histórico diario de carburantes) y publica `site/` en GitHub Pages.
- La web es HTML, CSS y JavaScript sin dependencias. Todos los cálculos se hacen en el navegador y no se guarda nada de lo que escribe el usuario.

## Licencia
Código con licencia MIT. Datos: © INE y MITECO, reutilización autorizada citando la fuente.

Parte de la serie «Construido con IA» de [IAcademy](https://iacedemy.com/kit-observatorio?utm_source=github&utm_medium=readme&utm_campaign=construido-con-ia&utm_content=tu-bolsillo).
