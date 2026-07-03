const state = {
  page: "studio",
  symbol: "BTC",
  expiry: "",
  mode: "snapshot",
  category: "now",
  expiryView: "levels",
  expiryMetric: "oi",
  historyWindow: "24h",
  historyGexType: "net",
  maxDte: 20,
  coverage: 50,
  zoom: 16,
  live: true,
  layers: { positive: true, negative: true, absolute: true, regime: true },
  selectedMarkerId: "",
  crosshair: null,
  panOffset: 0,
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
  expiryViewTabs: document.querySelector("#expiryViewTabs"),
  expiryMetricTabs: document.querySelector("#expiryMetricTabs"),
  historyWindowTabs: document.querySelector("#historyWindowTabs"),
  historyGexTabs: document.querySelector("#historyGexTabs"),
  reachButton: document.querySelector("#reachButton"),
  reachPanel: document.querySelector("#reachPanel"),
  reachRows: document.querySelector("#reachRows"),
  reachComputeButton: document.querySelector("#reachComputeButton"),
  reachStatus: document.querySelector("#reachStatus"),
  chartControlsButton: document.querySelector("#chartControlsButton"),
  chartControlsPanel: document.querySelector("#chartControlsPanel"),
  showPositiveToggle: document.querySelector("#showPositiveToggle"),
  showNegativeToggle: document.querySelector("#showNegativeToggle"),
  showAbsoluteToggle: document.querySelector("#showAbsoluteToggle"),
  showRegimeToggle: document.querySelector("#showRegimeToggle"),
  tmPrevButton: document.querySelector("#tmPrevButton"),
  tmPlayButton: document.querySelector("#tmPlayButton"),
  tmNextButton: document.querySelector("#tmNextButton"),
  tmScrubber: document.querySelector("#tmScrubber"),
  studioCsvButton: document.querySelector("#studioCsvButton"),
  studioTitle: document.querySelector("#studioTitle"),
  studioModeSummary: document.querySelector("#studioModeSummary"),
  studioCategoryDetails: document.querySelector("#studioCategoryDetails"),
  studioSnapshotMeta: document.querySelector("#studioSnapshotMeta"),
  studioStrikeChart: document.querySelector("#studioStrikeChart"),
  summaryRail: document.querySelector("#summaryRail"),
  layerChips: document.querySelector("#layerChips"),
  markerChips: document.querySelector("#markerChips"),
  zoomSlider: document.querySelector("#zoomSlider"),
  zoomValue: document.querySelector("#zoomValue"),
  expiryDteTicks: document.querySelector("#expiryDteTicks"),
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
  els.primaryNav?.addEventListener("click", async (event) => {
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
    state.crosshair = null;
    setActiveButton(els.categoryTabs, button);
    if (state.category === "history") {
      state.live = false;
      els.liveToggle.checked = false;
      renderLiveState();
    }
    renderStudio();
  });

  els.modeTabs.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    setActiveButton(els.modeTabs, button);
    await loadStudio();
    renderStudio();
  });

  els.expiryViewTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-expiry-view]");
    if (!button) return;
    state.expiryView = button.dataset.expiryView;
    setActiveButton(els.expiryViewTabs, button);
    renderStudio();
  });

  els.expiryMetricTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-expiry-metric]");
    if (!button) return;
    state.expiryMetric = button.dataset.expiryMetric;
    setActiveButton(els.expiryMetricTabs, button);
    renderStudio();
  });

  els.historyWindowTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-window]");
    if (!button) return;
    state.historyWindow = button.dataset.historyWindow;
    setActiveButton(els.historyWindowTabs, button);
    renderStudio();
  });

  els.historyGexTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-gex]");
    if (!button) return;
    state.historyGexType = button.dataset.historyGex;
    setActiveButton(els.historyGexTabs, button);
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
  bindLayerControls();
  bindStudioChartInteractions();

  els.zoomSlider.addEventListener("input", (event) => {
    if (state.category === "expiry") {
      state.maxDte = Number(event.target.value);
      els.zoomValue.textContent = `<= ${state.maxDte}d`;
    } else {
      state.zoom = Number(event.target.value);
      els.zoomValue.textContent = `${state.zoom}%`;
    }
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

function bindLayerControls() {
  [
    [els.showPositiveToggle, "positive"],
    [els.showNegativeToggle, "negative"],
    [els.showAbsoluteToggle, "absolute"],
    [els.showRegimeToggle, "regime"],
  ].forEach(([input, key]) => {
    input.addEventListener("change", () => {
      state.layers[key] = input.checked;
      renderStudio();
    });
  });
}

function bindStudioChartInteractions() {
  let dragStart = null;

  els.studioStrikeChart.addEventListener("pointerdown", (event) => {
    if (["expiry", "history"].includes(state.category)) return;
    dragStart = { x: event.clientX, panOffset: state.panOffset };
    els.studioStrikeChart.setPointerCapture?.(event.pointerId);
    els.studioStrikeChart.classList.add("is-dragging");
  });

  els.studioStrikeChart.addEventListener("pointermove", (event) => {
    if (["expiry", "history"].includes(state.category)) return;
    const strike = strikeFromPointer(event);
    if (strike) state.crosshair = strike;
    if (dragStart) {
      const delta = event.clientX - dragStart.x;
      state.panOffset = clamp(dragStart.panOffset - delta / 240, -3, 3);
    }
    renderStudio();
  });

  els.studioStrikeChart.addEventListener("pointerup", (event) => {
    dragStart = null;
    els.studioStrikeChart.releasePointerCapture?.(event.pointerId);
    els.studioStrikeChart.classList.remove("is-dragging");
  });

  els.studioStrikeChart.addEventListener("pointerleave", () => {
    if (["expiry", "history"].includes(state.category)) return;
    if (!dragStart) {
      state.crosshair = null;
      renderStudio();
    }
  });

  els.studioStrikeChart.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (["expiry", "history"].includes(state.category)) return;
      const step = event.deltaY < 0 ? -2 : 2;
      state.zoom = clamp(state.zoom + step, Number(els.zoomSlider.min), Number(els.zoomSlider.max));
      els.zoomSlider.value = String(state.zoom);
      els.zoomValue.textContent = `${state.zoom}%`;
      renderStudio();
    },
    { passive: false },
  );
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
  document.querySelector("#studioPage").dataset.categoryMode = state.category;
  document.querySelector("#studioPage").dataset.expiryView = state.expiryView;
  document.querySelector("#studioPage").dataset.expiryMetric = state.expiryMetric;
  document.querySelector("#studioPage").dataset.historyWindow = state.historyWindow;
  document.querySelector("#studioPage").dataset.historyGex = state.historyGexType;
  renderStudioControls();
  renderStudioTitle();
  renderStudioModeSummary();
  renderStudioCategoryDetails();
  const selected = selectedMarker();
  const markerText = selected && !["expiry", "history"].includes(state.category) ? ` | ${shortLevel(selected.id)} ${price(selected.strike)}` : "";
  const chartName = studioChartName();
  const splitText = state.category === "expiry" && state.expiryMetric === "gexUd" ? ` | Split at $${price(state.studio.spotPrice)}` : "";
  if (state.category === "history") {
    const history = historyHeatmapData(state.historyWindow, state.historyGexType);
    els.studioSnapshotMeta.textContent = `${state.dashboard.sourceLabel} · ${history.rangeLabel}`;
  } else {
    els.studioSnapshotMeta.textContent = `${state.studio.symbol}: ${chartName} | ${state.expiry || "All expiries"} | ${formatTimestamp(state.studio.asOf)} | ${state.live ? "Live" : "Snapshot"}${splitText}${markerText}`;
  }
  renderStudioMainChart();
  renderSummaryRail();
  renderLayerChips();
  renderMarkerChips(state.studio.markers.keyLevels);
}

