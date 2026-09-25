const DATA_BASE_CANDIDATES = ["./data", "./static_site/data", "../data"];

const state = {
  index: null, content: null, dataBase: null,
  currentMaterial: null,
  jsmolLoaded: false,
  seriesLoaded: {},
  helpVisible: false,
  filters: {
    name: "", layerTypes: [], cations: [], crystalSystems: [],
    a: { min: null, max: null }, b: { min: null, max: null }, c: { min: null, max: null },
    peaks: [{ min: null, max: null }, { min: null, max: null }, { min: null, max: null }, { min: null, max: null }]
  },
};

function getEl(id) { return document.getElementById(id); }

// Stamped into index.html by build_site.py. Doubles as the cache buster, so a new
// commit invalidates the data automatically and nothing has to be bumped by hand.
const BUILD = document.querySelector('meta[name="build"]')?.content || "dev";

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// Reproduces a Django DecimalField's fixed scale (e.g. layer_charge is 4,3 -> "0.021").
function fixed(value, places) {
  return value === null || value === undefined ? "n/a" : Number(value).toFixed(places);
}

// Same collation approximation as build_data.collation_key: Django sorts material
// names in SQL, where punctuation and case are insignificant.
function collationKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function byName(a, b) {
  const ka = collationKey(a.name), kb = collationKey(b.name);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

// Mirrors Reference.list_authors: "A", "A & B", "A, B & C".
function formatAuthorList(authors) {
  const names = (authors || []).map((a) => a.last_name).filter(Boolean);
  if (names.length > 2) return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  return names.join(" & ");
}

// Inline SVG replaces Font Awesome: the site used ten glyphs, for which the CDN
// build pulled ~60 kB of CSS plus webfonts from a third party. These are drawn
// with currentColor so the existing text-* classes keep working unchanged.
const ICONS = {
  "caret-down": '<path d="M3 6l5 5 5-5z" fill="currentColor"/>',
  "times-circle": '<circle cx="8" cy="8" r="6.5"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
  check: '<path d="M3 8.5l3.2 3.2L13 4.9"/>',
  circle: '<circle cx="8" cy="8" r="5.5" fill="currentColor" stroke="none"/>',
  download: '<path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4l3.1 3.1"/>',
  question: '<path d="M5.8 5.6a2.2 2.2 0 113.1 2.1c-.6.3-.9.8-.9 1.4v.4"/><circle cx="8" cy="12.2" r=".9" fill="currentColor" stroke="none"/>',
  envelope: '<rect x="1.5" y="3.5" width="13" height="9" rx="1"/><path d="M1.5 4.5L8 9l6.5-4.5"/>',
  database: '<ellipse cx="8" cy="4" rx="5.5" ry="2.2"/><path d="M2.5 4v8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V4"/><path d="M2.5 8.2c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2"/>',
  users: '<circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/><circle cx="12" cy="6" r="2"/><path d="M11.5 9.7c1.8.2 3 1.6 3 3.8"/>',
};

// `extra` carries the same utility classes the <i> elements used to.
function icon(name, extra = "") {
  const d = ICONS[name];
  if (!d) return "";
  return `<svg viewBox="0 0 16 16" class="inline-block w-4 h-4 align-[-0.15em] ${extra}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}

// A compiler cannot see `bg-${color}-400`, so every panel colour is spelled out
// here. This is what lets the CSS be built and purged instead of loading the
// whole framework; adding a colour means adding a row.
const PANEL_COLORS = {
  green:  { head: "bg-green-400",  body: "bg-green-100",  border: "border-green-500",  stripe: "bg-green-200",  rowHover: "hover:bg-green-400",  button: "bg-green-400 hover:bg-green-500" },
  orange: { head: "bg-orange-400", body: "bg-orange-100", border: "border-orange-500", stripe: "bg-orange-200", rowHover: "hover:bg-orange-400", button: "bg-orange-400 hover:bg-orange-500" },
  yellow: { head: "bg-yellow-400", body: "bg-yellow-100", border: "border-yellow-500", stripe: "bg-yellow-200", rowHover: "hover:bg-yellow-400", button: "bg-yellow-400 hover:bg-yellow-500" },
  teal:   { head: "bg-teal-400",   body: "bg-teal-100",   border: "border-teal-500",   stripe: "bg-teal-200",   rowHover: "hover:bg-teal-400",   button: "bg-teal-400 hover:bg-teal-500" },
  purple: { head: "bg-purple-400", body: "bg-purple-100", border: "border-purple-500", stripe: "bg-purple-200", rowHover: "hover:bg-purple-400", button: "bg-purple-400 hover:bg-purple-500" },
  indigo: { head: "bg-indigo-400", body: "bg-indigo-100", border: "border-indigo-500", stripe: "bg-indigo-200", rowHover: "hover:bg-indigo-400", button: "bg-indigo-400 hover:bg-indigo-500" },
  blue:   { head: "bg-blue-400",   body: "bg-blue-100",   border: "border-blue-500",   stripe: "bg-blue-200",   rowHover: "hover:bg-blue-400",   button: "bg-blue-400 hover:bg-blue-500" },
  gray:   { head: "bg-gray-400",   body: "bg-gray-100",   border: "border-gray-500",   stripe: "bg-gray-200",   rowHover: "hover:bg-gray-400",   button: "bg-gray-400 hover:bg-gray-500" },
};

function panelColor(color) {
  return PANEL_COLORS[color] || PANEL_COLORS.blue;
}

// index.html offers all seven in symmetry order; the data only covers four,
// but Django showed the rest too and they simply match nothing.
const CRYSTAL_SYSTEMS = ["triclinic", "monoclinic", "orthorhombic", "tetragonal", "trigonal", "hexagonal", "cubic"];

// Compact empty state for table cells, where noData() would be too tall.
function noDataCell() {
  return `<span class="text-gray-600">${icon("times-circle", "text-red-800 mr-1")}No data available</span>`;
}

function checkMark(present) {
  return present
    ? `${icon("check", "text-green-800")}<span class="sr-only">yes</span>`
    : `${icon("times-circle", "text-red-800")}<span class="sr-only">no</span>`;
}

function noData(message = "No data available") {
  return `<div class="flex w-full py-8"><div class="flex mx-auto items-center text-gray-600 bg-white px-6 py-2 rounded-full shadow-sm">${icon("times-circle", "text-red-600 mr-2")}<p>${message}</p></div></div>`;
}

// Contextual help per material tab, verbatim from the .helpInfo blocks in hls.html.
// Without the "plots" entry the JSmol colour coding is unreadable, so these are content, not chrome.
const HELP = {
  general: [
    "This summarizes some relevant information concerning the Hydrous Layer Silicate and is subdivided into three parts: Synthesis, Crystal Structure and Properties.",
  ],
  pp: [
    "The powder patterns were recorded with monochromatized CuKa1 radiation from capillary samples to avoid preferred orientation of the plate-like crystals. The patterns are limited to a diffraction angle of 37 °2theta since usually only little information can be deduced from higher angle reflections.",
    "Because HLSs often show characteristic anisotropic peak broadening, this database presents for better comparison predominantly experimental XRD powder patterns and not the calculated ones. Only in those cases where no material was available the XRD patterns were calculated based on the structure data and assuming CuKa1 radiation.",
    "The fact that the powder XRD patterns of the HLSs show anisotropic broadening of the peak halfwidths is mainly due to a certain degree of disorder of the layer stacking and to a much lesser extent to the specific morphology (thin plateletts). Typically, all reflections representing the atomic arrangement within the layer are sharp. These are the HK0-reflections, if we assume that the stacking direction is parallel to the c axis. Usuallly, all 00L-reflections representing the interlayer distance are moderately sharp (in spite of the very small crystal size along this direction), indicating that the inter-layer distances are about identical. In contrast, all other H0L, 0KL and HKL reflections with H, K, L ≠ 0 are broad. These reflections include also information on the orientation of layers relative to each other which is not perfect because only weak bonding interactions exist between neighboring layers.",
    "Please note, that H-RUB-18 and MCM-22(p) are highly disordered materials, the listed values for the diffraction angles and intensities are not very reliable.",
  ],
  refs: [
    "To complement the XRD powder pattern all possible reflections (according to the space group symmetry) are listed up to a diffraction angle of 37° 2θ. The peaks are characterized by their HKL indices, the multiplicity M, the diffraction angle (2θ) with respect to CuKa1 radiation (λ = 1.5406 Å), the relative intensity (observed or calculated) and the d-value. Note, that in the case of HLSs the peak height is usually not proportional to the peak intensity because of significant anisotropy of halfwidths!",
  ],
  facs: [
    "The fractional atomic coordinates may be used, e.g., to draw a structure plot of the compound or to calculate interatomic distances.",
  ],
  plots: [
    "The structure of the HLS is presented in two projections representing instructive pictures of the arrangement of layers, cations and water molecules.",
    "The silicate layer is displayed with silicon atoms shown as small purple spheres, bridging oxygen atoms as red spheres and terminal oxygen atoms (OH- or O-- groups) as blue spheres. Si-O bonds are drawn as black lines, and hydrogen bridges as light blue lines. The inter-layer region may contain water molecules (light blue spheres), carbon atoms as white spheres, nitrogen atoms as small green spheres, sodium ions as yellow spheres. TMA cations are displayed as large green spheres since these cations are typically rotationally disordered (only the position of the nitrogen atom is approx. fixed). Hydrogen atoms are not included in the drawings since their position remained unknown in nearly all cases. White lines represent N-C and C-C bonds.",
  ],
  ir: [
    "The FTIR spectra of the HLS are displayed in a range between 400 and 1300 cm<sup>-1</sup>. The spectra were recorded using the ATR technique and were not further corrected. In the given range the FTIR spectra are dominated by the lattice vibrations of the silicate layer. Absorption bands due to vibrations of organic cations are also present but they are usually quite weak. The spectra are included here to serve as a rough “finger print” of the layer-type. Probably because the interactions between silicate layer and “low-charge-density-cation” are weak, the FTIR spectra of different HLSs with the same layer type show similar characteristics.",
  ],
  cif: ["Download of the Crystallographic Information File (CIF)."],
};

function helpBlock(key) {
  const paragraphs = HELP[key] || [];
  if (!paragraphs.length) return "";
  return `<div class="helpInfo w-full${state.helpVisible ? "" : " hidden"} mt-1 mb-2 bg-blue-100 border-t border-b border-blue-500 text-blue-700 px-4 py-3 text-justify">${paragraphs.map((p, i) => `<p class="${i ? "mt-3 " : ""}text-sm">${p}</p>`).join("")}</div>`;
}

function helpToggle() {
  const on = state.helpVisible;
  return `<div class="flex items-center"><button id="help-toggle" onclick="toggleHelp()" title="Show explanations" type="button" class="h-6 w-12 rounded-full flex items-center cursor-pointer focus:outline-none ${on ? "justify-end bg-gray-900" : "bg-gray-200"}" style="transition: background-color 300ms ease-in-out 0s;"><span class="rounded-full border border-gray-500 w-6 h-6 shadow-inner bg-gray-200"></span></button>${icon("question", "ml-1 text-gray-800")}</div>`;
}

window.toggleHelp = function () {
  state.helpVisible = !state.helpVisible;
  document.querySelectorAll(".helpInfo").forEach((el) => el.classList.toggle("hidden", !state.helpVisible));
  const btn = getEl("help-toggle");
  if (!btn) return;
  btn.classList.toggle("justify-end", state.helpVisible);
  btn.classList.toggle("bg-gray-900", state.helpVisible);
  btn.classList.toggle("bg-gray-200", !state.helpVisible);
};

// Parsed payloads are kept so a route can pre-warm its data before starting a
// view transition: the transition freezes the page while its callback runs, so
// the network request must already be done by then.
const jsonCache = new Map();

async function loadJson(path) {
  if (jsonCache.has(path)) return jsonCache.get(path);
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  const data = await response.json();
  jsonCache.set(path, data);
  return data;
}

function routeDataUrl(first, parts) {
  if ((first === "hls" || first === "rm") && parts[1]) return `${state.dataBase}/materials/${parts[1]}.json`;
  if (first === "lt" && parts[1]) return `${state.dataBase}/layer-types/${parts[1]}.json`;
  return null;
}

async function loadCoreData() {
  for (const base of DATA_BASE_CANDIDATES) {
    try {
      const [indexData, contentData] = await Promise.all([
        loadJson(`${base}/index.json?rev=${BUILD}`),
        loadJson(`${base}/content.json?rev=${BUILD}`)
      ]);
      state.dataBase = base; state.index = indexData; state.content = contentData;
      return;
    } catch (e) {}
  }
  throw new Error("Could not load site data.");
}

function createCheckbox(id, label, group, value) {
  const div = document.createElement("div");
  div.className = "flex items-center mb-1";
  div.innerHTML = `<input type="checkbox" id="${group}-${id}" value="${escapeHtml(value)}" class="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out"><label for="${group}-${id}" class="ml-2 text-gray-700 cursor-pointer select-none">${label}</label>`;
  const input = div.querySelector("input");
  input.addEventListener("change", () => {
    if (input.checked) state.filters[group].push(input.value);
    else state.filters[group] = state.filters[group].filter(v => v !== input.value);
    triggerSearch();
  });
  return div;
}

function initFilters() {
  const cc = getEl("search-cation-container"), ltc = getEl("search-layer-type-container"), csc = getEl("search-crystal-system-container");
  if (cc) { cc.innerHTML = ""; state.index.intercalated_cations.forEach((ic, i) => { if (ic.chemical_formula) cc.appendChild(createCheckbox(i, ic.chemical_formula_html || ic.chemical_formula, "cations", ic.chemical_formula)); }); }
  if (ltc) { ltc.innerHTML = ""; state.index.layer_types.forEach((lt, i) => { ltc.appendChild(createCheckbox(i, lt.name, "layerTypes", lt.name)); }); }
  if (csc) { csc.innerHTML = ""; CRYSTAL_SYSTEMS.forEach((cs, i) => { csc.appendChild(createCheckbox(i, cs, "crystalSystems", cs)); }); }

  const rangeMap = [
    { id: "search-a-min", key: "a", sub: "min" }, { id: "search-a-max", key: "a", sub: "max" },
    { id: "search-b-min", key: "b", sub: "min" }, { id: "search-b-max", key: "b", sub: "max" },
    { id: "search-c-min", key: "c", sub: "min" }, { id: "search-c-max", key: "c", sub: "max" },
    { id: "search-p1-min", key: "peaks", idx: 0, sub: "min" }, { id: "search-p1-max", key: "peaks", idx: 0, sub: "max" },
    { id: "search-p2-min", key: "peaks", idx: 1, sub: "min" }, { id: "search-p2-max", key: "peaks", idx: 1, sub: "max" },
    { id: "search-p3-min", key: "peaks", idx: 2, sub: "min" }, { id: "search-p3-max", key: "peaks", idx: 2, sub: "max" },
    { id: "search-p4-min", key: "peaks", idx: 3, sub: "min" }, { id: "search-p4-max", key: "peaks", idx: 3, sub: "max" },
  ];
  rangeMap.forEach(item => {
    const el = getEl(item.id);
    if (el) el.addEventListener("input", () => {
      const val = el.value === "" ? null : parseFloat(el.value);
      if (item.key === "peaks") state.filters.peaks[item.idx][item.sub] = val;
      else state.filters[item.key][item.sub] = val;
      triggerSearch();
    });
  });
  const bi = getEl("build-info");
  if (bi) bi.textContent = `Build ${BUILD}`;
}

function getHash(item, type = "material") {
  if (type === "lt") return `#/lt/${item.slug}`;
  return item.is_related_material ? `#/rm/${item.slug}` : `#/hls/${item.slug}`;
}

// Django's IndexView searches name, similar_structure and similar_chemistry.
function matchesName(m, name) {
  return [m.name, ...(m.similar_structure || []), ...(m.similar_chemistry || [])]
    .some((value) => String(value ?? "").toLowerCase().includes(name));
}

function applyFilters(materials) {
  const f = state.filters, name = f.name.toLowerCase().trim();
  return materials.filter((m) => {
    if (name && !matchesName(m, name)) return false;
    if (f.layerTypes.length && !f.layerTypes.includes(m.layer_type)) return false;
    if (f.cations.length && !f.cations.includes(m.intercalated_cation)) return false;
    if (f.crystalSystems.length && !m.crystal_systems.some(cs => f.crystalSystems.includes(cs))) return false;
    if (f.a.min !== null && (m.a === null || m.a < f.a.min)) return false;
    if (f.a.max !== null && (m.a === null || m.a > f.a.max)) return false;
    if (f.b.min !== null && (m.b === null || m.b < f.b.min)) return false;
    if (f.b.max !== null && (m.b === null || m.b > f.b.max)) return false;
    if (f.c.min !== null && (m.c === null || m.c < f.c.min)) return false;
    if (f.c.max !== null && (m.c === null || m.c > f.c.max)) return false;
    for (let i = 0; i < 4; i++) {
      const pf = f.peaks[i];
      if (pf.min === null && pf.max === null) continue;
      // A material matches when ANY of its peaks falls in the range (Django joins
      // over the reverse FK) — not when its i-th peak happens to.
      const hit = (m.peaks || []).some((mv) => mv !== null
        && (pf.min === null || mv >= pf.min)
        && (pf.max === null || mv <= pf.max));
      if (!hit) return false;
    }
    return true;
  });
}

let searchTimeout = null;
function triggerSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const hash = window.location.hash;
    // #/search shows the same sidebar, so it has to re-render too.
    if (!hash || hash === "#/" || hash === "#/search") renderList();
  }, 100);
}

