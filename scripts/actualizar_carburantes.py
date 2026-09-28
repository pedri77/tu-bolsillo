#!/usr/bin/env python3
"""Precios de carburantes del día (Ministerio para la Transición Ecológica, geoportal de gasolineras).

Uso: python3 scripts/actualizar_carburantes.py [--salida site/data]

Genera carburantes.json (medias y gasolineras más baratas por provincia) y añade una línea por día a
carburantes_historico.csv (media nacional y por provincia), que la web usa para la evolución.
"""
import argparse
import csv
import json
import re
import statistics
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

URL = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/"
UA = {"User-Agent": "tu-bolsillo/1.0 (+https://github.com/pedri77/tu-bolsillo)", "Accept": "application/json"}
COMBUSTIBLES = {"g95": "Precio Gasolina 95 E5", "diesel": "Precio Gasoleo A"}
TOP = 10


def num(s: str | None) -> float | None:
    try:
        return float(s.replace(",", ".")) if s else None
    except ValueError:
        return None


def descargar(intentos: int = 4) -> dict:
    # curl y no urllib: el servidor del Ministerio corta el saludo TLS de las versiones recientes de OpenSSL de Python
    for i in range(intentos):
        r = subprocess.run(["curl", "-sS", "--fail", "--max-time", "240", "-H", f"User-Agent: {UA['User-Agent']}",
                            "-H", "Accept: application/json", URL], capture_output=True)
        if r.returncode == 0:
            return json.loads(r.stdout)
        if i == intentos - 1:
            raise RuntimeError(r.stderr.decode(errors="ignore"))
        print(f"reintento: {r.stderr.decode(errors='ignore').strip()}", file=sys.stderr)
        time.sleep(10 * (i + 1))


def nombre_provincia(s: str) -> str:
    """«PALMAS (LAS)» -> «Las Palmas»; «CORUÑA (A)» -> «A Coruña»."""
    t = s.strip().title()
    if t.endswith(")") and "(" in t:
        base, art = t[:-1].split(" (", 1)
        t = f"{art} {base}"
    return re.sub(r"\s*/\s*", " / ", t.replace(" De ", " de ").replace(" Del ", " del "))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", default="site/data")
    a = ap.parse_args()
    out = Path(a.salida)
    out.mkdir(parents=True, exist_ok=True)

    d = descargar()
    fecha = datetime.strptime(d["Fecha"].split()[0], "%d/%m/%Y").date().isoformat()
    est = d["ListaEESSPrecio"]
    if len(est) < 5000:
        print(f"ERROR: solo {len(est)} estaciones; no se actualiza", file=sys.stderr)
        return 1

    prov = {}
    for e in est:
        p = prov.setdefault(e["IDProvincia"], {"nombre": nombre_provincia(e["Provincia"]), "ccaa": e["IDCCAA"], **{k: [] for k in COMBUSTIBLES}})
        for k, campo in COMBUSTIBLES.items():
            v = num(e.get(campo))
            if v and 0.5 < v < 4:  # descarta precios imposibles
                p[k].append((v, e))

    resumen = {"fecha": fecha, "fuente": "Ministerio para la Transición Ecológica y el Reto Demográfico, precios de carburantes en estaciones de servicio (geoportal).",
               "nacional": {}, "provincias": {}}
    for k in COMBUSTIBLES:
        todos = [v for p in prov.values() for v, _ in p[k]]
        resumen["nacional"][k] = {"media": round(statistics.mean(todos), 3), "mediana": round(statistics.median(todos), 3),
                                  "min": min(todos), "n": len(todos)}
    for pid, p in sorted(prov.items()):
        fila = {"nombre": p["nombre"], "ccaa": p["ccaa"]}
        for k in COMBUSTIBLES:
            vs = p[k]
            if not vs:
                continue
            baratas = sorted(vs, key=lambda x: x[0])[:TOP]
            fila[k] = {"media": round(statistics.mean(v for v, _ in vs), 3), "min": baratas[0][0], "max": max(v for v, _ in vs), "n": len(vs),
                       "baratas": [[v, e["Rótulo"].strip().title(), e["Dirección"].strip().title(), e["Municipio"].strip(),
                                    num(e["Latitud"]), num(e["Longitud (WGS84)"]), e["Horario"].strip()] for v, e in baratas]}
        resumen["provincias"][pid] = fila

    (out / "carburantes.json").write_text(json.dumps(resumen, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # histórico: una fila por fecha (si ya existe la fecha, se reemplaza)
    hist = out / "carburantes_historico.csv"
    cols = ["fecha", "g95_es", "diesel_es"] + [f"{k}_{pid}" for pid in sorted(prov) for k in COMBUSTIBLES]
    filas = []
    if hist.exists():
        with hist.open(encoding="utf-8") as f:
            filas = [r for r in csv.DictReader(f) if r["fecha"] != fecha]
    nueva = {"fecha": fecha, "g95_es": resumen["nacional"]["g95"]["media"], "diesel_es": resumen["nacional"]["diesel"]["media"]}
    for pid, fila in resumen["provincias"].items():
        for k in COMBUSTIBLES:
            if k in fila:
                nueva[f"{k}_{pid}"] = fila[k]["media"]
    filas.append(nueva)
    filas.sort(key=lambda r: r["fecha"])
    with hist.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(filas)
    print(f"ok: carburantes {fecha}, {len(est)} estaciones, gasolina 95 {nueva['g95_es']} €/l, gasóleo {nueva['diesel_es']} €/l", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
