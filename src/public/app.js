const state = {
  page: "dashboard",
  symbol: "BTC",
  expiry: "",
  mode: "snapshot",
  category: "now",
  coverage: 50,
  zoom: 7,
  live: true,
  termView: "chart",
  timeIndex: 23,
  instruments: [],
  dashboard: null,
  studio: null,
  health: null,
  notes: [
    ["BTC regime watch", "Spot is close to the flip boundary; confirm acceptance before treating resistance as support."],
    ["Wall shift observation", "Positive peaks are clustered just above index, so intraday pullbacks may mean revert while GEX stays positive."],
    ["Risk reminder", "GEX is a positioning estimate. Validate with liquidity, funding, volatility, and event context."],
  ],
};

const els = {
  productLabel: document.querySelector("#productLabel"),
  productSwitchButton: document.querySelector("#productSwitchButton"),
  productMenu: document.querySelector("#productMenu"),
  ctxTrigger: document.querySelector("#ctxTrigger"),
  ctxPillSymbol: document.querySelector("#ctxPillSymbol"),
  ctxPillMeta: document.querySelector("#ctxPillMeta"),
  ctxModal: document.querySelector("#ctxModal"),
  ctxAssetList: document.querySelector("#ctxAssetList"),
  ctxExpiryList: document.querySelector("#ctxExpiryList"),
  primaryNav: document.querySelector(".primary-nav"),
  symbolTabs: document.querySelector("#symbolTabs"),
  expirySelect: document.querySelector("#expirySelect"),
  refreshButton: document.querySelector("#refreshButton"),
  historyInput: document.querySelector("#historyInput"),
  liveToggle: document.querySelector("#liveToggle"),
  indexPrice: document.querySelector("#indexPrice"),
  dataSourceLabel: document.querySelector("#dataSourceLabel"),
  dataTimestamp: document.querySelector("#dataTimestamp"),
  gaugeRow: document.querySelector("#gaugeRow"),
  dashboardSnapshotMeta: document.querySelector("#dashboardSnapshotMeta"),
  dashboardStrikeChart: document.querySelector("#dashboardStrikeChart"),
  dashboardCsvButton: document.querySelector("#dashboardCsvButton"),
  keyLevelsTable: document.querySelector("#keyLevelsTable"),
  trendGrid: document.querySelector("#trendGrid"),
  netHeatmap: document.querySelector("#netHeatmap"),
  absHeatmap: document.querySelector("#absHeatmap"),
  coverageTabs: document.querySelector("#coverageTabs"),
  changeTable: document.querySelector("#changeTable"),
  categoryTabs: document.querySelector("#categoryTabs"),
  modeTabs: document.querySelector("#modeTabs"),
  reachButton: document.querySelector("#reachButton"),
  reachPanel: document.querySelector("#reachPanel"),
  reachRows: document.querySelector("#reachRows"),
  reachComputeButton: document.querySelector("#reachComputeButton"),
  reachStatus: document.querySelector("#reachStatus"),
  chartControlsButton: document.querySelector("#chartControlsButton"),
  chartControlsPanel: document.querySelector("#chartControlsPanel"),
  tmPrevButton: document.querySelector("#tmPrevButton"),
  tmPlayButton: document.querySelector("#tmPlayButton"),
  tmNextButton: document.querySelector("#tmNextButton"),
  tmScrubber: document.querySelector("#tmScrubber"),
  studioCsvButton: document.querySelector("#studioCsvButton"),
  studioTitle: document.querySelector("#studioTitle"),
  studioSnapshotMeta: document.querySelector("#studioSnapshotMeta"),
  studioStrikeChart: document.querySelector("#studioStrikeChart"),
  summaryRail: document.querySelector("#summaryRail"),
  markerChips: document.querySelector("#markerChips"),
  zoomSlider: document.querySelector("#zoomSlider"),
  zoomValue: document.querySelector("#zoomValue"),
  strikesChart: document.querySelector("#strikesChart"),
  termChart: document.querySelector("#termChart"),
  termViewToggle: document.querySelector("#termViewToggle"),
  termTable: document.querySelector("#termTable"),
  signalState: document.querySelector("#signalState"),
  riskCopy: document.querySelector("#riskCopy"),
  noteButton: document.querySelector("#noteButton"),
  notesList: document.querySelector("#notesList"),
  healthTable: document.querySelector("#healthTable"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  menuButton: document.querySelector("#menuButton"),
  menuPanel: document.querySelector("#menuPanel"),
  helpButton: document.querySelector("#helpButton"),
  helpDrawer: document.querySelector("#helpDrawer"),
};

const formatters = {
  compact: new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }),
  price: new Intl.NumberFormat("en", { maximumFractionDigits: 2 }),
  integer: new Intl.NumberFormat("en", { maximumFractionDigits: 0 }),
};

