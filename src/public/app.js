const state = {
  symbol: "BTC",
  expiry: "",
  instruments: [],
  summary: null,
  strikeRows: [],
  termRows: [],
};

const els = {
  symbolTabs: document.querySelector("#symbolTabs"),
  expirySelect: document.querySelector("#expirySelect"),
  refreshButton: document.querySelector("#refreshButton"),
  csvButton: document.querySelector("#csvButton"),
  metricGrid: document.querySelector("#dashboard"),
  snapshotMeta: document.querySelector("#snapshotMeta"),
  strikeChart: document.querySelector("#strikeChart"),
  termChart: document.querySelector("#termChart"),
  signalState: document.querySelector("#signalState"),
  riskCopy: document.querySelector("#riskCopy"),
  healthTable: document.querySelector("#healthTable"),
  notesList: document.querySelector("#notesList"),
  noteButton: document.querySelector("#noteButton"),
};

const formatters = {
  compact: new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }),
  price: new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
  }),
};

init().catch((error) => renderError(error));

async function init() {
  const { instruments } = await api("/api/instruments");
  state.instruments = instruments;
  renderSymbolTabs();
  bindEvents();
  await loadDashboard();
}

function bindEvents() {
  els.expirySelect.addEventListener("change", async (event) => {
    state.expiry = event.target.value;
    await loadStrikeRows();
  });
  els.refreshButton.addEventListener("click", loadDashboard);
  els.csvButton.addEventListener("click", exportCsv);
  els.noteButton.addEventListener("click", addNote);
}

function renderSymbolTabs() {
  els.symbolTabs.replaceChildren(
    ...state.instruments.map((instrument) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = instrument.symbol;
      button.className = instrument.symbol === state.symbol ? "active" : "";
      button.addEventListener("click", async () => {
        state.symbol = instrument.symbol;
        state.expiry = "";
        renderSymbolTabs();
        await loadDashboard();
      });
      return button;
    }),
  );
}

async function loadDashboard() {
  const [summary, byStrike, term, health] = await Promise.all([
    api(`/api/gex/summary?symbol=${state.symbol}`),
    api(`/api/gex/by-strike?symbol=${state.symbol}`),
    api(`/api/gex/term-structure?symbol=${state.symbol}`),
    api("/api/data-health"),
  ]);

  state.summary = summary;
  state.strikeRows = byStrike.rows;
  state.termRows = term.rows;
  renderMetrics(summary);
  renderExpirySelect(byStrike.rows);
  renderStrikeChart(byStrike.rows, byStrike.markers, summary.spotPrice);
  renderTermChart(term.rows);
  renderSignal(summary);
  renderHealth(health);
  renderNotes();
}

async function loadStrikeRows() {
  const byStrike = await api(
    `/api/gex/by-strike?symbol=${state.symbol}${state.expiry ? `&expiry=${state.expiry}` : ""}`,
  );
  state.strikeRows = byStrike.rows;
  renderStrikeChart(byStrike.rows, byStrike.markers, state.summary.spotPrice);
}

function renderMetrics(summary) {
  const metrics = [
    ["Net GEX", money(summary.netGex), summary.signalState.regime],
    ["Gamma Flip", price(summary.gammaFlip), "Flip level"],
    ["Call Wall", price(summary.callWall), "Dealer resistance"],
    ["Put Wall", price(summary.putWall), "Dealer support"],
    ["Net Delta", formatters.compact.format(summary.netDelta), "Signed OI delta"],
    ["Open Interest", formatters.compact.format(summary.totalOpenInterest), "Contracts"],
  ];

  els.metricGrid.replaceChildren(
    ...metrics.map(([label, value, caption]) => {
      const card = document.createElement("article");
      card.className = "metric-card";
      card.innerHTML = `<span>${label}</span><strong>${value}</strong><small>${caption}</small>`;
      return card;
    }),
  );

  els.snapshotMeta.textContent = `${summary.symbol} spot ${price(summary.spotPrice)} | Snapshot ${new Date(
    summary.asOf,
  ).toUTCString()}`;
}

