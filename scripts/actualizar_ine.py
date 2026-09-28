#!/usr/bin/env python3
"""Descarga del INE los precios (IPC, base 2025, ECOICOP ver.2) y los salarios (ETCL) y genera los JSON de la web.

Uso: python3 scripts/actualizar_ine.py [--salida site/data]

Tablas (API Tempus3 del INE):
  76125  IPC. Índices nacionales: general y de grupos ECOICOP ver.2 (series desde 2002)
  76136  IPC. Índices por comunidades autónomas: general y de grupos
  76128  IPC. Índices nacionales de subclases ECOICOP ver.2 (196 productos y servicios)
  6061   ETCL. Coste laboral por trabajador, comunidad autónoma y sector (trimestral, desde 2008)
Imprime por salida estándar una línea por cada fuente que trae un periodo nuevo.
"""
import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

API = "https://servicios.ine.es/wstempus/js/ES"
UA = {"User-Agent": "tu-bolsillo/1.0 (+https://github.com/pedri77/tu-bolsillo)"}
DESDE_PRODUCTOS = "2017-01"
CCAA = {  # nombre en el INE -> (código, nombre corto)
    "Andalucía": ("01", "Andalucía"), "Aragón": ("02", "Aragón"), "Asturias, Principado de": ("03", "Asturias"),
    "Balears, Illes": ("04", "Illes Balears"), "Canarias": ("05", "Canarias"), "Cantabria": ("06", "Cantabria"),
    "Castilla y León": ("07", "Castilla y León"), "Castilla - La Mancha": ("08", "Castilla-La Mancha"),
    "Cataluña": ("09", "Cataluña"), "Comunitat Valenciana": ("10", "C. Valenciana"), "Extremadura": ("11", "Extremadura"),
    "Galicia": ("12", "Galicia"), "Madrid, Comunidad de": ("13", "Madrid"), "Murcia, Región de": ("14", "Región de Murcia"),
    "Navarra, Comunidad Foral de": ("15", "Navarra"), "País Vasco": ("16", "País Vasco"), "Rioja, La": ("17", "La Rioja"),
    "Ceuta": ("18", "Ceuta"), "Melilla": ("19", "Melilla"),
}