init().catch(renderError);

async function init() {
  const { instruments } = await api("/api/instruments");
  state.instruments = instruments;
  bindEvents();
  renderSymbolTabs();
  await loadData();
}

function bindEvents() {
  els.primaryNav.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-page]");
    if (!button) return;
    setPage(button.dataset.page);
  });

  document.querySelectorAll("[data-page-jump]").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.pageJump));
  });

  els.expirySelect.addEventListener("change", async (event) => {
    state.expiry = event.target.value;
    await loadStudio();
    renderContextPicker();
    renderStudio();
    renderFocusedCharts();
  });

  els.refreshButton.addEventListener("click", loadData);
  els.ctxTrigger.addEventListener("click", () => openModal(els.ctxModal));
  els.productSwitchButton.addEventListener("click", () => toggleHidden(els.productMenu));
  els.dashboardCsvButton.addEventListener("click", () => exportCsv(state.dashboard?.rows ?? []));
  els.studioCsvButton.addEventListener("click", () => exportCsv(state.studio?.rows ?? []));
  els.settingsButton.addEventListener("click", () => openModal(els.settingsDialog));
  els.menuButton.addEventListener("click", () => toggleHidden(els.menuPanel));
  els.helpButton.addEventListener("click", () => {
    els.menuPanel.hidden = true;
    openModal(els.helpDrawer);
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.closeModal}`).hidden = true;
    });
  });
  document.querySelectorAll("[data-close-popover]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.closePopover}`).hidden = true;
    });
  });

  els.liveToggle.addEventListener("change", (event) => {
    state.live = event.target.checked;
    renderLiveState();
  });

  els.historyInput.addEventListener("input", () => {
    state.timeIndex = Number(els.historyInput.value);
    els.tmScrubber.value = String(state.timeIndex);
    renderLiveState();
  });
  els.tmScrubber.addEventListener("input", () => setTimeIndex(Number(els.tmScrubber.value)));
  els.tmPrevButton.addEventListener("click", () => setTimeIndex(Math.max(0, state.timeIndex - 1)));
  els.tmNextButton.addEventListener("click", () => setTimeIndex(Math.min(23, state.timeIndex + 1)));
  els.tmPlayButton.addEventListener("click", () => {
    state.live = !state.live;
    els.liveToggle.checked = state.live;
    els.tmPlayButton.textContent = state.live ? "Pause" : "Play";
    renderLiveState();
  });

  els.categoryTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    setActiveButton(els.categoryTabs, button);
    renderStudioTitle();
  });

  els.modeTabs.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    setActiveButton(els.modeTabs, button);
    await loadStudio();
    renderStudio();
  });

  els.coverageTabs.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-coverage]");
    if (!button) return;
    state.coverage = Number(button.dataset.coverage);
    setActiveButton(els.coverageTabs, button);
    const table = await api(`/api/gex/change-table?symbol=${state.symbol}&coverage=${state.coverage}`);
    state.dashboard.changeTable = table;
    renderChangeTable(table);
  });
  els.termViewToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-term-view]");
    if (!button) return;
    state.termView = button.dataset.termView;
    setActiveButton(els.termViewToggle, button);
    renderTermMode();
  });
  els.reachButton.addEventListener("click", () => {
    els.reachRows.hidden = true;
    els.reachStatus.textContent = "Press Compute";
    toggleHidden(els.reachPanel);
  });
  els.reachComputeButton.addEventListener("click", () => {
    renderReachPanel();
    els.reachRows.hidden = false;
    els.reachStatus.textContent = "Computed from local fixture volatility";
  });
  els.chartControlsButton.addEventListener("click", () => toggleHidden(els.chartControlsPanel));

  els.zoomSlider.addEventListener("input", (event) => {
    state.zoom = Number(event.target.value);
    els.zoomValue.textContent = `${state.zoom}%`;
    renderStudio();
  });

  els.noteButton.addEventListener("click", () => {
    state.notes.unshift([
      `${state.symbol} manual note`,
      `Review ${state.symbol} flip ${price(state.dashboard.summary.gammaFlip)} and the nearest wall before the next snapshot.`,
    ]);
    renderNotes();
  });
}