function renderSection(title, color, content, headerExtra = "", headerCenter = "") {
  // gray-800 on purple-400 is only 3.68:1; gray-900 lifts it to 5.01:1 (WCAG AA).
  const headText = color === "purple" ? "text-gray-900" : "text-gray-800";
  const c = panelColor(color);
  const titleHtml = `<div class="text-xl font-bold font-sans tracking-wide">${title}</div>`;
  // With a centre item the bar becomes three columns: the middle one keeps its
  // natural width while the outer two each take half of whatever is left, which
  // puts the centre on the bar's midpoint no matter how wide the title is. Note
  // that `justify-center` on the centred element itself would do nothing here -
  // it only ever centres that element's own children. min-w-0 lets a long title
  // wrap rather than shove the middle column off centre.
  // Without a centre item nothing changes, so the other ten call sites, which
  // pass no header slots at all, keep the layout they had.
  const head = headerCenter
    ? `<div class="flex-1 min-w-0">${titleHtml}</div>` +
      `<div class="shrink-0 flex items-center px-2">${headerCenter}</div>` +
      `<div class="flex-1 min-w-0 flex items-center justify-end">${headerExtra}</div>`
    : `${titleHtml}${headerExtra}`;
  const justify = headerCenter ? "" : "justify-between ";
  return `<div class="mb-4 shadow-md rounded overflow-hidden"><div class="${c.head} ${headText} px-4 py-2 flex ${justify}items-center border-b ${c.border} shadow-sm">${head}</div><div class="${c.body} p-2 md:p-4">${content}</div></div>`;
}