function renderExpirySelect(rows) {
  const expiries = [...new Set(rows.map((row) => row.expiry))];
  els.expirySelect.replaceChildren(
    option("", "All expiries"),
    ...expiries.map((expiry) => option(expiry, expiry)),
  );
  els.expirySelect.value = state.expiry;
}

function renderStrikeChart(rows, markers, spotPrice) {
  const width = 960;
  const height = 430;
  const pad = { top: 38, right: 24, bottom: 44, left: 70 };
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.gex)), 1);
  const minStrike = Math.min(...rows.map((row) => row.strike), markers.putWall, spotPrice);
  const maxStrike = Math.max(...rows.map((row) => row.strike), markers.callWall, spotPrice);
  const zeroY = y(0);

  els.strikeChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.strikeChart.replaceChildren();
  addGrid(els.strikeChart, width, height, pad, maxAbs);

  rows.forEach((row) => {
    const barWidth = Math.max(8, (width - pad.left - pad.right) / rows.length - 10);
    const xPos = x(row.strike) - barWidth / 2;
    const yPos = row.gex >= 0 ? y(row.gex) : zeroY;
    const barHeight = Math.abs(y(row.gex) - zeroY);
    rect(els.strikeChart, xPos, yPos, barWidth, barHeight, row.gex >= 0 ? "#42d77d" : "#ff5b63");
    label(els.strikeChart, x(row.strike) - 18, height - 14, formatStrike(row.strike), "label");
  });

  marker(markers.gammaFlip, "Gamma Flip", "#e7eef6");
  marker(markers.callWall, "Call Wall", "#ad6cff");
  marker(markers.putWall, "Put Wall", "#f3ca35");
  marker(spotPrice, "Spot", "#36c5e8");

  function x(strike) {
    const usable = width - pad.left - pad.right;
    return pad.left + ((strike - minStrike) / (maxStrike - minStrike || 1)) * usable;
  }

  function y(value) {
    const usable = height - pad.top - pad.bottom;
    return pad.top + ((maxAbs - value) / (maxAbs * 2 || 1)) * usable;
  }

  function marker(value, text, color) {
    const pos = x(value);
    line(els.strikeChart, pos, pad.top - 8, pos, height - pad.bottom, color, "4 4");
    label(els.strikeChart, pos + 5, pad.top - 15, `${text} ${formatStrike(value)}`, "marker-label", color);
  }
}

function renderTermChart(rows) {
  const width = 620;
  const height = 260;
  const pad = { top: 20, right: 24, bottom: 48, left: 64 };
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.gex)), 1);
  const step = (width - pad.left - pad.right) / rows.length;
  const zeroY = y(0);

  els.termChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.termChart.replaceChildren();
  addGrid(els.termChart, width, height, pad, maxAbs);

  rows.forEach((row, index) => {
    const xPos = pad.left + index * step + step * 0.25;
    const yPos = row.gex >= 0 ? y(row.gex) : zeroY;
    const barHeight = Math.abs(y(row.gex) - zeroY);
    rect(els.termChart, xPos, yPos, step * 0.5, barHeight, row.gex >= 0 ? "#35c9bd" : "#ff5b63");
    label(els.termChart, xPos - 6, height - 18, row.expiry.slice(5), "label");
  });

  function y(value) {
    const usable = height - pad.top - pad.bottom;
    return pad.top + ((maxAbs - value) / (maxAbs * 2 || 1)) * usable;
  }
}

function renderSignal(summary) {
  const regime = summary.signalState.regime.replace("_", " ");
  els.signalState.innerHTML = `
    <strong>${titleCase(regime)}</strong>
    <span>${summary.signalState.primaryRisk.replaceAll("_", " ")} | ${summary.signalState.flipDistancePct}% from flip</span>
  `;
  els.riskCopy.innerHTML = `
    <p>Negative gamma regimes can amplify spot moves because dealer hedging tends to chase direction. Positive gamma regimes can dampen realized volatility near large walls.</p>
    <p>Key levels: gamma flip ${price(summary.gammaFlip)}, call wall ${price(summary.callWall)}, put wall ${price(summary.putWall)}, max pain ${price(summary.maxPainStrike)}.</p>
  `;
}