async function loadData() {
  const [dashboard, studio, health] = await Promise.all([
    api(`/api/gex/dashboard?symbol=${state.symbol}&coverage=${state.coverage}`),
    api(`/api/gex/studio?symbol=${state.symbol}${state.expiry ? `&expiry=${state.expiry}` : ""}&mode=${state.mode}`),
    api("/api/data-health"),
  ]);
  state.dashboard = dashboard;
  state.studio = studio;
  state.health = health;
  renderAll();
}

async function loadStudio() {
  state.studio = await api(
    `/api/gex/studio?symbol=${state.symbol}${state.expiry ? `&expiry=${state.expiry}` : ""}&mode=${state.mode}`,
  );
}

function renderAll() {
  renderSymbolTabs();
  renderContextPicker();
  renderExpirySelect();
  renderTopContext();
  renderDashboard();
  renderStudio();
  renderFocusedCharts();
  renderSignal();
  renderNotes();
  renderHealth();
  renderLiveState();
  setPage(state.page);
}

function renderSymbolTabs() {
  els.symbolTabs.replaceChildren(
    ...state.instruments.map((instrument) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = instrument.symbol;
      button.className = instrument.symbol === state.symbol ? "active" : "";
      button.title = instrument.name;
      button.addEventListener("click", async () => {
        state.symbol = instrument.symbol;
        state.expiry = "";
        renderSymbolTabs();
        await loadData();
      });
      return button;
    }),
  );
}