function renderButtonCard(item, color, type = "material") {
  const button = panelColor(color).button, underline = type === "lt" ? "underline" : "";
  // No truncate: the original wrapped long names inside the button, so
  // "Helix-Layered-Silicate" and "RUB-52 dehydrated" stayed readable.
  return `<div class="flex h-20 justify-center w-1/3 sm:w-1/4 md:w-1/4 lg:w-1/5 xl:w-1/6"><a href="${getHash(item, type)}" class="block w-full focus:outline-none"><span class="transition-colors duration-200 ease-out ${button} text-gray-800 w-32 h-16 py-2 px-1 rounded m-1 shadow text-sm font-semibold leading-tight whitespace-normal break-words inline-flex items-center justify-center text-center ${underline}">${item.name}</span></a></div>`;
}

function renderCards(items, heading, color, type = "material") {
  const content = `<div class="flex flex-wrap">${items.map((m) => renderButtonCard(m, color, type)).join("")}${items.length === 0 ? `<div class="flex w-full py-8"><div class="flex mx-auto items-center text-gray-600 bg-white px-6 py-2 rounded-full shadow-sm">${icon("times-circle", "text-red-600 mr-2")}<p>Nothing found</p></div></div>` : ""}</div>`;
  return renderSection(heading, color, content);
}

function isFilterActive() {
  const f = state.filters;
  if (f.name.trim() || f.layerTypes.length || f.cations.length || f.crystalSystems.length) return true;
  if (["a", "b", "c"].some((k) => f[k].min !== null || f[k].max !== null)) return true;
  return f.peaks.some((p) => p.min !== null || p.max !== null);
}

function renderList() {
  const filtered = applyFilters(state.index.materials);
  const hls = filtered.filter((m) => !m.is_related_material), rm = filtered.filter((m) => m.is_related_material);
  // Django empties the layer type list while a search is active (views.py IndexView).
  const layerTypes = isFilterActive() ? "" : renderCards(state.index.layer_types, "Layer Types", "yellow", "lt");
  getEl("app").innerHTML = `${renderCards(hls, "Hydrous Layer Silicates", "green")}${renderCards(rm, "Related Materials", "orange")}${layerTypes}`;
}

const LIST_INTRO = "This table lists well characterized Hydrous Layer Silicates (HLSs). HLSs are silicates consisting of silicate layers and intercalated cations of low charge density which interact via weak ionic and hydrogen bonds. Not included in the listing are phyllosilicates with cations of higher charge density (e.g. clay minerals), delaminated layer silicates like ITQ-2 [91] or ITQ-6 [92], any organic-inorganic hybrid materials possessing covalent bonds between silicate layer and organic compound, interlayer expanded zeolites (IEZ) derived from HLSs (e.g. COE-4 [93]), oxidic or organic pillared silicates (e.g. MCM-36 [94], MWW-BTEB [95]), monolayers or nanosheets (e.g. MFI nanosheets [96]). An instructive review on most of these materials was published by Roth et al. [97].";

const LIST_FOOTNOTES = [
  "* Structurally nearly identical materials are such phases which contain the same layer type, possess the same type of layer stacking (e.g. ABAB) and contain the same organic cation between silicate layers (these materials may, however, vary with respect to space group symmetry).",
  "* Crystal chemically related materials are those materials which contain the same layer type, but different type of layer stacking and and/or other organic cations. This class of material is not very precisely defined but is a collection of materials which might be of interest.",
];