function renderStudioTitle() {
  const titles = {
    now: `${state.symbol}: GEX by Strike`,
    expiry: `${state.symbol}: ${studioChartName()}`,
    history: `${state.symbol}: GEX Heatmap`,
    forecast: `${state.symbol}: GEX Forecast`,
  };
  els.studioTitle.textContent = titles[state.category];
}

function renderStudioControls() {
  const isExpiry = state.category === "expiry";
  const isHistory = state.category === "history";
  els.modeTabs.hidden = isExpiry || isHistory;
  els.expiryViewTabs.hidden = !isExpiry;
  els.expiryMetricTabs.hidden = !(isExpiry && state.expiryView === "positioning");
  els.historyWindowTabs.hidden = !isHistory;
  els.historyGexTabs.hidden = !isHistory;
  els.reachButton.hidden = isExpiry || isHistory;
  els.chartControlsButton.hidden = isExpiry ? true : false;
  setActiveByDataset(els.expiryViewTabs, "expiryView", state.expiryView);
  setActiveByDataset(els.expiryMetricTabs, "expiryMetric", state.expiryMetric);
  setActiveByDataset(els.historyWindowTabs, "historyWindow", state.historyWindow);
  setActiveByDataset(els.historyGexTabs, "historyGex", state.historyGexType);
  if (isExpiry) {
    els.zoomSlider.min = "-1";
    els.zoomSlider.max = "356";
    els.zoomSlider.value = String(state.maxDte);
    els.zoomValue.textContent = `<= ${state.maxDte}d`;
    els.zoomSlider.closest(".zoom-panel").querySelector("span").textContent = "Max Expiration (DTE)";
    els.expiryDteTicks.hidden = false;
  } else {
    els.zoomSlider.min = "1";
    els.zoomSlider.max = "100";
    els.zoomSlider.value = String(state.zoom);
    els.zoomValue.textContent = `${state.zoom}%`;
    els.zoomSlider.closest(".zoom-panel").querySelector("span").textContent = "Zoom (+/-%)";
    els.expiryDteTicks.hidden = true;
  }
}

function studioChartName() {
  if (state.category === "history") return "GEX Heatmap";
  if (state.category !== "expiry") return "GEX by Strike";
  if (state.expiryView === "levels") return "GEX Term Structure";
  return {
    oi: "OI by Expiration",
    pcRatio: "P/C Ratio by Expiration",
    gexAbs: "GEX ABS by Expiration",
    gexNet: "GEX NET by Expiration",
    gexCp: "GEX C/P by Expiration",
    gexUd: "GEX U/D by Expiration",
    rr25: "25Δ RR by Expiration",
  }[state.expiryMetric];
}

function renderStudioMainChart() {
  if (state.category === "history") {
    renderHistoryHeatmapChart(els.studioStrikeChart, historyHeatmapData(state.historyWindow, state.historyGexType));
    return;
  }

  if (state.category === "expiry") {
    if (state.expiryView === "levels") {
      renderExpiryLevelsChart(els.studioStrikeChart, expiryBuckets(), state.studio.spotPrice);
    } else {
      renderExpiryPositioningChart(els.studioStrikeChart, expiryBuckets(), state.expiryMetric);
    }
    return;
  }

  renderDualStrikeChart(els.studioStrikeChart, {
    rows: state.studio.rows,
    keyLevels: state.studio.markers.keyLevels,
    spotPrice: state.studio.spotPrice,
    zoomPct: state.zoom,
    panOffset: state.panOffset,
    layers: state.layers,
    selectedMarkerId: state.selectedMarkerId,
    crosshair: state.crosshair,
    watermarked: true,
  });
}

function renderStudioModeSummary() {
  const copy = {
    now: ["Now", "Live snapshot view with spot, flip, walls, and current dealer hedging pressure."],
    expiry: ["Expiry", "Expiry-focused strike map. Use the expiry picker to isolate one settlement and compare walls."],
    history: ["History", "Replay mode. Move the time scrubber or drag the chart to review wall migration through the day."],
    forecast: ["Forecast", "Scenario view. Reach % estimates and selected levels help frame upside and downside targets."],
  }[state.category];
  const layers = Object.entries(state.layers)
    .filter(([, enabled]) => enabled)
    .map(([key]) => titleCase(key))
    .join(" / ");
  els.studioModeSummary.innerHTML = `
    <div><strong>${copy[0]}</strong><span>${copy[1]}</span></div>
    <div class="mode-actions">
      <button type="button" data-action="open-controls">Layers: ${layers || "None"}</button>
      <button type="button" data-action="reset-chart">Reset chart</button>
      <span>Wheel zoom | drag pan | crosshair on hover</span>
    </div>
  `;
  els.studioModeSummary.querySelector('[data-action="open-controls"]').addEventListener("click", () => {
    els.chartControlsPanel.hidden = false;
  });
  els.studioModeSummary.querySelector('[data-action="reset-chart"]').addEventListener("click", () => {
    state.panOffset = 0;
    state.zoom = 16;
    els.zoomSlider.value = String(state.zoom);
    els.zoomValue.textContent = `${state.zoom}%`;
    state.crosshair = null;
    state.selectedMarkerId = "";
    renderStudio();
  });
}

function renderStudioCategoryDetails() {
  const expiryCount = state.studio.expiries?.length ?? 0;
  const cards = {
    now: [
      ["Live", "Snapshot / Day / Hour update the same strike map while the Live switch controls replay state."],
      ["Crosshair", "Hover the chart to inspect strike levels. Drag to pan and use the wheel or slider to zoom."],
      ["Layers", "Positive, Negative, Absolute, and Regime chips below the chart toggle the matching visual layer."],
    ],
    expiry: [
      ["Positioning", "Term structure view across listed expiries and strikes, matching the GammaFlip Expiry workspace."],
      ["Levels", `${expiryCount} expiries loaded. Use the global expiry picker to isolate one settlement.`],
      ["Max Expiration", "&lt;= 356d · synthetic fixture coverage until live options ingestion is connected."],
    ],
    history: [
      ["Replay", "Time Machine controls move the snapshot through the local 24h series."],
      ["Scrubber", `Current replay point ${state.timeIndex}:00. Use previous, next, play, or the range control.`],
      ["Compare", "Marker selection stays active while replaying so walls can be tracked across time."],
    ],
    forecast: [
      ["Reach %", "Open the Reach % panel to estimate probability of touching flip, walls, magnets, and volatility triggers."],
      ["Scenario", "Forecast mode keeps the current strike chart visible and frames upside/downside target levels."],
      ["Data", "Forecast values are deterministic fixtures until realtime volatility and options data are added."],
    ],
  }[state.category];

  els.studioCategoryDetails.innerHTML = cards
    .map(
      ([title, body]) => `
        <article>
          <strong>${title}</strong>
          <span>${body}</span>
        </article>
      `,
    )
    .join("");
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

function renderLayerChips() {
  const layers = [
    ["positive", "Positive"],
    ["negative", "Negative"],
    ["absolute", "Absolute"],
    ["regime", "Regime"],
  ];
  els.layerChips.replaceChildren(
    ...layers.map(([key, labelText]) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = `layer-chip ${key}${state.layers[key] ? " active" : ""}`;
      node.setAttribute("data-layer", key);
      node.textContent = labelText;
      node.addEventListener("click", () => {
        state.layers[key] = !state.layers[key];
        const input = {
          positive: els.showPositiveToggle,
          negative: els.showNegativeToggle,
          absolute: els.showAbsoluteToggle,
          regime: els.showRegimeToggle,
        }[key];
        input.checked = state.layers[key];
        renderStudio();
      });
      return node;
    }),
  );
}