function renderContextPicker() {
  els.ctxPillSymbol.textContent = state.symbol;
  els.ctxPillMeta.textContent = `${state.expiry ? formatExpiryCode(state.expiry) : "All"} · TOTAL`;
  els.ctxAssetList.replaceChildren(
    ...state.instruments.map((instrument) => {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<span class="asset-logo">${assetIcon(instrument.symbol)}</span><strong>${instrument.symbol}</strong><small>${instrument.name}</small>`;
      button.className = instrument.symbol === state.symbol ? "active" : "";
      button.addEventListener("click", async () => {
        state.symbol = instrument.symbol;
        state.expiry = "";
        els.ctxModal.hidden = true;
        await loadData();
      });
      return button;
    }),
  );
  els.ctxExpiryList.replaceChildren(
    contextExpiryButton("", { label: "TOTAL", gex: state.dashboard.expiries.reduce((sum, row) => sum + Math.abs(row.gex), 0) }),
    ...state.dashboard.expiries.map((row) => contextExpiryButton(row.expiry, row)),
  );
}

function renderExpirySelect() {
  const expiries = state.dashboard.expiries.map((row) => row.expiry);
  els.expirySelect.replaceChildren(
    option("", "All expiries"),
    ...expiries.map((expiry) => option(expiry, expiry)),
  );
  els.expirySelect.value = state.expiry;
}

function renderTopContext() {
  els.indexPrice.textContent = `${state.symbol} ${price(state.dashboard.spotPrice)}`;
  els.dataSourceLabel.textContent = state.dashboard.sourceLabel;
  els.dataTimestamp.textContent = formatTimestamp(state.dashboard.asOf);
  els.dashboardSnapshotMeta.textContent = `${state.symbol}: GEX by Strike · ${state.dashboard.sourceLabel} · ${formatTimestamp(state.dashboard.asOf)}`;
}

function renderDashboard() {
  els.gaugeRow.replaceChildren(
    ...state.dashboard.gauges.map((gauge) => {
      const card = document.createElement("article");
      card.className = "gauge-card panel";
      const angle = -90 + ((gauge.value + 1) / 2) * 180;
      card.innerHTML = `
        <div class="gauge-title">${gauge.label}</div>
        <div class="gauge">
          <div class="gauge-arc"></div>
          <div class="gauge-needle" style="transform: rotate(${angle}deg)"></div>
          <div class="gauge-pin"></div>
        </div>
        <strong>${gauge.state}</strong>
        <span>${gauge.value.toFixed(2)}</span>
      `;
      return card;
    }),
  );

  renderDualStrikeChart(els.dashboardStrikeChart, {
    rows: state.dashboard.rows,
    keyLevels: state.dashboard.keyLevels,
    spotPrice: state.dashboard.spotPrice,
    zoomPct: 100,
  });
  renderKeyLevels(state.dashboard.keyLevels);
  renderTrends(state.dashboard.trends.points);
  renderHeatmap(els.netHeatmap, state.dashboard.heatmaps.net);
  renderHeatmap(els.absHeatmap, state.dashboard.heatmaps.abs);
  renderChangeTable(state.dashboard.changeTable);
}

function renderStudio() {
  renderStudioTitle();
  els.studioSnapshotMeta.textContent = `${state.studio.symbol}: GEX by Strike · ${state.expiry || "All expiries"} · ${formatTimestamp(state.studio.asOf)} · ${state.live ? "Live" : "Snapshot"}`;
  renderDualStrikeChart(els.studioStrikeChart, {
    rows: state.studio.rows,
    keyLevels: state.studio.markers.keyLevels,
    spotPrice: state.studio.spotPrice,
    zoomPct: state.zoom,
    watermarked: true,
  });
  renderSummaryRail();
  renderMarkerChips(state.studio.markers.keyLevels);
}

function renderStudioTitle() {
  const label = titleCase(state.category);
  els.studioTitle.textContent = `${state.symbol}: ${label} GEX by Strike`;
}

function renderFocusedCharts() {
  renderDualStrikeChart(els.strikesChart, {
    rows: state.studio.rows,
    keyLevels: state.studio.markers.keyLevels,
    spotPrice: state.studio.spotPrice,
    zoomPct: 100,
  });
  renderTermChart(els.termChart, state.dashboard.expiries);
  renderTermTable();
  renderTermMode();
}

function renderKeyLevels(levels) {
  els.keyLevelsTable.replaceChildren(
    ...levels.map((level) => {
      const row = document.createElement("div");
      row.className = "key-level-row";
      row.innerHTML = `
        <span class="level-dot" style="background:${level.color}"></span>
        <strong>${level.label}</strong>
        <span>${price(level.strike)}</span>
      `;
      return row;
    }),
  );
}

function renderTrends(points) {
  const charts = [
    ["GEX Call/Put (24h)", "callPut", "#d08a21"],
    ["GEX Up/Down (24h)", "upDown", "#8d4dff"],
    ["Net GEX (24h)", "netGex", "#5d9cec"],
    ["Abs GEX (24h)", "absGex", "#31c46b"],
  ];
  els.trendGrid.replaceChildren(
    ...charts.map(([title, field, color]) => {
      const card = document.createElement("article");
      card.className = "panel trend-card";
      const svg = svgNode("svg", { viewBox: "0 0 360 150", role: "img", "aria-label": title });
      renderLineChart(svg, points.map((point) => ({ x: point.time, y: point[field] })), color, 360, 150);
      card.innerHTML = `<div class="panel-header"><h2>${title}</h2><strong>${formatTrendValue(points.at(-1)[field], field)}</strong></div>`;
      card.append(svg);
      return card;
    }),
  );
}

function renderHeatmap(container, heatmap) {
  const values = heatmap.rows.flatMap((row) => row.values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  container.replaceChildren();
  container.style.setProperty("--heatmap-cols", heatmap.columns.length);

  heatmap.rows
    .slice()
    .reverse()
    .forEach((row) => {
      const label = document.createElement("span");
      label.className = "heatmap-strike";
      label.textContent = price(row.strike);
      container.append(label);
      row.values.forEach((value) => {
        const cell = document.createElement("span");
        cell.className = "heatmap-cell";
        cell.title = `${price(row.strike)} · ${money(value)}`;
        cell.style.background = heatColor(value, min, max, heatmap.type);
        container.append(cell);
      });
    });
}

function renderChangeTable(table) {
  const periods = table.periods;
  const rows = periods
    .map((period) => {
      const cells = table.rows
        .map((row) => {
          const value = period === "Now" ? row.now : row.changes[period];
          const className = period === "Now" ? "now-cell" : value >= 0 ? "positive-cell" : "negative-cell";
          return `<td class="${className}">${period === "Now" ? money(value) : `${value > 0 ? "+" : ""}${value}%`}</td>`;
        })
        .join("");
      return `<tr><th>${period}</th>${cells}</tr>`;
    })
    .join("");
  const headers = table.rows.map((row) => `<th>${price(row.strike)}</th>`).join("");
  els.changeTable.innerHTML = `
    <table class="change-table">
      <thead><tr><th></th>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderSummaryRail() {
  els.summaryRail.replaceChildren(
    ...state.studio.summaryRail.map((card) => {
      const node = document.createElement("article");
      node.className = "rail-card panel";
      const svg = svgNode("svg", { viewBox: "0 0 260 110", role: "img", "aria-label": card.title });
      renderLineChart(svg, card.series.map((point) => ({ x: point.time, y: point.value })), card.accent, 260, 110);
      node.innerHTML = `
        <div class="rail-header">
          <span class="level-dot" style="background:${card.accent}"></span>
          <div><strong>${card.title}</strong><small>${card.label}</small></div>
        </div>
        <div class="rail-value" style="color:${card.accent}">${card.formattedValue}</div>
      `;
      node.append(svg);
      const status = document.createElement("span");
      status.className = "rail-status";
      status.textContent = card.status;
      node.append(status);
      return node;
    }),
  );
}

function renderReachPanel() {
  const spot = state.studio.spotPrice;
  const rows = state.studio.markers.keyLevels.map((level) => {
    const distance = Math.abs(level.strike - spot) / spot;
    const probability = Math.max(4, Math.min(96, Math.round(82 - distance * 1800)));
    return { ...level, probability };
  });
  els.reachRows.replaceChildren(
    ...rows.map((row) => {
      const node = document.createElement("div");
      node.className = "reach-row";
      node.innerHTML = `
        <span class="level-dot" style="background:${row.color}"></span>
        <strong>${row.label}</strong>
        <span>${price(row.strike)}</span>
        <meter min="0" max="100" value="${row.probability}"></meter>
        <b>${row.probability}%</b>
      `;
      return node;
    }),
  );
}

function renderMarkerChips(levels) {
  els.markerChips.replaceChildren(
    ...levels.map((level) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "marker-chip";
      node.style.borderColor = level.color;
      node.innerHTML = `<span style="background:${level.color}">${shortLevel(level.id)}</span><strong>${price(level.strike)}</strong><small>${level.label}</small>`;
      return node;
    }),
  );
}

function renderTermChart(svg, rows) {
  const width = 760;
  const height = 280;
  const pad = { top: 24, right: 26, bottom: 44, left: 78 };
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.gex)), 1);
  const step = (width - pad.left - pad.right) / rows.length;
  const zeroY = y(0);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  addGrid(svg, width, height, pad, maxAbs);

  rows.forEach((row, index) => {
    const xPos = pad.left + index * step + step * 0.24;
    const yPos = row.gex >= 0 ? y(row.gex) : zeroY;
    const barHeight = Math.abs(y(row.gex) - zeroY);
    rect(svg, xPos, yPos, step * 0.52, barHeight, row.gex >= 0 ? "#31c46b" : "#e5384f", 5);
    label(svg, xPos - 3, height - 18, row.expiry.slice(5), "axis-label");
  });

  function y(value) {
    const usable = height - pad.top - pad.bottom;
    return pad.top + ((maxAbs - value) / (maxAbs * 2 || 1)) * usable;
  }
}