function renderHealth(health) {
  const rows = health.sources
    .map(
      (source) => `
        <tr>
          <td>${source.name}</td>
          <td>${source.status}</td>
          <td>${source.lastSnapshotAt}</td>
          <td>${source.limitation}</td>
        </tr>
      `,
    )
    .join("");
  els.healthTable.innerHTML = `
    <table class="health-table">
      <thead><tr><th>Source</th><th>Status</th><th>Last Update</th><th>Limitation</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderNotes() {
  const notes = [
    ["BTC GEX update", "Gamma flip is close to spot; watch whether price accepts above the call wall."],
    ["Wall shift observation", "OI concentration remains strongest at put wall and call wall anchors."],
    ["Weekend outlook", "Use negative gamma states as a risk flag, not a standalone trade signal."],
  ];
  els.notesList.replaceChildren(
    ...notes.map(([title, body]) => {
      const node = document.createElement("article");
      node.className = "note";
      node.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
      return node;
    }),
  );
}

function addNote() {
  const note = document.createElement("article");
  note.className = "note";
  note.innerHTML = `<strong>${state.symbol} manual note</strong><span>Review ${state.symbol} gamma flip and wall acceptance before the next snapshot.</span>`;
  els.notesList.prepend(note);
}

function exportCsv() {
  const header = "expiry,strike,gex,callGex,putGex,openInterest,volume";
  const body = state.strikeRows
    .map((row) =>
      [row.expiry, row.strike, row.gex, row.callGex, row.putGex, row.openInterest, row.volume].join(","),
    )
    .join("\n");
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.symbol}-gex-by-strike.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function api(path) {
  const response = await fetch(path);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${path}`);
  }
  return payload;
}

function renderError(error) {
  document.body.innerHTML = `<main class="panel" style="margin: 2rem"><h1>Unable to load GEX dashboard</h1><p>${error.message}</p></main>`;
}

function option(value, label) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

function addGrid(svg, width, height, pad, maxAbs) {
  const ticks = [-1, -0.5, 0, 0.5, 1];
  ticks.forEach((tick) => {
    const value = tick * maxAbs;
    const yPos = pad.top + ((maxAbs - value) / (maxAbs * 2 || 1)) * (height - pad.top - pad.bottom);
    line(svg, pad.left, yPos, width - pad.right, yPos, "#304253", "3 5", "grid-line");
    label(svg, 12, yPos + 4, money(value), "label");
  });
  line(svg, pad.left, pad.top, pad.left, height - pad.bottom, "#304253", "", "axis");
  line(svg, pad.left, height - pad.bottom, width - pad.right, height - pad.bottom, "#304253", "", "axis");
}

function rect(svg, x, y, width, height, fill) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("width", width);
  node.setAttribute("height", Math.max(height, 1));
  node.setAttribute("fill", fill);
  node.setAttribute("rx", "2");
  svg.append(node);
}

function line(svg, x1, y1, x2, y2, stroke, dash = "", className = "marker-line") {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "line");
  node.setAttribute("x1", x1);
  node.setAttribute("y1", y1);
  node.setAttribute("x2", x2);
  node.setAttribute("y2", y2);
  node.setAttribute("stroke", stroke);
  node.setAttribute("class", className);
  if (dash) node.setAttribute("stroke-dasharray", dash);
  svg.append(node);
}

function label(svg, x, y, text, className, fill = "") {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("class", className);
  if (fill) node.setAttribute("fill", fill);
  node.textContent = text;
  svg.append(node);
}

function money(value) {
  const prefix = value < 0 ? "-$" : "$";
  return `${prefix}${formatters.compact.format(Math.abs(value))}`;
}

function price(value) {
  return formatters.price.format(value);
}

function formatStrike(value) {
  return value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
