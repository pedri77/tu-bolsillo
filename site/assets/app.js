// Tu bolsillo: poder adquisitivo con datos oficiales. Todo se calcula en el navegador.
const $ = (s, el = document) => el.querySelector(s);
const nfs = {};
const nf = (d) => (nfs[d] ||= new Intl.NumberFormat("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d, useGrouping: "always" }));
const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? "—" : nf(d).format(v));
const pct = (v, d = 1, signo = true) => (v == null ? "—" : `${signo && v > 0 ? "+" : ""}${fmt(v, d)} %`);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesTxt = (p) => `${MESES[+p.slice(5, 7) - 1]} de ${p.slice(0, 4)}`;
const trimTxt = (p) => `${["primer", "segundo", "tercer", "cuarto"][+p.slice(-1) - 1]} trimestre de ${p.slice(0, 4)}`;
const parseEur = (s) => { const t = String(s || "").replace(/[€\s]/g, "").replace(/\./g, "").replace(",", "."); const v = parseFloat(t); return Number.isFinite(v) && v > 0 ? v : null; };

// ---------- tema ----------
const TKEY = "tb-theme";
try { const t = localStorage.getItem(TKEY); if (t) document.documentElement.dataset.theme = t; } catch {}
$("#themeBtn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem(TKEY, document.documentElement.dataset.theme); } catch {}
});

// ---------- series ----------
function mensual(c) { // {inicio:"AAAA-MM", v:[...]} -> Map periodo->valor
  const m = new Map(); let [y, mo] = c.inicio.split("-").map(Number);
  for (const v of c.v) { m.set(`${y}-${String(mo).padStart(2, "0")}`, v); if (++mo > 12) { mo = 1; y++; } }
  return m;
}
function trimestral(c) {
  const m = new Map(); let y = +c.inicio.slice(0, 4), q = +c.inicio.slice(-1);
  for (const v of c.v) { m.set(`${y}T${q}`, v); if (++q > 4) { q = 1; y++; } }
  return m;
}
const media = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const mediaAnio = (m, anio) => { const v = [...m].filter(([k]) => k.startsWith(String(anio))).map(([, x]) => x); return v.length >= (m.keys().next().value?.includes("T") ? 4 : 12) ? media(v) : null; };
const ultimos = (m, n) => media([...m.values()].slice(-n));