function renderTermTable() {
  const body = state.dashboard.expiries
    .map(
      (row) => `
        <tr>
          <td>${row.expiry}</td>
          <td>${money(row.gex)}</td>
          <td>${formatters.integer.format(row.openInterest)}</td>
          <td>${formatters.integer.format(row.volume)}</td>
        </tr>
      `,
    )
    .join("");
  els.termTable.innerHTML = `
    <table class="health-table">
      <thead><tr><th>Expiry</th><th>Net GEX</th><th>Open Interest</th><th>Volume</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderTermMode() {
  els.termChart.hidden = state.termView !== "chart";
  els.termTable.hidden = state.termView !== "table";
}

function renderSignal() {
  const summary = state.dashboard.summary;
  const regime = summary.signalState.regime.replace("_", " ");
  els.signalState.innerHTML = `
    <strong>${titleCase(regime)}</strong>
    <span>${summary.signalState.primaryRisk.replaceAll("_", " ")} · ${summary.signalState.flipDistancePct}% from flip</span>
  `;
  els.riskCopy.innerHTML = `
    <p>Positive gamma regimes can dampen realized volatility around large walls. Negative gamma regimes can amplify spot moves because dealer hedging tends to follow direction.</p>
    <p>Current levels: flip ${price(summary.gammaFlip)}, call wall ${price(summary.callWall)}, put wall ${price(summary.putWall)}, max pain ${price(summary.maxPainStrike)}.</p>
    <p>Call/Put gauge ${summary.callPutRatio.toFixed(2)} and Up/Down gauge ${summary.upDownRatio.toFixed(2)} should be used as context, not standalone signals.</p>
  `;
}

function renderNotes() {
  els.notesList.replaceChildren(
    ...state.notes.map(([title, body]) => {
      const node = document.createElement("article");
      node.className = "note";
      node.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
      return node;
    }),
  );
}

function renderHealth() {
  const rows = state.health.sources
    .map(
      (source) => `
        <tr>
          <td>${source.name}</td>
          <td><span class="health-pill">${source.status}</span></td>
          <td>${formatTimestamp(source.lastSnapshotAt)}</td>
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
    <div class="coverage-summary">
      <span>${state.health.coverage.symbols} symbols</span>
      <span>${state.health.coverage.contracts} contracts</span>
      <span>${state.health.coverage.expiries} expiries</span>
    </div>
  `;
}

function renderLiveState() {
  els.refreshButton.textContent = state.live ? "50s" : "Paused";
  const point = state.dashboard?.trends?.points?.[state.timeIndex];
  if (point) {
    els.dataTimestamp.textContent = `${formatTimestamp(state.dashboard.asOf)} · ${point.time}`;
  }
  document.body.classList.toggle("is-paused", !state.live);
}

function renderDualStrikeChart(svg, { rows, keyLevels, spotPrice, zoomPct = 100, watermarked = false }) {
  const collapsed = collapseRows(rows);
  const visible = filterByZoom(collapsed, spotPrice, zoomPct);
  const width = 1120;
  const height = 520;
  const pad = { top: 32, right: 38, bottom: 42, left: 78 };
  const split = 298;
  const topBottom = split - 16;
  const bottomTop = split + 16;
  const maxNet = Math.max(...visible.map((row) => Math.abs(row.gex)), 1);
  const maxAbs = Math.max(...visible.map((row) => Math.abs(row.gex)), 1);
  const minStrike = Math.min(...visible.map((row) => row.strike), spotPrice, ...keyLevels.map((level) => level.strike));
  const maxStrike = Math.max(...visible.map((row) => row.strike), spotPrice, ...keyLevels.map((level) => level.strike));
  const barWidth = Math.max(7, (width - pad.left - pad.right) / visible.length - 8);
  const zeroY = yTop(0);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  rect(svg, pad.left, pad.top, width - pad.left - pad.right, topBottom - pad.top, "#ffffff", 8, "chart-surface");
  rect(svg, pad.left, bottomTop, width - pad.left - pad.right, height - pad.bottom - bottomTop, "#ffffff", 8, "chart-surface");
  addGrid(svg, width, topBottom + 8, pad, maxNet);
  line(svg, pad.left, zeroY, width - pad.right, zeroY, "#d8dee8", "3 5", "zero-line");

  visible.forEach((row) => {
    const xPos = x(row.strike) - barWidth / 2;
    const yPos = row.gex >= 0 ? yTop(row.gex) : zeroY;
    const barHeight = Math.abs(yTop(row.gex) - zeroY);
    rect(svg, xPos, yPos, barWidth, barHeight, row.gex >= 0 ? "#31c46b" : "#e5384f", 3);
    label(svg, x(row.strike) - 15, height - 16, formatStrike(row.strike), "axis-label");
  });

  const areaPoints = visible.map((row) => [x(row.strike), yBottom(Math.abs(row.gex))]);
  if (areaPoints.length > 1) {
    const areaPath = [
      `M ${areaPoints[0][0]} ${height - pad.bottom}`,
      ...areaPoints.map(([xPos, yPos]) => `L ${xPos} ${yPos}`),
      `L ${areaPoints.at(-1)[0]} ${height - pad.bottom}`,
      "Z",
    ].join(" ");
    path(svg, areaPath, "rgba(125, 32, 255, 0.38)", "#7d20ff", 2, "abs-area");
  }

  keyLevels.forEach((level) => {
    const pos = x(level.strike);
    line(svg, pos, pad.top, pos, height - pad.bottom, level.color, "3 4", "marker-line");
    markerLabel(svg, pos, level.id.includes("negative") ? zeroY + 22 : pad.top + 16, shortLevel(level.id), level.color);
  });
  line(svg, x(spotPrice), pad.top, x(spotPrice), height - pad.bottom, "#111827", "4 4", "spot-line");
  markerLabel(svg, x(spotPrice), topBottom + 16, price(spotPrice), "#111827", true);

  label(svg, 20, 160, "Net GEX", "axis-title");
  label(svg, 20, 420, "Abs. GEX", "axis-title");
  if (watermarked) {
    label(svg, width / 2 - 110, height / 2 + 20, "GEX Research", "watermark");
  }

  function x(strike) {
    const usable = width - pad.left - pad.right;
    return pad.left + ((strike - minStrike) / (maxStrike - minStrike || 1)) * usable;
  }

  function yTop(value) {
    const usable = topBottom - pad.top;
    return pad.top + ((maxNet - value) / (maxNet * 2 || 1)) * usable;
  }

  function yBottom(value) {
    const usable = height - pad.bottom - bottomTop;
    return bottomTop + (1 - value / Math.max(maxAbs, 1)) * usable;
  }
}

function renderLineChart(svg, series, color, width, height) {
  svg.replaceChildren();
  const pad = { top: 16, right: 16, bottom: 22, left: 38 };
  const values = series.map((point) => point.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = series.map((point, index) => [
    pad.left + (index / Math.max(series.length - 1, 1)) * (width - pad.left - pad.right),
    pad.top + (1 - (point.y - min) / Math.max(max - min, 1)) * (height - pad.top - pad.bottom),
  ]);
  const linePath = points.map(([xPos, yPos], index) => `${index === 0 ? "M" : "L"} ${xPos} ${yPos}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1)[0]} ${height - pad.bottom} L ${points[0][0]} ${height - pad.bottom} Z`;
  line(svg, pad.left, height - pad.bottom, width - pad.right, height - pad.bottom, "#27313d", "3 5", "grid-line");
  path(svg, areaPath, colorToArea(color), "transparent", 0);
  path(svg, linePath, "none", color, 2.5);
}

function setPage(page) {
  state.page = page;
  els.productMenu.hidden = true;
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active-page", section.id === `${page}Page`);
  });
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  els.productMenu.querySelectorAll("[data-page-jump]").forEach((button) => {
    button.classList.toggle("active", button.dataset.pageJump === page);
  });
  els.productLabel.textContent = page === "studio" ? "GEX Studio" : titleCase(page.replace("term", "term structure"));
}

function setTimeIndex(value) {
  state.timeIndex = value;
  els.historyInput.value = String(value);
  els.tmScrubber.value = String(value);
  renderLiveState();
}

function openModal(node) {
  node.hidden = false;
}

function toggleHidden(node) {
  node.hidden = !node.hidden;
}

function assetIcon(symbol) {
  return { BTC: "₿", ETH: "◆", SOL: "≋", XRP: "✕" }[symbol] ?? symbol.slice(0, 1);
}

function expiryBucket(expiry) {
  const date = new Date(`${expiry}T00:00:00Z`);
  const days = Math.max(0, Math.round((date - new Date(state.dashboard.asOf)) / 86400000));
  if (days <= 6) return "D";
  if (days <= 28) return "W";
  if (days <= 70) return "M";
  return "Q";
}

function formatExpiryCode(expiry) {
  const date = new Date(`${expiry}T00:00:00Z`);
  const day = String(date.getUTCDate());
  const month = date.toLocaleString("en", { month: "short", timeZone: "UTC" }).toUpperCase();
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

function contextExpiryButton(value, row) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = value === state.expiry ? "active" : "";
  const isTotal = !value;
  const absGex = Math.abs(row.gex ?? 0);
  const maxAbs = Math.max(...state.dashboard.expiries.map((expiry) => Math.abs(expiry.gex)), absGex, 1);
  button.style.setProperty("--gex-share", `${Math.max(8, (absGex / maxAbs) * 100)}%`);
  button.innerHTML = isTotal
    ? `<strong>TOTAL</strong><span>|GEX| ${money(absGex)}</span>`
    : `<span class="expiry-badge ${expiryBucket(value)}">${expiryBucket(value)}</span><strong>${formatExpiryCode(value)}</strong><span>|GEX| ${money(absGex)}</span>`;
  button.addEventListener("click", async () => {
    state.expiry = value;
    els.expirySelect.value = value;
    els.ctxModal.hidden = true;
    await loadStudio();
    renderContextPicker();
    renderStudio();
    renderFocusedCharts();
  });
  return button;
}

function setActiveButton(container, activeButton) {
  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button === activeButton);
  });
}

function collapseRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const current = groups.get(row.strike) ?? { strike: row.strike, gex: 0, callGex: 0, putGex: 0, openInterest: 0, volume: 0 };
    current.gex += row.gex;
    current.callGex += row.callGex;
    current.putGex += row.putGex;
    current.openInterest += row.openInterest;
    current.volume += row.volume;
    groups.set(row.strike, current);
  });
  return [...groups.values()].sort((a, b) => a.strike - b.strike);
}

function filterByZoom(rows, spotPrice, zoomPct) {
  if (zoomPct >= 95) return rows;
  const distance = spotPrice * (zoomPct / 100);
  const filtered = rows.filter((row) => row.strike >= spotPrice - distance && row.strike <= spotPrice + distance);
  return filtered.length >= 4 ? filtered : rows;
}

async function api(path) {
  const response = await fetch(path);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${path}`);
  }
  return payload;
}