function renderMarkerChips(levels) {
  els.markerChips.replaceChildren(
    ...levels.map((level) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = `marker-chip${state.selectedMarkerId === level.id ? " active" : ""}`;
      node.setAttribute("data-marker-id", level.id);
      node.style.borderColor = level.color;
      node.title = `${shortLevel(level.id)} ${price(level.strike)} ${money(level.value)} ${level.label}`;
      node.innerHTML = `
        <span style="background:${level.color}">${shortLevel(level.id)}</span>
        <strong>${price(level.strike)}</strong>
        <em>${money(level.value)}</em>
        <small>${level.label}</small>
      `;
      node.addEventListener("click", () => {
        state.selectedMarkerId = state.selectedMarkerId === level.id ? "" : level.id;
        state.crosshair = level.strike;
        renderStudio();
      });
      node.addEventListener("mouseenter", () => {
        state.crosshair = level.strike;
        renderStudioMainChart();
      });
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

function historyHeatmapData(windowKey, gexType) {
  const configs = {
    "24h": {
      columns: 96,
      rows: 28,
      yMin: 57500,
      yMax: 64200,
      rangeLabel: "Jul 2 07:26 - Jul 3 07:16 UTC",
      xLabels: ["Jul 02\n07:26", "Jul 02\n09:13", "Jul 02\n11:15", "Jul 02\n13:01", "Jul 02\n14:50", "Jul 02\n16:38", "Jul 02\n18:26", "Jul 02\n20:15", "Jul 02\n22:02", "Jul 02\n23:50", "Jul 03\n01:37", "Jul 03\n03:25", "Jul 03\n05:12", "Jul 03\n07:01"],
      priceTicks: [58000, 59000, 60000, 61000, 62000, 63000, 64000],
      scale: { min: -14, max: 20, ticks: [-12, -8, -4, 0, 5, 10, 15, 20] },
    },
    "3d": {
      columns: 120,
      rows: 30,
      yMin: 55800,
      yMax: 64200,
      rangeLabel: "Jul 1 00:14 - Jul 3 07:16 UTC",
      xLabels: ["Jul 01\n00:14", "Jul 01\n04:35", "Jul 01\n08:56", "Jul 01\n13:15", "Jul 01\n17:35", "Jul 01\n21:57", "Jul 02\n02:18", "Jul 02\n06:39", "Jul 02\n11:15", "Jul 02\n15:36", "Jul 02\n19:59", "Jul 03\n00:20", "Jul 03\n04:42"],
      priceTicks: [56000, 57000, 58000, 59000, 60000, 61000, 62000, 63000, 64000],
      scale: { min: -22, max: 24, ticks: [-20, -15, -10, -5, 0, 5, 10, 15, 20] },
    },
    "7d": {
      columns: 150,
      rows: 30,
      yMin: 55800,
      yMax: 64200,
      rangeLabel: "Jun 27 00:01 - Jul 3 07:16 UTC",
      xLabels: ["Jun 27\n00:01", "Jun 27\n12:33", "Jun 28\n01:05", "Jun 28\n13:32", "Jun 29\n02:07", "Jun 29\n14:40", "Jun 30\n03:14", "Jun 30\n15:46", "Jul 01\n04:19", "Jul 01\n16:49", "Jul 02\n05:23", "Jul 02\n18:11", "Jul 03\n06:45"],
      priceTicks: [56000, 57000, 58000, 59000, 60000, 61000, 62000, 63000, 64000],
      scale: { min: -22, max: 18, ticks: [-20, -15, -10, -5, 0, 4, 8, 12, 16] },
    },
    "30d": {
      columns: 160,
      rows: 34,
      yMin: 55700,
      yMax: 70300,
      rangeLabel: "Jun 4 00:01 - Jul 3 07:16 UTC",
      xLabels: ["Jun 04\n00:01", "Jun 06\n08:46", "Jun 08\n22:01", "Jun 11\n07:01", "Jun 13\n16:01", "Jun 16\n01:16", "Jun 18\n10:46", "Jun 20\n21:09", "Jun 23\n07:29", "Jun 25\n18:01", "Jun 28\n04:25", "Jun 30\n14:44", "Jul 03\n01:22"],
      priceTicks: [56000, 58000, 60000, 62000, 64000, 66000, 68000, 70000],
      scale: { min: -42, max: 28, ticks: [-40, -30, -20, -10, 0, 6, 12, 18, 24] },
    },
    "90d": {
      columns: 170,
      rows: 36,
      yMin: 55700,
      yMax: 85300,
      rangeLabel: "Apr 5 00:01 - Jul 3 07:16 UTC",
      xLabels: ["Apr 05\n00:01", "Apr 12\n08:46", "Apr 19\n17:46", "Apr 27\n02:46", "May 04\n11:46", "May 11\n20:46", "May 19\n05:46", "May 26\n14:46", "Jun 03\n00:16", "Jun 10\n13:31", "Jun 17\n22:50", "Jun 25\n12:23", "Jul 03\n01:52"],
      priceTicks: [57500, 60000, 62500, 65000, 67500, 70000, 72500, 75000, 77500, 80000, 82500, 85000],
      scale: { min: -34, max: 48, ticks: [-32, -24, -16, -8, 0, 10, 20, 30, 40] },
    },
  };
  const config = configs[windowKey] ?? configs["24h"];
  const strikes = Array.from({ length: config.rows }, (_, index) => config.yMin + (index / (config.rows - 1)) * (config.yMax - config.yMin));
  const time = Array.from({ length: config.columns }, (_, index) => index / (config.columns - 1));
  const priceSeries = time.map((t, index) => historyPrice(config, windowKey, t, index));
  const flipSeries = time.map((t, index) => historyFlip(config, windowKey, t, index));
  const values = strikes.map((strike) =>
    time.map((t, index) => {
      const raw = historyGexValue(strike, t, index, config, windowKey);
      return gexType === "abs" ? Math.abs(raw) : raw;
    }),
  );
  const scale = gexType === "abs" ? { min: 0, max: Math.max(Math.abs(config.scale.min), config.scale.max), ticks: [0, 5, 10, 15, 20, 30, 40].filter((tick) => tick <= Math.max(Math.abs(config.scale.min), config.scale.max)) } : config.scale;
  return { ...config, gexType, strikes, time, priceSeries, flipSeries, values, scale };
}

function historyPrice(config, windowKey, t, index) {
  const paths = {
    "24h": [
      [0, 60150],
      [0.12, 60550],
      [0.25, 61250],
      [0.38, 62000],
      [0.52, 61650],
      [0.68, 61380],
      [0.82, 61520],
      [1, 61750],
    ],
    "3d": [
      [0, 58400],
      [0.22, 59000],
      [0.32, 60300],
      [0.54, 59800],
      [0.68, 61800],
      [1, 61750],
    ],
    "7d": [
      [0, 60000],
      [0.2, 60400],
      [0.36, 59500],
      [0.55, 58500],
      [0.72, 60000],
      [0.88, 61600],
      [1, 61750],
    ],
    "30d": [
      [0, 64000],
      [0.12, 61000],
      [0.36, 66800],
      [0.55, 62800],
      [0.7, 64000],
      [0.82, 59500],
      [1, 61750],
    ],
    "90d": [
      [0, 67000],
      [0.18, 76000],
      [0.42, 82000],
      [0.56, 76000],
      [0.66, 61000],
      [0.84, 65000],
      [0.94, 59000],
      [1, 61750],
    ],
  };
  const base = interpolatePath(paths[windowKey] ?? paths["24h"], t);
  const noise = Math.sin(index * 0.61) * 105 + Math.sin(index * 1.47) * 62 + Math.sin(t * Math.PI * 18) * 74;
  return clamp(base + noise, config.yMin + 350, config.yMax - 350);
}

function historyFlip(config, windowKey, t, index) {
  const paths = {
    "24h": [
      [0, 59850],
      [0.05, 60200],
      [0.25, 60480],
      [0.48, 60540],
      [0.78, 60520],
      [1, 60670],
    ],
    "3d": [
      [0, 59600],
      [0.35, 59680],
      [0.58, 59900],
      [0.6, 60300],
      [0.75, 60540],
      [1, 60670],
    ],
    "7d": [
      [0, 60350],
      [0.35, 60200],
      [0.55, 60050],
      [0.65, 59400],
      [0.86, 59850],
      [1, 60670],
    ],
    "30d": [
      [0, 67400],
      [0.08, 63500],
      [0.42, 65600],
      [0.63, 64000],
      [0.84, 60200],
      [1, 60670],
    ],
    "90d": [
      [0, 67000],
      [0.2, 72000],
      [0.45, 78000],
      [0.58, 76000],
      [0.66, 64000],
      [0.9, 63500],
      [1, 60670],
    ],
  };
  const base = interpolatePath(paths[windowKey] ?? paths["24h"], t);
  const smooth = Math.sin(index * 0.19) * 38 + Math.sin(t * Math.PI * 5) * 60;
  return clamp(base + smooth, config.yMin + 250, config.yMax - 250);
}

function historyGexValue(strike, t, index, config, windowKey) {
  const priceSpan = config.yMax - config.yMin;
  const lowerWall = interpolatePath(
    {
      "24h": [[0, 58000], [0.3, 60000], [1, 60000]],
      "3d": [[0, 56000], [0.25, 58000], [1, 60000]],
      "7d": [[0, 60000], [0.5, 58000], [1, 60000]],
      "30d": [[0, 60000], [0.45, 60000], [0.8, 58000], [1, 60000]],
      "90d": [[0, 60000], [0.45, 75000], [0.7, 60000], [1, 57500]],
    }[windowKey],
    t,
  );
  const upperWall = interpolatePath(
    {
      "24h": [[0, 63000], [1, 63000]],
      "3d": [[0, 60500], [0.45, 61000], [1, 63000]],
      "7d": [[0, 61000], [0.5, 60000], [1, 63000]],
      "30d": [[0, 65000], [0.45, 67000], [1, 61000]],
      "90d": [[0, 75000], [0.45, 80000], [0.72, 60000], [1, 65000]],
    }[windowKey],
    t,
  );
  const redBand = -gaussian(strike, lowerWall, priceSpan * 0.018) * (Math.abs(config.scale.min) * (0.58 + 0.35 * Math.sin(t * Math.PI * 3) ** 2));
  const orangeBand = -gaussian(strike, lowerWall - priceSpan * 0.07, priceSpan * 0.024) * Math.abs(config.scale.min) * 0.36;
  const greenBand = gaussian(strike, upperWall, priceSpan * 0.022) * config.scale.max * (0.52 + 0.4 * Math.sin(t * Math.PI * 2.5 + 0.6) ** 2);
  const priceMagnet = gaussian(strike, historyPrice(config, windowKey, t, index), priceSpan * 0.035) * config.scale.max * 0.32;
  const flipDrag = -gaussian(strike, historyFlip(config, windowKey, t, index), priceSpan * 0.025) * Math.abs(config.scale.min) * 0.22;
  const columns = Math.sin(index * 0.42) * 0.9 + Math.sin(index * 0.09) * 1.5;
  return redBand + orangeBand + greenBand + priceMagnet + flipDrag + columns;
}

function renderHistoryHeatmapChart(svg, data) {
  const width = 1120;
  const height = 700;
  const pad = { top: 22, right: 74, bottom: 112, left: 90 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const cellWidth = chartWidth / data.columns;
  const cellHeight = chartHeight / data.rows;
  const yMin = data.yMin;
  const yMax = data.yMax;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  rect(svg, pad.left, pad.top, chartWidth, chartHeight, "#f5f1b8", 0, "history-plot-bg");
  data.values.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const xPos = pad.left + colIndex * cellWidth;
      const yPos = pad.top + (data.rows - rowIndex - 1) * cellHeight;
      rect(svg, xPos, yPos, cellWidth + 0.6, cellHeight + 0.6, historyHeatColor(value, data.scale, data.gexType), 0, "history-cell");
    });
  });

  data.priceTicks.forEach((tick) => {
    const yPos = y(tick);
    line(svg, pad.left, yPos, width - pad.right, yPos, "#ffffff", "", "history-grid-line");
    const tickLabel = label(svg, pad.left - 12, yPos + 6, `$${price(tick)}`, "history-axis-label");
    tickLabel.setAttribute("text-anchor", "end");
  });
  data.xLabels.forEach((tick, index) => {
    const xPos = pad.left + (index / Math.max(data.xLabels.length - 1, 1)) * chartWidth;
    const [top, bottom] = tick.split("\n");
    label(svg, xPos - 18, height - 72, top, "history-axis-label");
    label(svg, xPos - 18, height - 54, bottom, "history-axis-label");
  });

  const pricePoints = data.priceSeries.map((value, index) => [x(index), y(value)]);
  const flipPoints = data.flipSeries.map((value, index) => [x(index), y(value)]);
  drawHistoryLine(svg, pricePoints, "#111111", 6, "history-price-outline");
  drawHistoryLine(svg, pricePoints, "#ffffff", 3.2, "history-price-line");
  drawHistoryLine(svg, flipPoints, "#111111", 5.5, "history-flip-outline");
  drawHistoryLine(svg, flipPoints, "#ff00ff", 3.2, "history-flip-line");
  const lastPrice = pricePoints.at(-1);
  const lastFlip = flipPoints.at(-1);
  label(svg, lastPrice[0] + 4, lastPrice[1] + 5, data.symbol ?? "BTC", "history-line-label", "#ffffff");
  label(svg, lastFlip[0] + 4, lastFlip[1] + 5, "F", "history-flip-label", "#ff00ff");
  const yAxisTitle = label(svg, 24, pad.top + chartHeight / 2 + 44, "Strike Price", "history-axis-title");
  yAxisTitle.setAttribute("transform", `rotate(-90 24 ${pad.top + chartHeight / 2 + 44})`);
  label(svg, width / 2 - 132, pad.top + chartHeight / 2 + 44, "GammaFlip.io", "history-watermark");
  renderHistoryLegend(svg, data, width, height);

  function x(index) {
    return pad.left + (index / Math.max(data.columns - 1, 1)) * chartWidth;
  }

  function y(value) {
    return pad.top + (1 - (value - yMin) / (yMax - yMin)) * chartHeight;
  }
}