function renderSimpleList() {
  // list.html: HLS only, ordered by layer_type pk then name.
  const rows = state.index.materials
    .filter((m) => !m.is_related_material)
    .sort((a, b) => {
      // Postgres orders NULLs last on ASC, so a material without a layer type
      // (currently RUB-57) belongs at the end, not the front.
      const pa = a.layer_type_pk, pb = b.layer_type_pk;
      if (pa == null || pb == null) {
        if (pa != null || pb != null) return pa == null ? 1 : -1;
      } else if (pa !== pb) {
        return pa - pb;
      }
      return byName(a, b);
    });
  const head = ["Layer Type", "Type Material", "Intercalated cation", "Structurally nearly identical materials*", "Crystal chemically related materials*"];
  const table = rows.length
    ? `<div class="overflow-x-auto"><table class="w-full text-left text-sm border-collapse"><thead class="bg-green-400 text-gray-800"><tr>${head.map((h) => `<th class="p-2 font-bold">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((m, i) => `<tr class="${i % 2 ? "bg-green-100" : "bg-green-200"} hover:bg-green-400"><td class="p-2">${m.layer_type_slug ? `<a href="#/lt/${m.layer_type_slug}" class="underline">${m.layer_type}</a>` : "-"}</td><td class="p-2"><a href="${getHash(m)}" class="text-blue-700 hover:underline">${m.name}</a></td><td class="p-2">${m.intercalated_cation_name || "-"}</td><td class="p-2">${(m.similar_structure || []).join(", ")}</td><td class="p-2">${(m.similar_chemistry || []).join(", ")}</td></tr>`).join("")}</tbody></table></div>`
    : noData("Nothing found");
  const content = `<p class="mb-6 text-sm text-justify text-gray-800">${LIST_INTRO}</p>${table}${LIST_FOOTNOTES.map((p) => `<p class="mt-4 text-xs text-justify text-gray-700">${p}</p>`).join("")}`;
  getEl("app").innerHTML = renderSection("List of Hydrous Layer Silicates", "green", content);
}

function renderMatrix(rows, columns, color) {
  if (!rows.length) return noData("Nothing found");
  return `<div class="overflow-x-auto"><table class="w-full text-left text-sm border-collapse"><thead class="${panelColor(color).head} text-gray-800"><tr>${columns.map((c, i) => `<th class="p-2 font-bold${i ? " text-center" : ""}">${c.label}</th>`).join("")}</tr></thead><tbody>${rows.map((row, i) => `<tr class="${i % 2 ? panelColor(color).body : panelColor(color).stripe} ${panelColor(color).rowHover}">${columns.map((c, j) => `<td class="p-2${j ? " text-center" : ""}">${c.cell(row)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderOverview() {
  // overview_partial_hls / _rm / _lt.html — a data completeness matrix, not the card grid.
  const materialCols = (withPeaks) => [
    { label: withPeaks ? "HLS" : "Related Material", cell: (m) => `<a href="${getHash(m)}" class="text-blue-700 hover:underline">${m.name}</a>` },
    { label: "Cif", cell: (m) => checkMark(m.has?.cif) },
    { label: "Powder pattern", cell: (m) => checkMark(m.has?.powder_pattern) },
    ...(withPeaks ? [{ label: "Peaks", cell: (m) => checkMark(m.has?.peaks) }] : []),
    { label: "Reflections", cell: (m) => checkMark(m.has?.reflections) },
    { label: "Coordinates", cell: (m) => checkMark(m.has?.coordinates) },
    { label: "Structure plot", cell: (m) => checkMark(m.has?.structure_plot) },
    { label: "IR", cell: (m) => checkMark(m.has?.ir) },
  ];
  const hls = state.index.materials.filter((m) => !m.is_related_material).sort(byName);
  const rm = state.index.materials.filter((m) => m.is_related_material).sort((a, b) => a.pk - b.pk);
  const ltCols = [
    { label: "Layer type", cell: (lt) => `<a href="#/lt/${lt.slug}" class="text-blue-700 hover:underline">${lt.name}</a>` },
    { label: "Q<sup>3</sup>:Q<sup>4</sup>", cell: (lt) => `1 : ${fixed(lt.ratio_q3q4, 2)}` },
    { label: "Si:O", cell: (lt) => `1 : ${lt.ratio_sio ?? "n/a"}` },
    { label: "Composition", cell: (lt) => `Si<sub>${fixed(lt.composition_si, 0)}</sub>O<sub>${fixed(lt.composition_o, 0)}</sub>` },
    { label: "Thickness", cell: (lt) => `${fixed(lt.thickness, 1)} Å` },
    { label: "Layer charge", cell: (lt) => `${fixed(lt.layer_charge, 3)} z/Å<sup>2</sup>` },
    { label: "d<sub>OH...OH</sub>", cell: (lt) => `${fixed(lt.d_oh_oh, 1)} Å` },
  ];
  getEl("app").innerHTML = [
    renderSection("Hydrous Layer Silicates", "green", renderMatrix(hls, materialCols(true), "green")),
    renderSection("Related Materials", "orange", renderMatrix(rm, materialCols(false), "orange")),
    renderSection("Layer Types", "yellow", renderMatrix(state.index.layer_types, ltCols, "yellow")),
  ].join("");
}

function renderTable() {
  // index.json carries a prebuilt peak table; fetching the 52 per-material files
  // for this cost 51 MB and stalled the page for a table of a few hundred rows.
  const rows = (state.index.peak_table || []).map((p) => ({
    twoTheta: Number(p.two_theta), intensity: Number(p.intensity),
    name: p.name, slug: p.slug, isRelated: p.is_related_material, layerType: p.layer_type || "",
  }));
  // table.html is purple, with purple zebra striping rather than grey.
  const LIMIT = 2000;
  const shown = rows.slice(0, LIMIT);
  const head = ["2θ", "Intensity (rel.)", "Name", "Layer type"];
  const tableHtml = `<div class="rounded shadow-sm overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left text-sm border-collapse"><thead class="bg-purple-400 text-gray-900"><tr>${head.map((h) => `<th class="p-2 font-bold">${h}</th>`).join("")}</tr></thead><tbody>${shown.map((r, i) => `<tr class="${i % 2 ? "bg-purple-100" : "bg-purple-200"} hover:bg-purple-400"><td class="p-2 text-right">${Number.isFinite(r.twoTheta) ? r.twoTheta.toFixed(2) : "-"}</td><td class="p-2 text-right">${Number.isFinite(r.intensity) ? r.intensity.toFixed(1) : "-"}</td><td class="p-2"><a href="#/${r.isRelated ? "rm" : "hls"}/${r.slug}" class="text-blue-700 hover:underline">${r.name}</a></td><td class="p-2">${r.layerType || "/"}</td></tr>`).join("")}</tbody></table></div>${rows.length > LIMIT ? `<div class="bg-purple-100 p-2 text-xs text-gray-700">Showing the first ${LIMIT} of ${rows.length} rows.</div>` : ""}</div>`;
  getEl("app").innerHTML = renderSection("Powder Pattern Identification Table", "purple", rows.length ? tableHtml : noData("Nothing found"), downloadButton(rows.length, loadIdentificationCsv));
}

// The CSV is built in the browser from the committed data, so the full table is
// downloadable even though the page stops rendering rows at LIMIT.
function csvCell(value) {
  const text = String(value ?? "");
  return /[",;\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadButton(count, handler) {
  if (!count) return "";
  return `<button type="button" onclick="${handler.name}()" class="inline-flex items-center bg-white hover:bg-gray-100 active:bg-gray-200 transition-colors duration-150 text-gray-800 font-semibold py-1 px-3 border border-gray-400 rounded shadow text-sm focus:outline-none">${icon("download", "mr-2")}Download CSV</button>`;
}

function loadIdentificationCsv() {
  const rows = state.index.peak_table || [];
  const header = ["2theta", "Intensity (rel.)", "Name", "Layer type"];
  const body = rows.map((p) => [
    p.two_theta,
    p.intensity,
    p.name,
    p.layer_type || "/",
  ].map(csvCell).join(","));
  // CRLF + BOM: both are what spreadsheet software expects from a CSV download.
  downloadText("hls-identification-table.csv", "\ufeff" + [header.join(","), ...body].join("\r\n") + "\r\n");
}

// Panel colours per page, as in the Django templates: information.html is teal,
// howtocite.html indigo, table.html purple. references.html and contact.html took
// theirs from the textblock record, so an editor could set them per page.
function menuBlock(name) {
  return (state.content.menu || []).find((x) => x.name === name);
}

function renderInformation() {
  const content = state.content.information.filter((x) => x.show).map((x) => `<section class="bg-white border border-gray-300 rounded-lg p-4 mb-4 shadow-sm text-gray-800"><h2 class="text-xl font-bold text-blue-800 mb-3 border-b border-gray-200 pb-2">${x.name || ""}</h2><div class="prose max-w-none text-justify">${x.content || ""}</div></section>`).join("");
  getEl("app").innerHTML = renderSection("Information", "teal", content);
}

function formatReference(reference) {
  let authors = "";
  if (Array.isArray(reference.authors)) {
    authors = reference.authors.map((a) => `${a.first_name ? a.first_name.charAt(0) + '. ' : ''}${a.last_name}`).join(", ");
  } else {
    authors = reference.authors || "";
  }
  const doi = reference.doi ? `<a href="${escapeHtml(reference.doi)}" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline ml-2">DOI</a>` : "";
  
  let pubInfo = "";
  if (reference.from_static && !reference.from_db) {
    pubInfo = reference.journal_info || "";
  } else {
    const journal = reference.journal?.name || "";
    const vol = reference.volume ? `${reference.volume}, ` : "";
    const pages = reference.pages ? `${reference.pages}, ` : "";
    const year = reference.year || "";
    pubInfo = `${journal} ${vol}${pages}${year}.`;
  }
  
  return `<article class="bg-white border border-gray-300 rounded-lg p-3 shadow-sm mb-1 text-sm flex"><div class="font-bold text-gray-500 mr-3 ref-num">[${reference.display_num}]</div><div class="text-gray-800"><span class="font-semibold">${authors}</span>: <span class="italic">${reference.title || ""}</span>. ${pubInfo}${doi}</div></article>`;
}

async function renderReferences() {
  const refs = state.index.references || [];
  const sortedRefs = [...refs].sort((a, b) => a.display_num - b.display_num);
  const content = `<div class="space-y-1">${sortedRefs.map((r) => formatReference(r)).join("")}</div>`;
  const block = menuBlock("References");
  getEl("app").innerHTML = renderSection(block?.title || "References", block?.color || "purple", content);
}

function renderHowToCite() {
  const cite = state.content.how_to_cite?.[0];
  getEl("app").innerHTML = renderSection("How to cite", "indigo", `<div class="bg-white border border-gray-300 rounded-lg p-6 shadow-sm prose max-w-none text-gray-800 text-sm">${cite?.content || "<p>No content available.</p>"}</div>`);
}

function renderContact() {
  const block = menuBlock("Contact");
  getEl("app").innerHTML = renderSection(block?.title || "Contact", block?.color || "gray", `<div class="bg-white border border-gray-300 rounded-lg shadow-sm text-sm"><div class="border-b border-gray-300 px-4 py-2 font-semibold text-gray-900">Angaben gemäß § 5 TMG</div><div class="p-6"><div class="prose max-w-none mb-4 text-gray-800">${block?.content || ""}</div><a href="mailto:philipp.zuber@posteo.de" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow transition-colors">${icon("envelope", "mr-2")} Send email: philipp.zuber@posteo.de</a></div></div>`);
}

let charts = [];

// Chart.js 2.x keeps every instance alive with a resize detector, so replacing
// #app's HTML alone leaks the old charts and their datasets.
function destroyCharts() {
  charts.forEach((c) => { try { c.destroy(); } catch (e) {} });
  charts = [];
}

// Chart.js 4: scales are keyed objects rather than xAxes/yAxes arrays, min/max
// and reverse moved up out of `ticks`, `scaleLabel.labelString` became
// `title.text`, and `legend` sits under `plugins`.
// Spectrum software normally draws guide lines to the axes from the selected
// point; it makes reading a value off the scale possible at all. Written here as
// a local plugin rather than pulling in another library for ~20 lines of canvas.
const crosshairPlugin = {
  id: "crosshair",
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.() ?? [];
    if (!active.length) return;
    const { x, y } = active[0].element;
    const { ctx, chartArea: area } = chart;
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(74, 85, 104, 0.55)";
    ctx.beginPath();
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.right, y);
    ctx.stroke();
    ctx.restore();
  },
};

// Registered once. Without the plugin present the charts still work, they just
// do not zoom, so its absence is not worth failing over.
let zoomRegistered = false;

function registerZoom() {
  if (zoomRegistered || typeof Chart === "undefined" || typeof ChartZoom === "undefined") return zoomRegistered;
  Chart.register(ChartZoom);
  zoomRegistered = true;
  return true;
}

// Every gesture is off; the controls below drive the plugin's API instead.
//
// Gestures were tried and are not worth it here. ctrl+wheel is the browser's own
// page zoom and wins, because the plugin only calls preventDefault() when the
// event is cancelable. An unmodified wheel then traps the page scroll while the
// pointer crosses a chart. And a modifier on pan disables dragging outright — its
// mouseDown returns early whenever that key is held. Buttons have none of those
// conflicts, work the same with a mouse, a finger and a keyboard, and can be
// verified without a browser.
function zoomOptions() {
  if (!registerZoom()) return {};
  return {
    zoom: { wheel: { enabled: false }, drag: { enabled: false }, pinch: { enabled: false } },
    pan: { enabled: false },
  };
}

function chartById(canvasId) {
  return charts.find((c) => c?.canvas?.id === canvasId);
}

// x only: these are spectra, so the interesting direction is the abscissa.
window.chartZoomBy = function (canvasId, factor) {
  chartById(canvasId)?.zoom?.({ x: factor });
};

window.chartPanBy = function (canvasId, pixels) {
  chartById(canvasId)?.pan?.({ x: pixels }, undefined, "default");
};

window.resetChartZoom = function (canvasId) {
  chartById(canvasId)?.resetZoom?.();
};

// Only rendered when the plugin actually loaded, so a control can never promise
// something that will not happen.
function zoomHint(canvasId) {
  if (typeof ChartZoom === "undefined") return "";
  const btn = (label, title, call) =>
    `<button type="button" title="${title}" aria-label="${title}" onclick="${call}" class="bg-gray-200 hover:bg-gray-300 text-gray-800 py-1 px-3 rounded focus:outline-none">${label}</button>`;
  return `<div class="flex flex-wrap items-center justify-center gap-2 mt-3 text-xs text-gray-600">
    ${btn("&minus;", "Zoom out", `chartZoomBy('${canvasId}', 0.8)`)}
    ${btn("+", "Zoom in", `chartZoomBy('${canvasId}', 1.25)`)}
    ${btn("&#9664;", "Pan left", `chartPanBy('${canvasId}', 80)`)}
    ${btn("&#9654;", "Pan right", `chartPanBy('${canvasId}', -80)`)}
    ${btn("Reset", "Reset zoom", `resetChartZoom('${canvasId}')`)}
  </div>`;
}

function lineChart(canvasId, points, opts) {
  if (!points.length || !getEl(canvasId) || typeof Chart === "undefined") return;
  charts.push(new Chart(getEl(canvasId), {
    type: "scatter",
    plugins: [crosshairPlugin],
    data: {
      datasets: [{
        showLine: true, fill: false, borderColor: "rgb(75, 192, 192)", borderWidth: 1,
        pointRadius: 0,
        // Without these the cursor has to land on the 1px line: pointRadius 0
        // leaves nothing to hit, and the default hit radius is 1.
        pointHitRadius: 12,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: "rgb(75, 192, 192)",
        data: points,
      }],
    },
    options: {
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      parsing: false,
      // Pick the nearest point by x wherever the cursor is in the plot area,
      // rather than requiring it to intersect the line.
      interaction: { mode: "nearest", axis: "x", intersect: false },
      plugins: {
        legend: { display: false },
        ...zoomOptions(),
        tooltip: {
          displayColors: false,
          callbacks: {
            title: () => "",
            label: (ctx) => [
              `${opts.xLabel} ${ctx.parsed.x.toFixed(opts.xDigits)} ${opts.xUnit}`,
              `${opts.yLabel} ${ctx.parsed.y.toFixed(opts.yDigits)} ${opts.yUnit}`,
            ],
          },
        },
      },
      scales: {
        x: { display: true, title: { display: true, text: opts.xTitle }, ...opts.xRange },
        y: { display: true, title: { display: true, text: opts.yTitle } },
      },
    },
  }));
  const controls = getEl(`${canvasId}-controls`);
  if (controls) controls.innerHTML = zoomHint(canvasId);
}

function renderPowderChart(rows) {
  const points = (rows || []).map(([x, y]) => ({ x, y }));
  lineChart("powder-chart", points, {
    xTitle: "2θ​ / °", yTitle: "Intensity / arb. unit.", xRange: { min: 3, max: 37 },
    xLabel: "2θ", xUnit: "°", xDigits: 3, yLabel: "Intensity", yUnit: "", yDigits: 0,
  });
}

function renderIrChart(rows) {
  const points = (rows || []).map(([x, y]) => ({ x, y }));
  lineChart("ir-chart", points, {
    xTitle: "Wavenumber / cm-1", yTitle: "Reflection / %",
    xRange: { min: 400, max: 1300, reverse: true },
    xLabel: "Wavenumber", xUnit: "cm-1", xDigits: 1, yLabel: "Reflection", yUnit: "%", yDigits: 2,
  });
}

// Colour coding from hls.html's showJsmol — the helium and Si-F bond rules were
// missing here, so those structures rendered differently from the original.
const JSMOL_STYLE = [
  "select silicon; color atoms orchid; spacefill 0.35;",
  "select nitrogen; color atoms green; spacefill 0.4;",
  "select potassium; color atoms yellow; spacefill 0.6;",
  "select sulphur; color atoms aqua; spacefill 0.6;",
  "select fluorine; color atoms mediumblue; spacefill 0.45;",
  "select helium; color atoms mediumblue; spacefill 0.45;",
  "select carbon; color atoms gray; spacefill 0.4;",
  "select oxygen; spacefill 0.45;",
  "select silicon,oxygen; set bondmode AND; color bonds black; wireframe 0.2;",
  "select silicon,fluorine; set bondmode AND; color bonds black; wireframe 0.2;",
  "set ambient 30;",
  "moveto 0 1 0 0 -90;",
].join("");

function jsmolBase() {
  let base = window.location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, '');
  return base.endsWith('/') ? base : base + '/';
}

// Django's showJsmol(a, b, c): cell range as natural numbers 1-5, encoded {555 (4+a)(4+b)(4+c) -1}.
function renderJsmol(material, a = 2, b = 2, c = 2) {
  if (!material?.files?.cif_for_jsmol || typeof Jmol === "undefined" || !getEl("jsmol-root")) return false;
  const base = jsmolBase();
  const info = {
    color: "white",
    width: "100%",
    height: 600,
    use: "html5",
    j2sPath: base + "staticfiles/database/jsmol/j2s",
    serverURL: base + "staticfiles/database/jsmol/php/jsmol.php",
    appletLoadingImage: base + "staticfiles/database/jsmol/j2s/img/JSmol_spinner.gif",
    script: `load cif::${base}mediafiles/${material.files.cif_for_jsmol} {555 ${4 + a}${4 + b}${4 + c} -1};${JSMOL_STYLE}`
  };
  getEl("jsmol-root").innerHTML = Jmol.getAppletHtml("myJmol", info);
  return true;
}

window.jsmolLoadRange = function () {
  const read = (id) => getEl(id)?.value ?? "";
  const values = ["jsmol-a", "jsmol-b", "jsmol-c"].map((id) => {
    const raw = read(id).trim();
    return raw === "" ? 1 : parseInt(raw, 10);
  });
  if (values.some((v) => Number.isNaN(v) || v < 1 || v > 5)) {
    alert("Please enter numbers between 1 and 5");
    return;
  }
  renderJsmol(state.currentMaterial, values[0], values[1], values[2]);
};

window.jsmolSaveImage = function () {
  if (typeof Jmol === "undefined" || !window.myJmol) return;
  Jmol.script(window.myJmol, `write image 1920 1080 jpeg ${state.currentMaterial?.name || "structure"}.jpg`);
};

function jsmolControls() {
  const field = (id, label) => `<div class="flex items-center mr-4"><label for="${id}" class="font-bold text-gray-600 pr-2">${label}</label><input id="${id}" type="text" placeholder="2" class="w-16 appearance-none bg-gray-200 text-gray-700 border border-gray-300 rounded py-1 px-2 leading-tight focus:outline-none focus:bg-white"></div>`;
  return `<div class="divide-y mt-4"><div class="py-3"><button onclick="jsmolSaveImage()" type="button" class="transition-colors duration-200 ease-out bg-gray-400 hover:bg-gray-500 text-gray-800 py-1 px-3 rounded shadow focus:outline-none">Save image (JPEG)</button></div><div class="pt-3"><p class="py-2 text-sm text-gray-700">User Cell Range (natural numbers 1-5):</p><div class="flex flex-wrap items-center">${field("jsmol-a", "A")}${field("jsmol-b", "B")}${field("jsmol-c", "C")}<button onclick="jsmolLoadRange()" type="button" class="bg-teal-500 hover:bg-teal-700 text-white text-sm py-1 px-3 rounded shadow focus:outline-none">Load Range</button></div></div></div>`;
}

const LAYER_LEGEND = [
  { color: "text-pink-500", label: "Si" },
  { color: "text-red-500", label: "O" },
  { color: "text-blue-600", label: "OH/O<sup>-</sup>" },
];

async function renderLayerType(slug, superseded = () => false) {
  const lt = await loadJson(`${state.dataBase}/layer-types/${slug}.json`);
  if (superseded()) return;
  // Rows, labels and decimal scales mirror lt.html and the LayerType field definitions.
  const rows = [
    ["Q<sup>3</sup>:Q<sup>4</sup>", `1 : ${fixed(lt.ratio_q3q4, 2)}`],
    ["Si:O", `1 : ${lt.ratio_sio ?? "n/a"}`],
    ["Composition", `Si<sub>${fixed(lt.composition_si, 0)}</sub>O<sub>${fixed(lt.composition_o, 0)}</sub>`],
    ["Thickness", `${fixed(lt.thickness, 1)} Å`],
    ["Layer charge", `${fixed(lt.layer_charge, 3)} z/Å<sup>2</sup>`],
    ["d<sub>OH...OH</sub>", `${fixed(lt.d_oh_oh, 1)} Å`],
  ];
  const table = `<table class="table-fixed w-full text-sm text-gray-700"><tbody>${rows.map(([label, value], i) => `<tr class="${i % 2 ? "bg-gray-100 hover:bg-gray-200" : "hover:bg-gray-100"} border-b border-gray-100"><td class="w-1/2 p-2 font-bold">${label}</td><td class="p-2">${value}</td></tr>`).join("")}</tbody></table>`;
  const legend = `<div class="flex flex-wrap mt-3 px-1 text-sm">${LAYER_LEGEND.map((x) => `<div class="mr-4">${icon("circle", x.color + " p-1")}<span class="text-gray-700">${x.label}</span></div>`).join("")}</div>`;
  const plot = lt.plot
    ? `<img class="object-scale-down max-w-full mx-auto" loading="lazy" decoding="async" src="./mediafiles/${escapeHtml(lt.plot)}" alt="${escapeHtml(lt.name)} layer">`
    : noData();
  // lt.html heads the data block "General" and the material grid "Hydrous Layer
  // Silicates"; it listed HLS only, so related materials get their own group.
  const hls = lt.materials.filter((m) => !m.is_related_material);
  const related = lt.materials.filter((m) => m.is_related_material);
  const group = (items, heading, color) => items.length
    ? `<div class="mb-2 px-1 text-lg font-bold text-gray-800">${heading}</div><div class="flex flex-wrap mb-4">${items.map((m) => renderButtonCard(m, color)).join("")}</div>`
    : "";
  const content = `<div class="mb-2 px-1 text-lg font-bold text-gray-800">General</div><div class="md:flex md:space-x-4"><div class="md:w-1/2 bg-white border border-gray-300 rounded-lg p-4 shadow-sm mb-4">${table}${legend}</div><div class="md:w-1/2 bg-white border border-gray-300 rounded-lg p-4 shadow-sm mb-4 flex items-center justify-center">${plot}</div></div>${group(hls, "Hydrous Layer Silicates", "green")}${group(related, "Related Materials", "orange")}`;
  getEl("app").innerHTML = renderSection(`${lt.name} layer`, "yellow", content);
}

const MATERIAL_TABS = ['general', 'pp', 'refs', 'facs', 'plots', 'ir', 'cif'];

// The powder pattern and IR spectrum live in their own files and are fetched the
// first time their tab is opened, so a material page no longer downloads up to
// 1.9 MB of points nobody has asked to see.
async function ensureSeriesChart(kind, canvasId, render) {
  const m = state.currentMaterial;
  if (!m || state.seriesLoaded[kind]) return;
  state.seriesLoaded[kind] = true;
  const target = getEl(canvasId);
  if (!target) return;
  try {
    render(await loadJson(`${state.dataBase}/materials/${m.slug}.${kind}.json`));
  } catch (e) {
    const wrap = target.closest(".chart-wrap") || target.parentElement;
    if (wrap) wrap.innerHTML = noData("Could not load this data");
  }
}

window.switchTab = function(tabName, updateUrl = true) {
  if (!MATERIAL_TABS.includes(tabName)) return;
  MATERIAL_TABS.forEach(t => {
    const btn = getEl(`btn-tab-${t}`); const content = getEl(`tab-${t}`);
    if (!btn || !content) return;
    if (t === tabName) { content.classList.remove('hidden'); btn.classList.add('bg-blue-500', 'text-white', 'shadow-inner'); btn.classList.remove('text-gray-600', 'hover:bg-gray-100'); if (t === 'plots' && !state.jsmolLoaded) { state.jsmolLoaded = renderJsmol(state.currentMaterial); }
      if (t === 'pp') ensureSeriesChart('powder_pattern', 'powder-chart', renderPowderChart);
      if (t === 'ir') ensureSeriesChart('atr_ir_spectrum', 'ir-chart', renderIrChart); }
    else {
      content.classList.add('hidden');
      btn.classList.remove('bg-blue-500', 'text-white', 'shadow-inner');
      // Restore the muted tone for tabs with nothing in them, which the active
      // state had overridden.
      const empty = btn.dataset.empty === '1';
      btn.classList.remove(empty ? 'text-gray-600' : 'text-gray-400');
      btn.classList.add(empty ? 'text-gray-400' : 'text-gray-600', 'hover:bg-gray-100');
    }
  });
  if (!updateUrl) return;
  // replaceState, not pushState: the tab stays shareable and survives reload
  // without burying the previous page under one history entry per tab click.
  const parts = (window.location.hash || '#/').slice(2).split('/');
  if (parts[1] && (parts[0] === 'hls' || parts[0] === 'rm')) {
    const suffix = tabName === 'general' ? '' : `/${tabName}`;
    history.replaceState(null, '', `#/${parts[0]}/${parts[1]}${suffix}`);
  }
};

async function renderMaterial(type, slug, tab, superseded = () => false) {
  const m = await loadJson(`${state.dataBase}/materials/${slug}.json`), color = type === "rm" ? "orange" : "green";
  if (superseded()) return;
  state.currentMaterial = m; state.jsmolLoaded = false;
  // The button is a flex box so its label is centred by the box, not by the font
  // baseline — half-leading otherwise left the text 1px above centre. &nbsp; keeps
  // the gap between label and value, which a plain space would collapse in flex.
  const ltHtml = m.layer_type?.slug ? `<a href="#/lt/${m.layer_type.slug}" class="flex items-center"><button class="bg-yellow-400 hover:bg-yellow-500 text-gray-800 w-32 p-1 rounded flex items-center justify-center"><span>layer&nbsp;type:&nbsp;</span><span class="font-bold underline">${m.layer_type.name}</span></button></a>` : "";
  // Labels verbatim from hls.html — do not shorten or re-case them. `has` marks
  // the tab in the bar, so an absent CIF or structure is visible without having
  // to open the tab to find out. The muted tone carries that on its own; do not
  // append a "(none)" label to say the same thing again in words. data-empty is
  // still needed - switchTab reads it to restore the tone after a tab was active.
  const tabs = [
    { id: 'general', label: 'General', has: true },
    { id: 'pp', label: 'Powder Pattern', has: !!m.has_powder_pattern },
    { id: 'refs', label: 'List of Reflections', has: !!m.reflections.length },
    { id: 'facs', label: 'Fractional Atomic Coordinates', has: !!m.fractional_atomic_coordinates.length },
    { id: 'plots', label: 'Structure Plots', has: !!(m.files?.cif_for_jsmol || m.files?.structure_plot) },
    { id: 'ir', label: 'ATR-FTIR spectrum', has: !!m.has_atr_ir_spectrum },
    { id: 'cif', label: 'CIF', has: !!m.files?.cif },
  ];
  const content = `<div id="material-tabs-container" class="w-full"><div class="flex flex-wrap border-b border-gray-300 mb-4 bg-white rounded-t overflow-hidden">${tabs.map(t => `<button id="btn-tab-${t.id}" onclick="switchTab('${t.id}')"${t.has ? "" : ` data-empty="1" title="No data available for this material"`} class="${t.id === 'general' ? 'bg-blue-500 text-white shadow-inner' : (t.has ? 'text-gray-600' : 'text-gray-400') + ' hover:bg-gray-100'} px-3 md:px-4 py-2 text-xs md:text-sm font-bold focus:outline-none tracking-wider transition-all border-r border-gray-200">${t.label}</button>`).join("")}</div><div id="tab-general" class="space-y-4">${helpBlock("general")}<div class="bg-white p-4 border rounded shadow-sm"><p class="text-lg font-bold tracking-wide mb-2 text-gray-700">Synthesis</p>${m.synthesis.map(s => `<table class="table-fixed w-full text-sm mb-4 text-gray-700 border-collapse border border-gray-100"><tbody>${s.comment ? `<tr class="hover:bg-gray-100 border-b border-gray-100"><td class="w-1/3 p-2 font-bold">Comment</td><td class="p-2">${s.comment}</td></tr>` : ""}<tr class="bg-gray-100 hover:bg-gray-200 border-b border-gray-100"><td class="w-1/3 p-2 font-bold">Mixture</td><td class="p-2">${s.mixture || "-"}</td></tr><tr class="hover:bg-gray-100 border-b border-gray-100"><td class="p-2 font-bold">SDA</td><td class="p-2">${s.sda || "-"}</td></tr><tr class="bg-gray-100 hover:bg-gray-200 border-b border-gray-100"><td class="p-2 font-bold">Temperature</td><td class="p-2">${s.temperature ? s.temperature.toFixed(2) + ' °C' : 'n/a'}</td></tr><tr class="hover:bg-gray-100 border-b border-gray-100"><td class="p-2 font-bold">Duration</td><td class="p-2">${s.duration || 'n/a'}</td></tr><tr class="bg-gray-100 hover:bg-gray-200 border-b border-gray-100"><td class="p-2 font-bold">Conditions</td><td class="p-2">${s.conditions || 'n/a'}</td></tr><tr class="hover:bg-gray-100"><td class="p-2 font-bold">Reference</td><td class="p-2"><p class="text-sm text-gray-600 items-center">${icon("users", "text-purple-400 p-1")} ${formatAuthorList(s.reference?.authors)} (<b>${s.reference?.year || ""}</b>):</p><div class="text-gray-800 font-bold"><a href="${escapeHtml(s.reference?.doi || '#')}" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">${s.reference?.title || ""}.</a></div><p class="text-gray-700 text-sm">${s.reference?.journal?.name || ""}, Volume ${s.reference?.volume || ""}, Issue ${s.reference?.issue || ""}, Pages ${s.reference?.pages || ""}.</p></td></tr></tbody></table>`).join("")}</div><div class="bg-white p-4 border rounded shadow-sm"><p class="text-lg font-bold tracking-wide mb-2 text-gray-700">Crystal Structure</p>${m.crystal_structure.map(cs => `<table class="table-fixed w-full text-sm border-collapse border border-gray-100 mb-4 text-gray-700"><tbody>${cs.comment ? `<tr class="font-bold hover:bg-gray-100 border-b border-gray-100"><td class="w-1/3 p-2">Comment</td><td class="p-2">${cs.comment}</td></tr>` : ""}<tr class="bg-gray-100 hover:bg-gray-200 border-b border-gray-100"><td class="w-1/3 p-2 font-bold">Structurally related materials</td><td class="p-2">${m.similar_structure.length ? m.similar_structure.map(name => { const link = m.similar_structure_known[name]; return link ? `<a href="${getHash({ slug: link.slug, is_related_material: link.is_related_material })}" class="transition-colors duration-200 ease-out inline-block bg-green-400 hover:bg-green-500 text-gray-800 h-8 py-1 px-2 rounded mx-1 shadow focus:outline-none">${name}</a>` : `<span class="inline-block bg-gray-300 text-gray-800 h-8 py-1 px-2 rounded mx-1 shadow">${name}</span>`; }).join("") : "None"}</td></tr><tr class="border-b border-gray-200 hover:bg-gray-100"><td class="p-2 font-bold text-gray-600">Chemical composition per unit cell</td><td class="p-2">${cs.chemical_composition || "-"}</td></tr><tr class="bg-gray-100 border-b border-gray-200 hover:bg-gray-200"><td class="p-2 font-bold text-gray-600">Lattice parameters of the 2D cell of the layer</td><td class="p-2 text-xs">${(cs.lp_2d_cell || []).length ? `<ul class="list-disc list-inside">${cs.lp_2d_cell.map(lp => `<li>${lp}</li>`).join("")}</ul>` : noDataCell()}</td></tr><tr class="border-b border-gray-200 hover:bg-gray-100"><td class="p-2 font-bold text-gray-600">Lattice parameters related to the stacking direction</td><td class="p-2 text-xs">${(cs.lp_stacking_direction || []).length ? `<ul class="list-disc list-inside">${cs.lp_stacking_direction.map(lp => `<li>${lp}</li>`).join("")}</ul>` : noDataCell()}</td></tr><tr class="bg-gray-100 border-b border-gray-200 hover:bg-gray-200"><td class="p-2 font-bold text-gray-600">Space group</td><td class="p-2 font-bold italic text-blue-800">${cs.space_group?.symbol_short || "-"}</td></tr><tr class="border-b border-gray-200 hover:bg-gray-100"><td class="p-2 font-bold text-gray-600">XRD reflections representing the 2D cell of the layer</td><td class="p-2 font-mono text-xs"><ul class="list-disc list-inside">${m.reflection_layer_cell.map(r => `<li>(${r.h}${r.k}${r.l}) = ${r.two_theta} °</li>`).join("")}</ul></td></tr><tr class="bg-gray-100 border-b border-gray-200 hover:bg-gray-200"><td class="p-2 font-bold text-gray-600">XRD reflections representing the layer-layer distance</td><td class="p-2 font-mono text-xs"><ul class="list-disc list-inside">${m.reflection_layer_layer.map(r => `<li>(${r.h}${r.k}${r.l}) = ${r.two_theta} °</li>`).join("")}</ul></td></tr><tr class="hover:bg-gray-100"><td class="p-2 font-bold text-gray-600">Reference</td><td class="p-2"><p class="text-sm text-gray-600 items-center">${icon("users", "text-purple-400 p-1")} ${formatAuthorList(cs.reference?.authors)} (<b>${cs.reference?.year || ""}</b>):</p><div class="text-gray-800 font-bold"><a href="${escapeHtml(cs.reference?.doi || '#')}" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">${cs.reference?.title || ""}.</a></div><p class="text-gray-700 text-sm">${cs.reference?.journal?.name || ""}, Volume ${cs.reference?.volume || ""}, Issue ${cs.reference?.issue || ""}, Pages ${cs.reference?.pages || ""}.</p></td></tr></tbody></table>`).join("")}</div><div class="bg-white p-4 border rounded shadow-sm"><p class="text-lg font-bold tracking-wide mb-2 text-gray-700">Properties</p>${m.properties.map(p => `<table class="table-fixed w-full text-sm border-collapse border border-gray-100 text-gray-700"><tbody>${p.comment ? `<tr class="hover:bg-gray-100 border-b border-gray-100"><td class="w-1/3 p-2 font-bold">Comment</td><td class="p-2">${p.comment}</td></tr>` : ""}<tr class="bg-gray-100 hover:bg-gray-200 border-b border-gray-100"><td class="w-1/3 p-2 font-bold">Density (calculated)</td><td class="p-2 font-mono">${p.density_calculated ? p.density_calculated.toFixed(3) + ' g/cm³' : 'n/a'}</td></tr><tr class="hover:bg-gray-100"><td class="p-2 font-bold">Condensation product</td><td class="p-2">${p.condensation_product || "-"}</td></tr></tbody></table>`).join("")}</div></div><div id="tab-pp" class="bg-white p-4 border rounded shadow-sm hidden">${helpBlock("pp")}${m.has_powder_pattern ? `<div class="chart-wrap"><canvas id="powder-chart"></canvas></div><div id="powder-chart-controls"></div>` : noData("No powder pattern available for this material")}</div><div id="tab-refs" class="bg-white p-2 border rounded shadow-sm overflow-x-auto hidden">${helpBlock("refs")}${m.reflections.length ? `<table class="table-fixed w-full text-sm text-gray-700"><thead><tr><th class="w-1/12 p-2">h</th><th class="w-1/12 p-2">k</th><th class="w-1/12 p-2">l</th><th class="w-1/12 p-2">M</th><th class="w-2/12 p-2 text-right">2θ</th><th class="w-2/12 p-2 text-right">Icalc</th><th class="w-2/12 p-2 text-right">d-hkl</th></tr></thead><tbody class="text-right">${m.reflections.map(r => `<tr class="hover:bg-gray-100"><td class="text-center p-2">${r.h}</td><td class="text-center p-2">${r.k}</td><td class="text-center p-2">${r.l}</td><td class="text-center p-2">${r.m || ""}</td><td class="p-2">${r.two_theta}</td><td class="p-2">${r.intensity_calculated}</td><td class="p-2">${Number(r.d_hkl).toFixed(3)}</td></tr>`).join("")}</tbody></table>` : noData("No reflection list available for this material")}</div><div id="tab-facs" class="bg-white p-2 border rounded shadow-sm overflow-x-auto hidden text-gray-700">${helpBlock("facs")}${m.fractional_atomic_coordinates.length ? `<table class="table-fixed w-full text-center"><thead><tr><th class="w-1/6 p-2 text-left">Atom</th><th class="w-1/6 p-2">x</th><th class="w-1/6 p-2">y</th><th class="w-1/6 p-2">z</th><th class="w-1/6 p-2">Biso</th><th class="w-1/6 p-2">Occ.</th></tr></thead><tbody>${m.fractional_atomic_coordinates.map(f => `<tr class="hover:bg-gray-100"><td class="text-left p-2 font-bold">${f.atom}</td><td class="p-2">${f.x}</td><td class="p-2">${f.y}</td><td class="p-2">${f.z}</td><td class="p-2">${f.b_iso || "-"}</td><td class="p-2">${f.occupy}</td></tr>`).join("")}</tbody></table>` : noData("No fractional atomic coordinates available for this material")}</div><div id="tab-plots" class="space-y-4 hidden"><div class="bg-white p-4 border rounded shadow-sm">${helpBlock("plots")}${m.files?.cif_for_jsmol ? `<div id="jsmol-root" class="w-full bg-black rounded shadow-inner"></div>${jsmolControls()}` : noData("No 3D representation available")}</div><div class="bg-white p-4 border rounded shadow-sm text-center">${m.files?.structure_plot ? `<img class="max-w-full mx-auto" loading="lazy" decoding="async" src="./mediafiles/${escapeHtml(m.files.structure_plot)}" alt="Structure plot of ${escapeHtml(m.name)}">` : noData("No structure plot available for this material")}</div></div><div id="tab-ir" class="bg-white p-4 border rounded shadow-sm hidden">${helpBlock("ir")}${m.has_atr_ir_spectrum ? `<div class="chart-wrap"><canvas id="ir-chart"></canvas></div><div id="ir-chart-controls"></div>` : noData("No ATR-FTIR spectrum available for this material")}</div><div id="tab-cif" class="bg-white p-4 border rounded shadow-sm text-center hidden">${helpBlock("cif")}${m.files?.cif ? `<div class="flex mx-auto justify-center py-5 text-gray-900">${icon("download", "mr-2 mt-1")}<a href="./mediafiles/${m.files.cif}" class="font-bold hover:underline" download>Download</a></div>` : noData("No CIF file available for this material")}</div></div>`;
  destroyCharts();
  // Layer type in the centre slot, help toggle stays on the right.
  getEl("app").innerHTML = renderSection(m.name, color, content, helpToggle(), ltHtml);
  state.seriesLoaded = {};
  if (tab && tab !== "general") window.switchTab(tab, false);
}

// Restarting a CSS animation needs the class removed, a layout read, then the
// class back; otherwise the browser coalesces it into no change at all.
// Work that must not run inside a view transition: the page is frozen while the
// callback executes and the browser is rasterising snapshots, so building a
// Chart.js scatter of up to 12k points there stalls the animation visibly.
let afterPaintQueue = [];

function afterPaint(fn) {
  afterPaintQueue.push(fn);
}

function flushAfterPaint() {
  const queue = afterPaintQueue;
  afterPaintQueue = [];
  queue.forEach((fn) => { try { fn(); } catch (e) {} });
}

function applySidebar(app, visible) {
  const sidebar = getEl("search-sidebar");
  if (sidebar) sidebar.style.display = visible ? "" : "none";
  app.classList.toggle("md:w-9/12", visible);
  app.classList.toggle("md:w-full", !visible);
}

function revealApp(app) {
  app.classList.remove("animate-page-enter");
  void app.offsetWidth;
  app.classList.add("animate-page-enter");
}

// Commit a route's DOM changes. Where the browser supports it, the View
// Transitions API snapshots the old and new states and cross-fades them on the
// compositor — which also animates the ~330px width change when the search
// sidebar appears or disappears, instead of merely hiding the jump under a fade.
// Older browsers fall back to the keyframe animation on #app.
async function commitRoute(app, paint) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || typeof document.startViewTransition !== "function") {
    paint();
    if (!reduceMotion) revealApp(app);
    return;
  }
  // The callback must not fetch: the page is frozen until it resolves.
  const transition = document.startViewTransition(paint);
  try {
    await transition.ready;
  } catch (e) {
    // Aborted rather than unsupported — a hidden tab or an overlapping
    // transition. The callback has still applied the DOM change, so fall back to
    // the keyframe animation instead of swapping with no transition at all.
    revealApp(app);
  }
  await transition.finished.catch(() => {});
}