function exportCsv(rows) {
  const header = "strike,gex,callGex,putGex,openInterest,volume";
  const body = collapseRows(rows)
    .map((row) => [row.strike, row.gex, row.callGex, row.putGex, row.openInterest, row.volume].join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.symbol}-gex-research.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function option(value, labelText) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = labelText;
  return node;
}

function renderError(error) {
  document.body.innerHTML = `<main class="panel error-panel"><h1>Unable to load GEX platform</h1><p>${error.message}</p></main>`;
}

function addGrid(svg, width, height, pad, maxAbs) {
  [-1, -0.5, 0, 0.5, 1].forEach((tick) => {
    const value = tick * maxAbs;
    const yPos = pad.top + ((maxAbs - value) / (maxAbs * 2 || 1)) * (height - pad.top - pad.bottom);
    line(svg, pad.left, yPos, width - pad.right, yPos, "#27313d", "3 5", "grid-line");
    label(svg, 14, yPos + 4, money(value), "axis-label");
  });
}

function rect(svg, x, y, width, height, fill, radius = 2, className = "") {
  const node = svgNode("rect", { x, y, width, height: Math.max(height, 1), fill, rx: radius, class: className });
  svg.append(node);
}

function line(svg, x1, y1, x2, y2, stroke, dash = "", className = "marker-line") {
  const node = svgNode("line", { x1, y1, x2, y2, stroke, class: className });
  if (dash) node.setAttribute("stroke-dasharray", dash);
  svg.append(node);
}

