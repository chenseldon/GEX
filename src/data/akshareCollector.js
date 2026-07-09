import {
  normalizeAkshareCommodityOptionTable,
  normalizeAkshareFinancialOptions,
} from "../integrations/akshareNormalize.js";

const NORMALIZER_BY_ROLE = {
  option_board: normalizeAkshareFinancialOptions,
  option_table: normalizeAkshareCommodityOptionTable,
};

export function buildTradFiSnapshotFromAkshareReport(report) {
  const rawSnapshots = Array.isArray(report?.snapshots)
    ? report.snapshots
    : Array.isArray(report?.plans)
      ? report.plans
      : [];
  const snapshots = rawSnapshots.length
    ? rawSnapshots.map((snapshot) => normalizeAkshareSnapshot(snapshot, report))
    : [];
  return {
    sourceName: report?.sourceName ?? "akshare",
    observedAt: report?.observedAt ?? new Date().toISOString(),
    requestedSymbols: Array.isArray(report?.requestedSymbols) ? report.requestedSymbols : [],
    status: report?.status ?? "unavailable",
    snapshots,
    warnings: Array.isArray(report?.warnings) ? report.warnings : [],
  };
}

export function normalizeAkshareSnapshot(snapshot, report = {}) {
  const normalized = emptyNormalizedReport();
  const groups = Array.isArray(snapshot?.rawRows) ? snapshot.rawRows : [];
  for (const group of groups) {
    const normalizer = NORMALIZER_BY_ROLE[group?.role];
    if (!normalizer) continue;
    const result = normalizer(Array.isArray(group.rows) ? group.rows : [], {
      ...metadataFromSnapshot(snapshot, report),
      sourceName: "AKShare",
    });
    normalized.contracts.push(...result.contracts);
    normalized.skippedRows.push(...result.skippedRows);
    addWarnings(normalized.warnings, result.warnings);
  }

  return {
    ...snapshot,
    normalized,
  };
}

function metadataFromSnapshot(snapshot, report) {
  const placeholders = snapshot?.metadataPlaceholders ?? {};
  return {
    symbol: snapshot?.symbol,
    venue: snapshot?.venue,
    region: snapshot?.region,
    underlying: snapshot?.underlying,
    expiry: placeholders.expiry ?? snapshot?.expiry ?? null,
    impliedVolatility: placeholders.impliedVolatility ?? snapshot?.impliedVolatility ?? null,
    gamma: placeholders.gamma ?? snapshot?.gamma ?? null,
    contractMultiplier: placeholders.contractMultiplier ?? snapshot?.contractMultiplier ?? null,
    underlyingPrice: placeholders.underlyingPrice ?? snapshot?.underlyingPrice ?? null,
    model: placeholders.model ?? snapshot?.model ?? null,
    riskFreeRate: placeholders.riskFreeRate ?? snapshot?.riskFreeRate ?? null,
    asOf: report?.observedAt ?? snapshot?.observedAt ?? new Date().toISOString(),
  };
}

function emptyNormalizedReport() {
  return {
    contracts: [],
    skippedRows: [],
    warnings: {
      missingIv: 0,
      missingOi: 0,
      missingMultiplier: 0,
      missingUnderlyingPrice: 0,
      skippedContracts: 0,
    },
  };
}

function addWarnings(target, source) {
  target.missingIv += Number(source?.missingIv ?? 0);
  target.missingOi += Number(source?.missingOi ?? 0);
  target.missingMultiplier += Number(source?.missingMultiplier ?? 0);
  target.missingUnderlyingPrice += Number(source?.missingUnderlyingPrice ?? 0);
  target.skippedContracts += Number(source?.skippedContracts ?? 0);
}