// route() awaits network data, so two quick navigations could interleave and let
// the slower one paint over the newer page. Every run takes a ticket and bails as
// soon as a newer one has started.
let routeGeneration = 0;

async function route() {
  const gen = ++routeGeneration;
  const superseded = () => gen !== routeGeneration;
  const hash = window.location.hash || "#/", parts = hash.slice(2).split("/"), first = parts[0] || "", app = getEl("app");
  if (!app) return;
  app.setAttribute("aria-busy", "true");
  const withSidebar = !first || first === "search";
  try {
    document.querySelectorAll("nav a[data-nav]").forEach(a => {
      const nav = a.getAttribute("data-nav");
      if (nav === first || (nav === "" && (first === "search" || first === "hls" || first === "rm" || first === "lt"))) { a.classList.add("text-gray-200", "border-blue-500"); a.classList.remove("text-gray-500", "border-transparent"); }
      else { a.classList.remove("text-gray-200", "border-blue-500"); a.classList.add("text-gray-500", "border-transparent"); }
    });
    // Fetch before the transition begins; inside it the page is frozen and the
    // render's own loadJson call then resolves straight from the cache.
    const dataUrl = routeDataUrl(first, parts);
    if (dataUrl) await loadJson(dataUrl).catch(() => {});
    if (superseded()) return;

    await commitRoute(app, () => {
      let rendered;
      if (!first || first === "search") renderList();
      // parts[2] carries the tab, so #/hls/slug/pp is shareable and survives reload
      else if (first === "hls" && parts[1]) rendered = renderMaterial("hls", parts[1], parts[2], superseded);
      else if (first === "rm" && parts[1]) rendered = renderMaterial("rm", parts[1], parts[2], superseded);
      else if (first === "lt" && parts[1]) rendered = renderLayerType(parts[1], superseded);
      else if (first === "list") renderSimpleList();
      else if (first === "table") renderTable();
      else if (first === "overview") renderOverview();
      else if (first === "information") renderInformation();
      else if (first === "references") renderReferences();
      else if (first === "howtocite") renderHowToCite();
      else if (first === "contact") renderContact();
      else app.innerHTML = "<h1 class='text-2xl font-bold p-4 text-gray-800'>Not Found</h1>";
      // renderMaterial and renderLayerType are async; returning their promise
      // makes the transition wait for the DOM write. Their data is already
      // cached, so this settles in a microtask rather than over the network.
      return Promise.resolve(rendered).then(() => {
        // Applied with the swap, never before it: hiding the sidebar widens #app
        // by ~330px, and doing that while the previous page was still on screen
        // made the outgoing content jump sideways ahead of the transition.
        applySidebar(app, withSidebar);
        // Opening a material from halfway down a long list should start at the top.
        window.scrollTo(0, 0);
      });
    });
    flushAfterPaint();
  } finally {
    app.removeAttribute("aria-busy");
  }
}