function renderHistoryLegend(svg, data, width, height) {
  const x0 = 320;
  const y0 = height - 42;
  const legendWidth = 660;
  const steps = 90;
  for (let index = 0; index < steps; index += 1) {
    const t = index / (steps - 1);
    const value = data.scale.min + t * (data.scale.max - data.scale.min);
    rect(svg, x0 + t * legendWidth, y0, legendWidth / steps + 1, 18, historyHeatColor(value, data.scale, data.gexType), 0, "history-legend-cell");
  }
  data.scale.ticks.forEach((tick) => {
    const xPos = x0 + ((tick - data.scale.min) / (data.scale.max - data.scale.min || 1)) * legendWidth;
    line(svg, xPos, y0 + 18, xPos, y0 + 24, "#c9ced6", "", "history-legend-tick");
    label(svg, xPos - 8, y0 + 40, String(tick), "history-axis-label");
  });
  label(svg, x0 + legendWidth / 2 - 46, y0 + 62, `${data.gexType === "abs" ? "Abs" : "Net"} GEX ($M)`, "history-legend-title");
}

function drawHistoryLine(svg, points, stroke, width, className) {
  path(svg, points.map(([xPos, yPos], index) => `${index === 0 ? "M" : "L"} ${xPos} ${yPos}`).join(" "), "none", stroke, width, className);
}