// ---------- gráficos ----------
function lineChart(series, { h = 240, fmtY = (v) => fmt(v), ref = null, labels = null } = {}) {
  // series: [{name, color, pts:[[label, v]...]}] con las mismas etiquetas
  const all = series.flatMap((s) => s.pts.map((p) => p[1])).filter((v) => v != null);
  if (all.length < 2) return `<p class="muted">Sin datos suficientes.</p>`;
  const W = 900, m = { t: 14, r: 14, b: 28, l: 56 };
  let lo = Math.min(...all, ref ?? Infinity), hi = Math.max(...all, ref ?? -Infinity);
  const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  const n = series[0].pts.length;
  const x = (i) => m.l + (i / (n - 1)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (h - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${h}" role="img"><g class="grid">`;
  for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4; s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtY(v)}</text>`; }
  s += `</g>`;
  if (ref != null) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(ref)}" y2="${y(ref)}" stroke="var(--accent-2)" stroke-width="2" stroke-dasharray="5 4"/>`;
  for (const se of series) {
    const d = se.pts.map((p, i) => (p[1] == null ? null : `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`)).filter(Boolean).join(" ");
    s += `<polyline points="${d}" fill="none" stroke="${se.color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    const last = se.pts.map((p, i) => [p, i]).filter(([p]) => p[1] != null).at(-1);
    if (last) s += `<circle cx="${x(last[1])}" cy="${y(last[0][1])}" r="4" fill="${se.color}"><title>${esc(last[0][0])}: ${fmtY(last[0][1])}</title></circle>`;
  }
  const lbl = labels || series[0].pts.map((p) => p[0]);
  const step = Math.ceil(n / 8);
  lbl.forEach((t, i) => { if ((i % step === 0 && n - 1 - i >= step / 2) || i === n - 1) s += `<text x="${x(i)}" y="${h - 8}" text-anchor="${i === n - 1 ? "end" : i === 0 ? "start" : "middle"}">${esc(t)}</text>`; });
  return `${s}</svg>`;
}
function barList(el, rows, { ref = null, onClick = null, fmtV = (v) => pct(v), signed = true, floor = null } = {}) {
  // rows: [{label, v, id?}]
  const vals = rows.map((r) => r.v).concat(ref ?? []);
  const min = floor ?? (signed ? Math.min(0, ...vals) : 0);
  const span = Math.max(...vals, 0) - min || 1;
  const pos = (v) => ((v - min) / span) * 100;
  el.innerHTML = rows.map((r, i) => {
    const a = pos(Math.max(min, Math.min(0, r.v))), b = pos(Math.max(0, r.v));
    const cls = r.cls || (r.v < 0 ? "neg" : "");
    const tag = onClick ? "button" : "div";
    return `<${tag} class="bar" ${onClick ? `type="button" data-i="${i}"` : ""}><span class="lbl" title="${esc(r.label)}">${esc(r.label)}</span>
      <span class="track"><span class="fill ${cls}" style="left:${a}%;width:${Math.max(0.6, b - a)}%"></span>${ref != null ? `<span class="ref" style="left:${pos(ref)}%" title="Referencia"></span>` : ""}</span>
      <span class="val">${fmtV(r.v)}</span></${tag}>`;
  }).join("") || `<p class="muted">Sin resultados.</p>`;
  if (onClick) el.querySelectorAll("button.bar").forEach((b) => b.addEventListener("click", () => onClick(rows[+b.dataset.i])));
}

// ---------- datos ----------
async function getJSON(p) { const r = await fetch(`data/${p}`); if (!r.ok) throw new Error(p); return r.json(); }
let IPC, PROD, SAL, CARB;

async function init() {
  [IPC, PROD, SAL] = await Promise.all([getJSON("ipc.json"), getJSON("productos.json"), getJSON("salarios.json")]);
  $("#stamp").textContent = `Precios hasta ${mesTxt(IPC.ultimo)} · sueldos hasta el ${trimTxt(SAL.ultimo)}. Se actualiza solo cuando el INE publica.`;
  $("#mIpc").textContent = `Último dato: ${mesTxt(IPC.ultimo)}.`;
  $("#mSal").textContent = `Último dato: ${trimTxt(SAL.ultimo)}.`;
  $("#footDate").textContent = `Precios hasta ${mesTxt(IPC.ultimo)}.`;
  initCalc(); initSueldos(); initCesta();
  try { CARB = await getJSON("carburantes.json"); initGasolina(); } catch { $("#gKpis").innerHTML = `<p class="muted">Precios de carburantes no disponibles ahora mismo.</p>`; }
}

// ---------- calculadora ----------
function initCalc() {
  const G = mensual(IPC.general);
  const anioMax = +IPC.ultimo.slice(0, 4) - 1;
  const sel = $("#cAnio");
  for (let y = anioMax; y >= 2002; y--) sel.insertAdjacentHTML("beforeend", `<option ${y === 2019 ? "selected" : ""}>${y}</option>`);
  const q = new URLSearchParams(location.search);
  if (q.get("s")) $("#cSueldoAntes").value = fmt(+q.get("s"));
  if (q.get("a")) sel.value = q.get("a");
  if (q.get("h")) $("#cSueldoHoy").value = fmt(+q.get("h"));
  if (q.get("p") === "anio") $("#cPeriodo").value = "anio";
  const hoy = ultimos(G, 12);
  const run = () => {
    const antes = parseEur($("#cSueldoAntes").value), ahora = parseEur($("#cSueldoHoy").value), anio = +sel.value;
    const per = $("#cPeriodo").value === "anio" ? "al año" : "al mes";
    const f = hoy / mediaAnio(G, anio);
    const box = $("#cResult");
    if (!antes) { box.innerHTML = `<p class="muted">Desde ${anio}, los precios han subido un <strong>${pct((f - 1) * 100)}</strong>. Escribe tu sueldo para ver cuánto necesitarías hoy.</p>`; $("#cShare").hidden = true; return; }
    const necesario = antes * f;
    let html = `<p class="muted" style="margin:0">Para comprar lo mismo que con ${fmt(antes)} € ${per} en ${anio}, hoy necesitas</p>
      <div class="big">${fmt(necesario)} € <span class="muted" style="font:600 1rem var(--body)">${per}</span></div>
      <p class="muted small" style="margin:0">Los precios han subido un ${pct((f - 1) * 100)} desde ${anio}.</p>`;
    let txt = `Para vivir como en ${anio} con ${fmt(antes)} € ${per}, hoy necesito ${fmt(necesario)} €.`;
    if (ahora) {
      const real = (ahora / necesario - 1) * 100, dif = ahora - necesario;
      const cls = Math.abs(real) < 0.5 ? "eq" : real < 0 ? "loss" : "gain";
      const verbo = cls === "eq" ? "Tienes el mismo poder adquisitivo que en " + anio : real < 0 ? `Has perdido un ${fmt(-real, 1)} % de poder adquisitivo` : `Has ganado un ${fmt(real, 1)} % de poder adquisitivo`;
      html += `<div class="verdict ${cls}">${verbo}. ${cls === "eq" ? "" : `Son ${fmt(Math.abs(dif))} € ${per} ${real < 0 ? "menos" : "más"} de lo que necesitarías para vivir igual.`}</div>`;
      txt = `${verbo} desde ${anio}: ${real < 0 ? "me faltan" : "me sobran"} ${fmt(Math.abs(dif))} € ${per} para vivir igual.`;
    }
    const S = trimestral(SAL.territorios["00"]);
    const sBase = mediaAnio(S, anio);
    if (sBase) {
      const sHoy = ultimos(S, 4), realMedio = ((sHoy / sBase) / f - 1) * 100;
      html += `<p class="small muted" style="margin-top:10px">${Math.abs(realMedio) < 0.5 ? `El sueldo medio en España compra hoy lo mismo que en ${anio}: ha subido al mismo ritmo que los precios.` : `El sueldo medio en España ha ${realMedio < 0 ? "perdido" : "ganado"} un ${fmt(Math.abs(realMedio), 1)} % de poder adquisitivo en ese tiempo.`}</p>`;
    }
    box.innerHTML = html;
    const p = new URLSearchParams({ s: antes, a: anio }); if (ahora) p.set("h", ahora); if ($("#cPeriodo").value === "anio") p.set("p", "anio");
    const url = `${location.origin}${location.pathname}?${p}#calculadora`;
    history.replaceState(null, "", `?${p}#calculadora`);
    const share = `${txt} Calcula el tuyo:`;
    $("#shWa").href = `https://wa.me/?text=${encodeURIComponent(`${share} ${url}`)}`;
    $("#shX").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(share)}&url=${encodeURIComponent(url)}`;
    $("#shLi").href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    $("#btnCopiar").onclick = async () => { try { await navigator.clipboard.writeText(url); $("#btnCopiar").textContent = "Enlace copiado"; setTimeout(() => ($("#btnCopiar").textContent = "Copiar enlace"), 1800); } catch {} };
    $("#cShare").hidden = false;
  };
  ["#cSueldoAntes", "#cSueldoHoy"].forEach((s) => $(s).addEventListener("input", run));
  ["#cAnio", "#cPeriodo"].forEach((s) => $(s).addEventListener("change", run));
  $("#calc").addEventListener("submit", (e) => e.preventDefault());
  run();
}

// ---------- sueldos ----------
function initSueldos() {
  const G = mensual(IPC.general), S = trimestral(SAL.territorios["00"]);
  const sel = $("#sBase");
  const primero = +SAL.territorios["00"].inicio.slice(0, 4), ultimoCompleto = +SAL.ultimo.slice(0, 4) - 1;
  for (let y = primero; y <= ultimoCompleto; y++) sel.insertAdjacentHTML("beforeend", `<option ${y === 2019 ? "selected" : ""}>${y}</option>`);
  const draw = () => {
    const base = +sel.value;
    const pBase = mediaAnio(G, base), sBase = mediaAnio(S, base);
    const pHoy = ultimos(G, 12), sHoy = ultimos(S, 4);
    const nom = (sHoy / sBase - 1) * 100, pre = (pHoy / pBase - 1) * 100, real = ((sHoy / sBase) / (pHoy / pBase) - 1) * 100;
    $("#sTitulo").textContent = Math.abs(real) < 0.5 ? `El sueldo medio compra hoy lo mismo que en ${base}` : real < 0 ? `El sueldo medio compra hoy menos que en ${base}` : `El sueldo medio compra hoy más que en ${base}`;
    $("#sKpis").innerHTML = `
      <div class="kpi"><b>${pct(nom)}</b><span>ha subido el sueldo medio desde ${base}</span></div>
      <div class="kpi"><b>${pct(pre)}</b><span>han subido los precios en el mismo tiempo</span></div>
      <div class="kpi ${real < -0.5 ? "loss" : real > 0.5 ? "gain" : ""}"><b>${Math.abs(real) < 0.05 ? "0,0 %" : pct(real)}</b><span>poder adquisitivo del sueldo medio</span></div>
      <div class="kpi"><b>${fmt(sHoy)} €</b><span>sueldo medio bruto al mes (media de los últimos 4 trimestres, con pagas extra prorrateadas)</span></div>`;
    // índice real anual desde base
    const anios = [], pts = [];
    for (let y = base; y <= ultimoCompleto; y++) { const s = mediaAnio(S, y), p = mediaAnio(G, y); if (s && p) { anios.push(String(y)); pts.push([String(y), 100 * (s / sBase) / (p / pBase)]); } }
    pts.push(["Últimos 12 meses", 100 * (sHoy / sBase) / (pHoy / pBase)]);
    $("#sChart").innerHTML = lineChart([{ name: "Poder adquisitivo", color: "var(--accent)", pts }], { ref: 100, fmtY: (v) => fmt(v, 0) });
    // comunidades
    const rows = [];
    for (const [cod, c] of Object.entries(SAL.territorios)) {
      if (cod === "00" || !IPC.ccaa[cod]) continue;
      const sc = trimestral(c), gc = mensual(IPC.ccaa[cod]);
      const sb = mediaAnio(sc, base), gb = mediaAnio(gc, base);
      if (!sb || !gb) continue;
      rows.push({ label: c.nombre, v: ((ultimos(sc, 4) / sb) / (ultimos(gc, 12) / gb) - 1) * 100 });
    }
    rows.sort((a, b) => a.v - b.v);
    rows.forEach((r) => (r.cls = r.v < 0 ? "neg" : "pos"));
    $("#sCcaaNota").textContent = `Variación del poder adquisitivo del sueldo medio desde ${base}: sueldo medio de cada comunidad frente a los precios de esa misma comunidad.`;
    barList($("#sCcaa"), rows);
  };
  sel.addEventListener("change", draw);
  draw();
}

// ---------- la cesta ----------
function initCesta() {
  const S = trimestral(SAL.territorios["00"]), G = mensual(IPC.general);
  const selB = $("#pBase"), selG = $("#pGrupo");
  const ultimoAnio = +IPC.ultimo.slice(0, 4);
  for (const y of [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].filter((y) => y < ultimoAnio)) selB.insertAdjacentHTML("beforeend", `<option ${y === 2019 ? "selected" : ""}>${y}</option>`);
  for (const [cod, nombre] of Object.entries(PROD.grupos)) selG.insertAdjacentHTML("beforeend", `<option value="${cod}">${esc(nombre)}</option>`);
  const series = PROD.productos.map((p) => ({ ...p, m: mensual(p) }));
  const detalle = (p) => {
    const pts = [...p.m].filter(([k]) => k >= "2017-01").map(([k, v]) => [k, v]);
    const gpts = pts.map(([k]) => [k, G.get(k) ?? null]);
    $("#pDetalle").innerHTML = `<div class="card" style="margin-top:14px"><div class="chart-head"><h3>${esc(p.nombre)}</h3><button type="button" class="share-btn" id="pCerrar" style="border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:4px 12px;cursor:pointer">Cerrar</button></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>${esc(p.nombre)}</span><span><i style="background:var(--ink-2)"></i>Índice general de precios</span></div>
      ${lineChart([{ name: p.nombre, color: "var(--accent)", pts }, { name: "IPC general", color: "var(--ink-2)", pts: gpts }], { fmtY: (v) => fmt(v, 0), labels: pts.map((x) => x[0].slice(0, 4)) })}
      <p class="muted small">Índice de precios, 100 = media de 2025. Fuente: INE.</p></div>`;
    $("#pCerrar").onclick = () => ($("#pDetalle").innerHTML = "");
    $("#pDetalle").scrollIntoView({ block: "nearest" });
  };
  const draw = () => {
    const base = +selB.value, g = selG.value, qtxt = $("#pBuscar").value.trim().toLowerCase();
    const sal = (ultimos(S, 4) / mediaAnio(S, base) - 1) * 100;
    const ipc = (ultimos(G, 12) / mediaAnio(G, base) - 1) * 100;
    const rows = [];
    for (const p of series) {
      const b = mediaAnio(p.m, base);
      if (!b || (g && p.grupo !== g)) continue;
      rows.push({ label: p.nombre, v: (ultimos(p.m, 12) / b - 1) * 100, p });
    }
    rows.sort((a, b) => b.v - a.v);
    const mas = rows.filter((r) => r.v > sal).length;
    $("#cestaLede").innerHTML = `Desde ${base}, el sueldo medio ha subido un <strong>${pct(sal)}</strong> y los precios en general un <strong>${pct(ipc)}</strong>. De los ${rows.length} productos y servicios con datos, <strong>${mas}</strong> han subido más que el sueldo medio.`;
    const click = (r) => detalle(r.p);
    const mark = (list) => list.map((r) => ({ ...r, cls: r.v > sal ? "neg" : "pos" }));
    if (qtxt) {
      $("#pSube").parentElement.parentElement.hidden = true;
      const found = rows.filter((r) => r.label.toLowerCase().includes(qtxt));
      barList($("#pBusqueda"), mark(found), { ref: sal, onClick: click });
    } else {
      $("#pSube").parentElement.parentElement.hidden = false;
      $("#pBusqueda").innerHTML = "";
      barList($("#pSube"), mark(rows.slice(0, 15)), { ref: sal, onClick: click });
      barList($("#pBaja"), mark(rows.slice(-15).reverse()), { ref: sal, onClick: click });
    }
  };
  [selB, selG].forEach((s) => s.addEventListener("change", draw));
  $("#pBuscar").addEventListener("input", draw);
  draw();
  // leyenda de la línea de referencia
  $("#pSube").parentElement.parentElement.insertAdjacentHTML("beforebegin", `<div class="legend"><span><i></i>Línea amarilla: lo que ha subido el sueldo medio</span><span><i style="background:var(--loss)"></i>Sube más que el sueldo</span><span><i style="background:var(--gain)"></i>Sube menos que el sueldo</span></div>`);
}

// ---------- gasolina ----------
function initGasolina() {
  const nombreComb = { g95: "gasolina 95", diesel: "gasóleo A" };
  const fecha = new Date(CARB.fecha + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  $("#mGas").textContent = `Último dato: ${fecha}.`;
  $("#gKpis").innerHTML = `
    <div class="kpi"><b>${fmt(CARB.nacional.g95.media, 3)} €</b><span>litro de gasolina 95, media de España (${fecha})</span></div>
    <div class="kpi"><b>${fmt(CARB.nacional.diesel.media, 3)} €</b><span>litro de gasóleo A, media de España</span></div>
    <div class="kpi"><b>${fmt(CARB.nacional.g95.n + 0)}</b><span>gasolineras con precio de gasolina 95 hoy</span></div>`;
  const provs = Object.entries(CARB.provincias).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"));
  const sel = $("#gProv");
  for (const [id, p] of provs) sel.insertAdjacentHTML("beforeend", `<option value="${id}" ${id === "28" ? "selected" : ""}>${esc(p.nombre)}</option>`);
  const draw = () => {
    const c = $("#gComb").value, p = CARB.provincias[sel.value];
    const d = p[c];
    $("#gTituloBaratas").textContent = `Las 10 gasolineras más baratas de ${p.nombre} (${nombreComb[c]})`;
    $("#gBaratas").innerHTML = d ? `<table><thead><tr><th>Gasolinera</th><th>Municipio</th><th class="r">€/litro</th></tr></thead><tbody>${d.baratas.map(([v, rot, dir, mun, lat, lon, hor]) =>
      `<tr><td><strong>${esc(rot)}</strong><div class="muted small">${lat && lon ? `<a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener">${esc(dir)}</a>` : esc(dir)} · ${esc(hor)}</div></td><td>${esc(mun)}</td><td class="r"><strong>${fmt(v, 3)}</strong></td></tr>`).join("")}</tbody></table>
      <p class="muted small" style="padding:0 12px">Media de la provincia: ${fmt(d.media, 3)} €/l. Diferencia con la más barata: ${fmt((d.media - d.min) * 50, 2)} € en un depósito de 50 litros.</p>` : `<p class="muted" style="padding:12px">Sin datos.</p>`;
    const rows = provs.filter(([, q]) => q[c]).map(([id, q]) => ({ label: q.nombre, v: q[c].media, cls: id === sel.value ? "neg" : "" })).sort((a, b) => a.v - b.v);
    barList($("#gProvincias"), rows, { fmtV: (v) => `${fmt(v, 3)} €`, floor: Math.min(...rows.map((r) => r.v)) - 0.05 });
  };
  sel.addEventListener("change", draw); $("#gComb").addEventListener("change", draw);
  draw();
  const gas = PROD.productos.find((p) => p.nombre === "Gasolina"), die = PROD.productos.find((p) => p.nombre === "Gasóleo");
  if (gas && die) {
    const mg = mensual(gas), md = mensual(die), keys = [...mg.keys()];
    $("#gChart").innerHTML = `<div class="legend"><span><i style="background:var(--accent)"></i>Gasolina</span><span><i style="background:var(--loss)"></i>Gasóleo</span></div>` +
      lineChart([{ name: "Gasolina", color: "var(--accent)", pts: keys.map((k) => [k, mg.get(k)]) }, { name: "Gasóleo", color: "var(--loss)", pts: keys.map((k) => [k, md.get(k) ?? null]) }],
        { fmtY: (v) => fmt(v, 0), labels: keys.map((k) => k.slice(0, 4)) });
  } else $("#gChart").closest(".card").hidden = true;
}

init().catch((e) => { console.error(e); $("#stamp").textContent = "No se han podido cargar los datos. Prueba a recargar la página."; });