def get(path: str, intentos: int = 4):
    for i in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{API}/{path}", headers=UA), timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if i == intentos - 1:
                raise
            print(f"reintento {path}: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))


def mensual(serie) -> list[tuple[str, float]]:
    """[(AAAA-MM, valor)] ordenado; FK_Periodo 1-12 es el mes."""
    out = [(f"{d['Anyo']}-{d['FK_Periodo']:02d}", d["Valor"]) for d in serie["Data"] if d["Valor"] is not None and 1 <= d["FK_Periodo"] <= 12]
    return sorted(out)


def trimestral(serie) -> list[tuple[str, float]]:
    """[(AAAATn, valor)]; en la ETCL FK_Periodo 19-22 son los trimestres 1-4."""
    out = [(f"{d['Anyo']}T{d['FK_Periodo'] - 18}", d["Valor"]) for d in serie["Data"] if d["Valor"] is not None and 19 <= d["FK_Periodo"] <= 22]
    return sorted(out)


def compacta(puntos: list[tuple[str, float]], desde: str | None = None) -> dict:
    """{"inicio": periodo, "v": [valores consecutivos]} (sin huecos en las series del INE)."""
    p = [x for x in puntos if desde is None or x[0] >= desde]
    return {"inicio": p[0][0], "v": [round(v, 3) for _, v in p]} if p else {"inicio": None, "v": []}


def indices(tabla: int) -> list[dict]:
    return [s for s in get(f"DATOS_TABLA/{tabla}?nult=400") if s["Nombre"].strip().endswith("Índice.")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", default="site/data")
    a = ap.parse_args()
    out = Path(a.salida)
    out.mkdir(parents=True, exist_ok=True)
    previo = {}
    if (out / "ipc.json").exists():
        previo = {"ipc": json.loads((out / "ipc.json").read_text())["ultimo"]}
    if (out / "salarios.json").exists():
        previo["salarios"] = json.loads((out / "salarios.json").read_text())["ultimo"]

    # ---- IPC general y grupos (nacional)
    nac = indices(76125)
    general = next(s for s in nac if s["Nombre"].startswith("Nacional. Índice general."))
    gen = mensual(general)
    grupos = []
    for s in nac:
        nombre = s["Nombre"].split(". ")[1].strip()
        if nombre == "Índice general":
            continue
        grupos.append({"nombre": nombre, **compacta(mensual(s), "2002-01")})

    # ---- IPC por comunidad autónoma (índice general)
    ccaa_ipc = {}
    for s in indices(76136):
        partes = s["Nombre"].split(". ")
        if len(partes) >= 2 and partes[1].strip() == "Índice general" and partes[0] in CCAA:
            cod, corto = CCAA[partes[0]]
            ccaa_ipc[cod] = {"nombre": corto, **compacta(mensual(s), "2002-01")}

    # ---- Subclases (productos y servicios) con su código ECOICOP ver.2
    norm = lambda t: " ".join(t.lower().replace(",", " ").split())
    codigos = {norm(v["Nombre"]): v["Codigo"] for v in get("VALORES_VARIABLEOPERACION/765/IPC") if "." in v["Codigo"]}
    nombres_grupo = {f"{i:02d}": g["nombre"] for i, g in enumerate(grupos, 1)}
    productos, sin_codigo = [], []
    for s in indices(76128):
        nombre = s["Nombre"].split(". ")[1].strip()
        if nombre == "Índice general":
            continue
        cod = codigos.get(norm(nombre))
        if not cod:
            sin_codigo.append(nombre)
        serie = compacta(mensual(s), DESDE_PRODUCTOS)
        if not serie["v"]:
            continue
        # la tabla sigue el orden de la clasificación: sin código, se hereda el grupo del producto anterior
        grupo = cod[:2] if cod else (productos[-1]["grupo"] if productos else None)
        productos.append({"nombre": " ".join(nombre.split()), "codigo": cod, "grupo": grupo, **serie})
    if sin_codigo:
        print(f"aviso: {len(sin_codigo)} subclases sin código ECOICOP: {sin_codigo[:5]}", file=sys.stderr)

    ultimo_ipc = gen[-1][0]
    (out / "ipc.json").write_text(json.dumps({
        "fuente": "INE, Índice de Precios de Consumo (base 2025). Tablas 76125 y 76136.",
        "ultimo": ultimo_ipc,
        "general": compacta(gen),
        "grupos": grupos,
        "ccaa": ccaa_ipc,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "productos.json").write_text(json.dumps({
        "fuente": "INE, Índice de Precios de Consumo por subclases ECOICOP ver.2 (base 2025). Tabla 76128.",
        "ultimo": ultimo_ipc,
        "grupos": nombres_grupo,
        "productos": productos,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # ---- Salarios: coste salarial total por trabajador y mes (ETCL), industria, construcción y servicios
    sal = {}
    for s in get("DATOS_TABLA/6061?nult=80"):
        n = s["Nombre"]
        if "Coste salarial total" not in n or "Industria, construcción y servicios" not in n:
            continue
        territorio = n.split(". ")[0]
        if territorio == "Total Nacional":
            sal["00"] = {"nombre": "España", **compacta(trimestral(s))}
        elif territorio in CCAA:
            cod, corto = CCAA[territorio]
            sal[cod] = {"nombre": corto, **compacta(trimestral(s))}
    ultimo_sal = None
    if "00" in sal:
        ini, n = sal["00"]["inicio"], len(sal["00"]["v"])
        y, q = int(ini[:4]), int(ini[-1])
        q += n - 1
        ultimo_sal = f"{y + (q - 1) // 4}T{(q - 1) % 4 + 1}"
    (out / "salarios.json").write_text(json.dumps({
        "fuente": "INE, Encuesta Trimestral de Coste Laboral (ETCL). Coste salarial total por trabajador y mes, industria, construcción y servicios. Tabla 6061.",
        "ultimo": ultimo_sal,
        "territorios": sal,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    if previo.get("ipc") != ultimo_ipc:
        print(f"IPC: nuevo dato de {ultimo_ipc}")
    if previo.get("salarios") != ultimo_sal:
        print(f"Salarios (ETCL): nuevo dato de {ultimo_sal}")
    print(f"ok: IPC hasta {ultimo_ipc}, {len(productos)} productos, {len(ccaa_ipc)} CCAA; salarios hasta {ultimo_sal}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