function historyHeatColor(value, scale, gexType) {
  if (gexType === "abs") {
    const t = clamp(value / Math.max(scale.max, 1), 0, 1);
    return rgb(mix([247, 244, 185], [110, 58, 190], t));
  }
  if (value < 0) {
    const t = clamp(Math.abs(value / Math.min(scale.min, -1)), 0, 1);
    if (t < 0.48) return rgb(mix([248, 244, 184], [255, 167, 83], t / 0.48));
    return rgb(mix([255, 112, 64], [191, 0, 43], (t - 0.48) / 0.52));
  }
  const t = clamp(value / Math.max(scale.max, 1), 0, 1);
  if (t < 0.45) return rgb(mix([248, 246, 184], [189, 225, 113], t / 0.45));
  return rgb(mix([146, 206, 94], [0, 107, 63], (t - 0.45) / 0.55));
}

function interpolatePath(points, t) {
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    if (t <= next[0]) {
      const local = (t - prev[0]) / Math.max(next[0] - prev[0], 0.0001);
      return prev[1] + (next[1] - prev[1]) * local;
    }
  }
  return points.at(-1)[1];
}

function gaussian(value, center, width) {
  const z = (value - center) / Math.max(width, 1);
  return Math.exp(-0.5 * z * z);
}

function expiryBuckets() {
  const labels = ["Σ All", "3JUL26", "4JUL26", "5JUL26", "6JUL26", "10JUL26", "17JUL26", "24JUL26"];
  const dte = [-1, 0, 1, 2, 6, 13, 20, 27];
  const oi = [27e9, 2.7e9, 321e6, 115e6, 76e6, 1.5e9, 949e6, 68e6];
  const gexAbs = [426e6, 84e6, 28e6, 9.4e6, 8e6, 53e6, 31e6, 2.2e6];
  const gexNet = [80e6, 26e6, 10e6, 3.2e6, -759e3, 15e6, 15e6, 1.7e6];
  const pcRatio = [0.64, 0.84, 1.3, 1.08, 1.74, 0.85, 0.54, 0.14];
  const gexCp = [0.19, 0.31, 0.37, 0.34, -0.1, 0.27, 0.48, 0.78];
  const gexUd = [0.16, 0.12, -0.38, -0.25, -0.6, 0.07, 0.38, 0.8];
  const rrDeribit = [7.7, -1.7, -2.7, -4, -6.7, -7.6, -7.3];
  const rrOkx = [-3.5, -1.5, -2.5, -3.8, -6.9, -7.8, -7.2];
  const rrBybit = [-1.1, -1.4, -2.4, -3.3, -7, -7.5, -7];

  return labels.map((labelText, index) => ({
    label: labelText,
    dte: dte[index],
    oi: oi[index],
    gexAbs: gexAbs[index],
    gexNet: gexNet[index],
    pcRatio: pcRatio[index],
    gexCp: gexCp[index],
    gexUd: gexUd[index],
    deribit: 0.82,
    okx: 0.1,
    bybit: 0.08,
    rrDeribit: rrDeribit[index - 1],
    rrOkx: rrOkx[index - 1],
    rrBybit: rrBybit[index - 1],
  }));
}