function bindEvents() {
  const ni = getEl("search-name"), rb = getEl("search-reset");
  if (ni) ni.addEventListener("input", () => { state.filters.name = ni.value; triggerSearch(); });
  if (rb) rb.addEventListener("click", () => {
    state.filters = { name: "", layerTypes: [], cations: [], crystalSystems: [], a: { min: null, max: null }, b: { min: null, max: null }, c: { min: null, max: null }, peaks: [{ min: null, max: null }, { min: null, max: null }, { min: null, max: null }, { min: null, max: null }] };
    if (ni) ni.value = ""; document.querySelectorAll("input[type=checkbox]").forEach(el => el.checked = false); document.querySelectorAll("input[type=number]").forEach(el => el.value = "");
    window.location.hash = "#/"; renderList();
  });
  window.addEventListener("hashchange", () => { route().catch((error) => { if (getEl("app")) getEl("app").innerHTML = `<pre class="p-4 text-red-600 bg-red-100 rounded">${escapeHtml(error.message)}</pre>`; }); });
}

async function bootstrap() {
  if (window.location.protocol === "file:") throw new Error("Local file mode is unsupported. Serve static_site/site via HTTP.");
  await loadCoreData(); initFilters(); bindEvents(); await route();
}
bootstrap().catch((error) => { const app = getEl("app"); if (app) app.innerHTML = `<pre class="p-4 text-red-600 bg-red-100 rounded">${escapeHtml(error.message)}</pre>`; });