function path(svg, d, fill, stroke, strokeWidth = 1, className = "") {
  const node = svgNode("path", { d, fill, stroke, "stroke-width": strokeWidth, class: className });
  svg.append(node);
}

function label(svg, x, y, text, className, fill = "") {
  const node = svgNode("text", { x, y, class: className });
  if (fill) node.setAttribute("fill", fill);
  node.textContent = text;
  svg.append(node);
}

function markerLabel(svg, x, y, text, color, inverse = false) {
  const width = Math.max(42, String(text).length * 8 + 14);
  rect(svg, x - width / 2, y - 14, width, 24, inverse ? "#0f1117" : color, 7, "marker-badge");
  label(svg, x - width / 2 + 7, y + 2, text, "marker-text", "#ffffff");
}

function svgNode(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function heatColor(value, min, max, type) {
  const t = (value - min) / Math.max(max - min, 1);
  if (type === "abs") {
    const purple = [72, 18, 150];
    const yellow = [235, 218, 78];
    return rgb(mix(purple, yellow, t));
  }
  if (value < 0) {
    const intensity = Math.min(Math.abs(value / Math.min(min, -1)), 1);
    return rgb(mix([48, 16, 24], [229, 56, 79], intensity));
  }
  const intensity = Math.min(value / Math.max(max, 1), 1);
  return rgb(mix([16, 38, 28], [49, 196, 107], intensity));
}

function mix(a, b, t) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * t));
}

function rgb(values) {
  return `rgb(${values.join(" ")})`;
}

function colorToArea(color) {
  if (color === "#31c46b") return "rgba(49, 196, 107, 0.16)";
  if (color === "#e5384f") return "rgba(229, 56, 79, 0.16)";
  if (color === "#8d4dff") return "rgba(141, 77, 255, 0.18)";
  if (color === "#d08a21") return "rgba(208, 138, 33, 0.18)";
  return "rgba(93, 156, 236, 0.18)";
}

function money(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}${formatters.compact.format(Math.abs(value))}`;
}

function price(value) {
  if (Math.abs(value) >= 1000) return formatters.integer.format(value);
  return formatters.price.format(value);
}

function formatStrike(value) {
  return value >= 1000 ? `${Math.round(value / 1000)}K` : price(value);
}

function formatTrendValue(value, field) {
  if (field.includes("Gex")) return money(value);
  return Number(value).toFixed(2);
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortLevel(id) {
  return {
    flip: "F",
    max_stability: "S",
    max_volatility: "V",
    positive_peak: "P1",
    negative_peak: "N1",
    absolute_max: "A1",
  }[id] ?? id.slice(0, 2).toUpperCase();
}