function renderExpiryLevelsChart(svg, buckets, spotPrice) {
  const width = 1120;
  const height = 640;
  const pad = { top: 26, right: 28, bottom: 58, left: 86 };
  const chartBottom = height - pad.bottom;
  const labels = buckets.map((bucket) => bucket.label);
  const upperHigh = [63000, 62000, 62000, 63000, 63000, 64000, 66000, 68000];
  const upperLow = [62000, 61500, 61500, 62000, 62500, 63000, 64000, 66000];
  const lowerHigh = [60000, 61000, 59000, 60000, 60500, 58000, 60000, 61000];
  const lowerLow = [56000, 61000, 58500, 59000, 59500, 56000, 56000, 60000];
  const yMin = 55200;
  const yMax = 68800;
  const xStep = (width - pad.left - pad.right) / Math.max(labels.length - 1, 1);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  rect(svg, pad.left, pad.top, width - pad.left - pad.right, chartBottom - pad.top, "#0c1219", 0, "expiry-chart-bg");
  drawExpiryGrid(svg, width, height, pad, [56000, 58000, 60000, 62000, 64000, 66000, 68000], yMin, yMax);
  drawBand(upperLow, upperHigh, "#008000", "expiry-positive-band");
  drawBand(lowerLow, lowerHigh, "#ff174d", "expiry-negative-band");
  drawLineWithPoints(upperHigh, "#008000");
  drawLineWithPoints(upperLow, "#008000");
  drawLineWithPoints(lowerHigh, "#ff174d");
  drawLineWithPoints(lowerLow, "#ff174d");
  const spotY = y(spotPrice);
  line(svg, pad.left, spotY, width - pad.right, spotY, "#d9e3ee", "3 4", "spot-line");
  markerLabel(svg, pad.left - 8, spotY, `${formatStrike(spotPrice).toLowerCase()}`, "#ffffff", true);
  labels.forEach((text, index) => label(svg, x(index) - 20, height - 18, text, "axis-label"));
  label(svg, width / 2 - 110, height / 2 + 34, "GammaFlip.io", "watermark");

  function x(index) {
    return pad.left + index * xStep;
  }

  function y(value) {
    return pad.top + (1 - (value - yMin) / (yMax - yMin)) * (chartBottom - pad.top);
  }

  function points(values) {
    return values.map((value, index) => [x(index), y(value)]);
  }

  function drawBand(lowValues, highValues, color, className) {
    const high = points(highValues);
    const low = points(lowValues).reverse();
    const d = [...high, ...low].map(([xPos, yPos], index) => `${index === 0 ? "M" : "L"} ${xPos} ${yPos}`).join(" ") + " Z";
    path(svg, d, color === "#008000" ? "rgba(0, 128, 0, 0.22)" : "rgba(255, 23, 77, 0.2)", color, 2, className);
  }

  function drawLineWithPoints(values, color) {
    const pts = points(values);
    path(svg, pts.map(([xPos, yPos], index) => `${index === 0 ? "M" : "L"} ${xPos} ${yPos}`).join(" "), "none", color, 2);
    pts.forEach(([xPos, yPos]) => circle(svg, xPos, yPos, 3.2, color));
  }
}

function renderExpiryPositioningChart(svg, buckets, metric) {
  if (metric === "rr25") {
    renderExpiryRiskReversalChart(svg, buckets.slice(1));
    return;
  }

  if (["pcRatio", "gexCp", "gexUd"].includes(metric)) {
    renderExpiryRatioChart(svg, buckets, metric);
    return;
  }

  renderExpiryStackedBarChart(svg, buckets, metric);
}

function renderExpiryStackedBarChart(svg, buckets, metric) {
  const width = 1120;
  const height = 640;
  const pad = { top: 58, right: 28, bottom: 58, left: 86 };
  const chartBottom = height - pad.bottom;
  const values = buckets.map((bucket) => Math.abs(bucket[metric]));
  const max = Math.max(...values) * 1.18;
  const xStep = (width - pad.left - pad.right) / buckets.length;
  const barWidth = Math.min(104, xStep * 0.8);
  const colors = { deribit: "#08c38f", okx: "#42a5f5", bybit: "#ffad0a" };
  const yTicks =
    metric === "oi"
      ? [0, 5e9, 10e9, 15e9, 20e9, 25e9, 30e9]
      : metric === "gexNet"
        ? [0, 20e6, 40e6, 60e6, 80e6, 100e6]
        : [0, 100e6, 200e6, 300e6, 400e6, 500e6];

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  rect(svg, pad.left, pad.top, width - pad.left - pad.right, chartBottom - pad.top, "#0c1219", 0, "expiry-chart-bg");
  drawExpiryGrid(svg, width, height, pad, yTicks, 0, Math.max(max, yTicks.at(-1)));
  renderExchangeLegend(svg, width - 220, 28, metric === "gexNet");

  const netPoints = [];
  buckets.forEach((bucket, index) => {
    const raw = bucket[metric];
    const total = Math.abs(raw);
    const xPos = pad.left + index * xStep + (xStep - barWidth) / 2;
    let yBase = y(0);
    [
      ["deribit", total * bucket.deribit],
      ["okx", total * bucket.okx],
      ["bybit", total * bucket.bybit],
    ].forEach(([venue, value]) => {
      const yTop = y(value + (yValueFromPixel(yBase) || 0));
      rect(svg, xPos, yTop, barWidth, yBase - yTop, colors[venue], 0);
      yBase = yTop;
    });
    const topY = y(total);
    const labelText = metric === "oi" ? `$${money(total)}` : money(raw);
    label(svg, xPos + barWidth / 2 - 18, topY - 8, labelText, "expiry-value-label");
    label(svg, xPos + barWidth / 2 - 22, height - 18, bucket.label, "axis-label");
    netPoints.push([xPos + barWidth / 2, y(Math.max(raw, 0)), raw]);
  });

  line(svg, pad.left + xStep, pad.top, pad.left + xStep, chartBottom, "#d9e3ee", "2 4", "expiry-marker-line");
  label(svg, 20, height / 2, metric === "oi" ? "Open Interest (USD)" : "GEX per 1% Move", "axis-title");

  if (metric === "gexNet") {
    const linePath = netPoints.map(([xPos, yPos], index) => `${index === 0 ? "M" : "L"} ${xPos} ${yPos}`).join(" ");
    path(svg, linePath, "none", "#f2f5f9", 2, "expiry-net-line");
    netPoints.forEach(([xPos, yPos, raw]) => {
      diamond(svg, xPos, yPos, 6, "#ff5b6f", "#ffffff");
      label(svg, xPos - 16, yPos + (raw < 0 ? 24 : -14), money(raw), "expiry-value-label");
    });
  }

  function y(value) {
    return pad.top + (1 - value / Math.max(max, yTicks.at(-1))) * (chartBottom - pad.top);
  }

  function yValueFromPixel(pixel) {
    return (1 - (pixel - pad.top) / (chartBottom - pad.top)) * Math.max(max, yTicks.at(-1));
  }
}

function renderExpiryRatioChart(svg, buckets, metric) {
  const width = 1120;
  const height = 640;
  const pad = { top: 58, right: 28, bottom: 58, left: 86 };
  const chartBottom = height - pad.bottom;
  const values = buckets.map((bucket) => bucket[metric]);
  const domain = metric === "pcRatio" ? { min: 0, max: 2.05, ticks: [0, 0.5, 1, 1.5, 2], base: 0, ref: 1 } : { min: -1, max: 1, ticks: [-1, -0.5, 0, 0.5, 1], base: 0, ref: 0 };
  const xStep = (width - pad.left - pad.right) / buckets.length;
  const barWidth = Math.min(104, xStep * 0.8);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  rect(svg, pad.left, pad.top, width - pad.left - pad.right, chartBottom - pad.top, "#0c1219", 0, "expiry-chart-bg");
  drawExpiryGrid(svg, width, height, pad, domain.ticks, domain.min, domain.max);
  line(svg, pad.left, y(domain.ref), width - pad.right, y(domain.ref), "#d9e3ee", "8 8", "zero-line");
  line(svg, pad.left + xStep, pad.top, pad.left + xStep, chartBottom, "#d9e3ee", "2 4", "expiry-marker-line");

  values.forEach((value, index) => {
    const xPos = pad.left + index * xStep + (xStep - barWidth) / 2;
    const y0 = y(domain.base);
    const y1 = y(value);
    const color = ratioColor(value, metric);
    rect(svg, xPos, Math.min(y0, y1), barWidth, Math.abs(y1 - y0), color, 0);
    label(svg, xPos + barWidth / 2 - 12, y1 + (value < domain.base ? 18 : -8), value.toFixed(2), "expiry-value-label");
    label(svg, xPos + barWidth / 2 - 22, height - 18, buckets[index].label, "axis-label");
  });

  label(svg, 20, height / 2, { pcRatio: "Put/Call Ratio", gexCp: "GEX C/P", gexUd: "GEX U/D" }[metric], "axis-title");

  function y(value) {
    return pad.top + (1 - (value - domain.min) / (domain.max - domain.min)) * (chartBottom - pad.top);
  }
}

function renderExpiryRiskReversalChart(svg, buckets) {
  const width = 1120;
  const height = 640;
  const pad = { top: 58, right: 28, bottom: 58, left: 86 };
  const chartBottom = height - pad.bottom;
  const domain = { min: -9.5, max: 9.2, ticks: [-8, -6, -4, -2, 0, 2, 4, 6, 8] };
  const xStep = (width - pad.left - pad.right) / Math.max(buckets.length - 1, 1);
  const series = [
    ["Deribit", "rrDeribit", "#08c38f"],
    ["Okx", "rrOkx", "#42a5f5"],
    ["Bybit", "rrBybit", "#ffad0a"],
  ];

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  rect(svg, pad.left, pad.top, width - pad.left - pad.right, chartBottom - pad.top, "#0c1219", 0, "expiry-chart-bg");
  drawExpiryGrid(svg, width, height, pad, domain.ticks, domain.min, domain.max);
  line(svg, pad.left, y(0), width - pad.right, y(0), "#d9e3ee", "", "zero-line");
  series.forEach(([name, field, color], seriesIndex) => {
    const pts = buckets.map((bucket, index) => [pad.left + index * xStep, y(bucket[field])]);
    path(svg, pts.map(([xPos, yPos], index) => `${index === 0 ? "M" : "L"} ${xPos} ${yPos}`).join(" "), "none", color, 2.4);
    pts.forEach(([xPos, yPos]) => circle(svg, xPos, yPos, 3.4, color));
    const legendX = width - 235 + seriesIndex * 80;
    line(svg, legendX, 34, legendX + 28, 34, color, "", "legend-line");
    circle(svg, legendX + 14, 34, 3.4, color);
    label(svg, legendX + 36, 39, name, "legend-label");
  });
  buckets.forEach((bucket, index) => label(svg, pad.left + index * xStep - 24, height - 18, bucket.label, "axis-label"));
  label(svg, 20, height / 2, "25Δ RR (vol points)", "axis-title");

  function y(value) {
    return pad.top + (1 - (value - domain.min) / (domain.max - domain.min)) * (chartBottom - pad.top);
  }
}

function drawExpiryGrid(svg, width, height, pad, ticks, min, max) {
  const chartBottom = height - pad.bottom;
  ticks.forEach((tick) => {
    const yPos = pad.top + (1 - (tick - min) / (max - min || 1)) * (chartBottom - pad.top);
    line(svg, pad.left, yPos, width - pad.right, yPos, "#2a333d", "", "grid-line");
    label(svg, pad.left - 34, yPos + 4, expiryAxisValue(tick), "axis-label");
  });
  for (let index = 0; index <= 8; index += 1) {
    const xPos = pad.left + (index / 8) * (width - pad.left - pad.right);
    line(svg, xPos, pad.top, xPos, chartBottom, "#2a333d", "", "grid-line");
  }
}

function renderExchangeLegend(svg, x, y, includeNet = false) {
  [
    ["Bybit", "#ffad0a"],
    ["Okx", "#42a5f5"],
    ["Deribit", "#08c38f"],
  ].forEach(([name, color], index) => {
    const xPos = x + index * 68;
    rect(svg, xPos, y, 12, 12, color, 0);
    label(svg, xPos + 22, y + 11, name, "legend-label");
  });
  if (includeNet) {
    diamond(svg, x + 210, y + 6, 5, "#ff5b6f", "#ffffff");
    line(svg, x + 220, y + 6, x + 244, y + 6, "#ffffff", "3 4", "legend-line");
    label(svg, x + 252, y + 11, "Net", "legend-label");
  }
}

function ratioColor(value, metric) {
  if (metric === "gexUd") return value >= 0 ? "#7fb4e8" : "#5b92cf";
  if (value < 0) return "#d22a2d";
  if (metric === "pcRatio") return value > 1 ? (value > 1.55 ? "#cf2529" : "#e99898") : "#9bc59e";
  return value >= 0 ? "#94be97" : "#d22a2d";
}

function expiryAxisValue(value) {
  if (Math.abs(value) >= 1e9) return `$${Math.round(value / 1e9)}B`;
  if (Math.abs(value) >= 1e6) return `${Math.round(value / 1e6)}M`;
  return String(value);
}

function renderStudioTermStructureChart(svg, { rows, expiries, spotPrice, watermarked = false }) {
  const width = 1120;
  const height = 520;
  const pad = { top: 34, right: 34, bottom: 54, left: 92 };
  const strikes = [...new Set(rows.map((row) => row.strike))].sort((a, b) => a - b);
  const expiryRows = (expiries?.length ? expiries : [])
    .map((row) => row.expiry)
    .filter(Boolean);
  const expiriesToRender = expiryRows.length ? expiryRows : [...new Set(rows.map((row) => row.expiry))].filter(Boolean);
  const matrix = new Map(rows.map((row) => [`${row.expiry}:${row.strike}`, row.gex]));
  const values = rows.map((row) => row.gex);
  const min = Math.min(...values, -1);
  const max = Math.max(...values, 1);
  const gridWidth = width - pad.left - pad.right;
  const gridHeight = height - pad.top - pad.bottom;
  const cellWidth = gridWidth / Math.max(strikes.length, 1);
  const cellHeight = gridHeight / Math.max(expiriesToRender.length, 1);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  rect(svg, pad.left, pad.top, gridWidth, gridHeight, "#102a43", 8, "chart-surface");

  expiriesToRender.forEach((expiry, rowIndex) => {
    const yPos = pad.top + rowIndex * cellHeight;
    label(svg, 22, yPos + cellHeight * 0.62, formatExpiryCode(expiry), "axis-label");
    strikes.forEach((strike, columnIndex) => {
      const value = matrix.get(`${expiry}:${strike}`) ?? 0;
      const xPos = pad.left + columnIndex * cellWidth;
      rect(svg, xPos + 1, yPos + 1, Math.max(cellWidth - 2, 2), Math.max(cellHeight - 2, 2), heatColor(value, min, max, "net"), 3, "term-cell");
    });
  });

  strikes.forEach((strike, index) => {
    if (index % Math.ceil(strikes.length / 8) === 0) {
      label(svg, pad.left + index * cellWidth, height - 18, formatStrike(strike), "axis-label");
    }
  });

  const minStrike = Math.min(...strikes, spotPrice);
  const maxStrike = Math.max(...strikes, spotPrice);
  const spotX = pad.left + ((spotPrice - minStrike) / Math.max(maxStrike - minStrike, 1)) * gridWidth;
  line(svg, spotX, pad.top, spotX, height - pad.bottom, "#e5eef8", "4 4", "spot-line");
  markerLabel(svg, spotX, height - 72, price(spotPrice), "#e5eef8", true);
  label(svg, 20, 260, "Expiry", "axis-title");
  label(svg, width / 2 - 20, height - 4, "Strike", "axis-label");
  if (watermarked) {
    label(svg, width / 2 - 110, height / 2 + 20, "GEX Research", "watermark");
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
  els.refreshButton.textContent = state.category === "history" ? "↻" : state.live ? "50s" : "Paused";
  const point = state.dashboard?.trends?.points?.[state.timeIndex];
  if (point) {
    els.dataTimestamp.textContent = `${formatTimestamp(state.dashboard.asOf)} · ${point.time}`;
  }
  document.body.classList.toggle("is-paused", !state.live);
}

function renderDualStrikeChart(
  svg,
  {
    rows,
    keyLevels,
    spotPrice,
    zoomPct = 100,
    panOffset = 0,
    layers = { positive: true, negative: true, absolute: true, regime: true },
    selectedMarkerId = "",
    crosshair = null,
    watermarked = false,
  },
) {
  const collapsed = collapseRows(rows);
  const visible = filterByZoom(collapsed, spotPrice, zoomPct, panOffset);
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
  const selected = keyLevels.find((level) => level.id === selectedMarkerId);
  const visibleLevels = layers.regime ? keyLevels : selected ? [selected] : [];

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  rect(svg, pad.left, pad.top, width - pad.left - pad.right, topBottom - pad.top, "#102a43", 8, "chart-surface");
  rect(svg, pad.left, bottomTop, width - pad.left - pad.right, height - pad.bottom - bottomTop, "#102a43", 8, "chart-surface");
  addGrid(svg, width, topBottom + 8, pad, maxNet);
  line(svg, pad.left, zeroY, width - pad.right, zeroY, "#d6e6f8", "3 5", "zero-line");

  if (layers.regime) {
    visibleLevels.forEach((level) => {
      const widthPx = Math.max(barWidth * 1.2, 18);
      rect(svg, x(level.strike) - widthPx / 2, pad.top, widthPx, height - pad.bottom - pad.top, colorToArea(level.color), 4, "regime-band");
    });
  }

  if (selected) {
    const widthPx = Math.max(barWidth * 2.5, 28);
    rect(svg, x(selected.strike) - widthPx / 2, pad.top, widthPx, height - pad.bottom - pad.top, colorToArea(selected.color), 6, "selected-marker-band");
  }

  visible.forEach((row) => {
    if (row.gex > 0 && !layers.positive) return;
    if (row.gex < 0 && !layers.negative) return;
    const xPos = x(row.strike) - barWidth / 2;
    const yPos = row.gex >= 0 ? yTop(row.gex) : zeroY;
    const barHeight = Math.abs(yTop(row.gex) - zeroY);
    rect(svg, xPos, yPos, barWidth, barHeight, row.gex >= 0 ? "#31c46b" : "#e5384f", 3);
  });

  visible.forEach((row) => {
    label(svg, x(row.strike) - 15, height - 16, formatStrike(row.strike), "axis-label");
  });

  const areaPoints = visible.map((row) => [x(row.strike), yBottom(Math.abs(row.gex))]);
  if (layers.absolute && areaPoints.length > 1) {
    const areaPath = [
      `M ${areaPoints[0][0]} ${height - pad.bottom}`,
      ...areaPoints.map(([xPos, yPos]) => `L ${xPos} ${yPos}`),
      `L ${areaPoints.at(-1)[0]} ${height - pad.bottom}`,
      "Z",
    ].join(" ");
    path(svg, areaPath, "rgba(125, 32, 255, 0.38)", "#7d20ff", 2, "abs-area");
  }

  visibleLevels.forEach((level) => {
    const pos = x(level.strike);
    line(svg, pos, pad.top, pos, height - pad.bottom, level.color, level.id === selectedMarkerId ? "" : "3 4", level.id === selectedMarkerId ? "marker-line selected-marker-line" : "marker-line");
    markerLabel(svg, pos, level.value < 0 ? zeroY + 22 : pad.top + 16, shortLevel(level.id), level.color);
  });
  line(svg, x(spotPrice), pad.top, x(spotPrice), height - pad.bottom, "#e5eef8", "4 4", "spot-line");
  markerLabel(svg, x(spotPrice), topBottom + 16, price(spotPrice), "#e5eef8", true);

  if (Number.isFinite(crosshair)) {
    const boundedStrike = clamp(crosshair, minStrike, maxStrike);
    const crossX = x(boundedStrike);
    line(svg, crossX, pad.top, crossX, height - pad.bottom, "#e5eef8", "2 3", "crosshair-line");
    line(svg, pad.left, zeroY, width - pad.right, zeroY, "#e5eef8", "2 6", "crosshair-line faint");
    markerLabel(svg, crossX, height - 70, formatStrike(boundedStrike), "#e5eef8", true);
  }

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
  document.body.dataset.page = page;
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

function setActiveByDataset(container, key, value) {
  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset[key] === value);
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

function selectedMarker() {
  return state.studio?.markers?.keyLevels?.find((level) => level.id === state.selectedMarkerId);
}

function strikeFromPointer(event) {
  if (!state.studio) return null;
  const domain = visibleStrikeDomain();
  if (!domain) return null;
  const rect = els.studioStrikeChart.getBoundingClientRect();
  const percent = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  return domain.min + (domain.max - domain.min) * percent;
}

function visibleStrikeDomain() {
  if (!state.studio?.rows?.length) return null;
  const collapsed = collapseRows(state.studio.rows);
  const visible = filterByZoom(collapsed, state.studio.spotPrice, state.zoom, state.panOffset);
  const min = Math.min(...visible.map((row) => row.strike), state.studio.spotPrice);
  const max = Math.max(...visible.map((row) => row.strike), state.studio.spotPrice);
  return { min, max };
}

function filterByZoom(rows, spotPrice, zoomPct, panOffset = 0) {
  if (zoomPct >= 95) return rows;
  const distance = spotPrice * (zoomPct / 100);
  const center = spotPrice + panOffset * distance * 0.45;
  const filtered = rows.filter((row) => row.strike >= center - distance && row.strike <= center + distance);
  return filtered.length >= 4 ? filtered : rows;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function circle(svg, cx, cy, r, fill, className = "") {
  const node = svgNode("circle", { cx, cy, r, fill, class: className });
  svg.append(node);
}

function diamond(svg, cx, cy, r, fill, stroke = "") {
  const d = `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
  path(svg, d, fill, stroke, stroke ? 2 : 0, "diamond-marker");
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
  return node;
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
    negative_2: "N2",
    negative_1: "N1",
    absolute_2: "A2",
    absolute_1: "A1",
    positive_1: "P1",
    positive_2: "P2",
  }[id] ?? id.slice(0, 2).toUpperCase();
}
