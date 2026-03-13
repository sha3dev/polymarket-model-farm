/**
 * @section imports:internals
 */

import config from "../config.ts";
import type { DashboardModelCard, DashboardPayload } from "./index.ts";

/**
 * @section consts
 */

const DASHBOARD_PAGE_STYLES = `
  :root { color-scheme: dark; --bg: #071019; --panel: #0f1b2b; --panel-alt: #132235; --line: rgba(166, 190, 220, 0.16); --text: #f4f7fb; --muted: #8da2bb; --soft: #bfd0e3; --up: #3fe08a; --down: #ff6f6f; --flat: #f4c86a; --accent: #7dc6ff; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; background: linear-gradient(180deg, #071019 0%, #091521 100%); color: var(--text); }
  main { width: min(1700px, calc(100vw - 24px)); margin: 0 auto; padding: 14px 0 22px; }
  h1, h2, h3, h4, p { margin: 0; }
  .update-bar, .card, .history-panel { border: 1px solid var(--line); background: var(--panel); }
  .update-bar { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 16px; margin-bottom: 12px; }
  .eyebrow, .hint-label, th { display: block; text-transform: uppercase; letter-spacing: 0.14em; font-size: 10px; color: var(--muted); }
  .update-bar p, .section-heading p, .history-caption { color: var(--muted); line-height: 1.45; }
  .update-value, .fact-value { display: block; margin-top: 4px; font-size: 16px; color: var(--text); }
  .section-heading { display: flex; justify-content: space-between; gap: 12px; align-items: end; margin: 14px 0 8px; }
  .section-heading h2 { font-size: 16px; letter-spacing: -0.02em; }
  .section-heading p { font-size: 12px; }
  .window-row { overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; scrollbar-color: rgba(125, 198, 255, 0.45) transparent; }
  .window-row::-webkit-scrollbar { height: 8px; }
  .window-row::-webkit-scrollbar-thumb { background: rgba(125, 198, 255, 0.45); border-radius: 999px; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(320px, 1fr)); min-width: 1310px; }
  .card { border-radius: 16px; padding: 12px; min-width: 0; }
  .card.up { box-shadow: inset 0 0 0 1px rgba(63, 224, 138, 0.24); }
  .card.down { box-shadow: inset 0 0 0 1px rgba(255, 111, 111, 0.24); }
  .card.flat { box-shadow: inset 0 0 0 1px rgba(244, 200, 106, 0.24); }
  .card-header, .status-row, .history-header { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
  .card-header { margin-bottom: 8px; }
  .card-title h3 { font-size: 17px; letter-spacing: -0.02em; }
  .card-title p { margin-top: 2px; color: var(--muted); font-size: 11px; }
  .direction-pill { min-width: 74px; text-align: center; border-radius: 999px; padding: 7px 9px; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; background: rgba(255,255,255,0.05); }
  .card.up .direction-pill, .card.up .direction-value { color: var(--up); }
  .card.down .direction-pill, .card.down .direction-value { color: var(--down); }
  .card.flat .direction-pill, .card.flat .direction-value { color: var(--flat); }
  .status-row { margin-bottom: 8px; padding: 0 0 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .direction-value { display: block; font-size: 20px; font-weight: 700; letter-spacing: -0.03em; }
  .progress-shell { margin-top: 6px; min-width: 120px; }
  .progress-header { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; color: var(--soft); margin-bottom: 6px; }
  .progress-track { width: 100%; height: 6px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,0.08); }
  .progress-track span { display: block; height: 100%; background: linear-gradient(90deg, var(--accent), #b6f5d2); }
  .fact-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 14px; row-gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
  .fact-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: baseline; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .fact-item:nth-last-child(-n + 3) { border-bottom: 0; }
  .hint-label { cursor: help; width: fit-content; }
  .history-panel { border: 0; border-top: 1px solid rgba(255,255,255,0.08); border-radius: 0; padding: 8px 0 0; margin-top: 8px; background: transparent; }
  .history-panel summary { display: flex; justify-content: space-between; gap: 12px; align-items: center; cursor: pointer; list-style: none; }
  .history-panel summary::-webkit-details-marker { display: none; }
  .history-panel[open] summary { margin-bottom: 8px; }
  .history-toggle { color: var(--soft); font-size: 11px; }
  .history-header h4 { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
  td { color: var(--soft); font-size: 11px; }
  .empty-cell { color: var(--muted); }
  @media (max-width: 720px) { main { width: min(100vw - 16px, 1700px); padding-top: 12px; } .fact-list, .grid { grid-template-columns: 1fr; } .window-row { overflow: visible; } .grid { min-width: auto; } .update-bar, .section-heading, .card-header, .status-row, .history-header, .progress-header { flex-direction: column; align-items: start; } }
`;

const DASHBOARD_REFRESH_SCRIPT = `<script>
  const dashboardRoot = document.getElementById("dashboard-root");
  const readOpenHistoryKeys = () => Array.from(document.querySelectorAll('[data-history-key][open]')).map((element) => element.getAttribute("data-history-key")).filter((key) => key !== null);
  const restoreOpenHistoryKeys = (openHistoryKeys) => {
    openHistoryKeys.forEach((historyKey) => {
      const historyElement = document.querySelector('[data-history-key="' + historyKey + '"]');
      if (historyElement) {
        historyElement.setAttribute("open", "open");
      }
    });
  };
  const renderFact = (label, value, hint) => '<li class="fact-item"><span class="hint-label" title="' + hint + '">' + label + '</span><strong class="fact-value">' + value + '</strong></li>';
  const renderHistoryRows = (card) => {
    const resolvedHistory = card.predictionHistory.filter((entry) => entry.actualDirection !== null).slice(0, 6);
    const historyRows = resolvedHistory.map((entry) => '<tr><td>' + entry.marketEnd + '</td><td>' + entry.predictedDirection + '</td><td>' + (entry.actualDirection || "-") + '</td><td>' + entry.confidence.toFixed(2) + '</td><td>' + (entry.isCorrect ? "Hit" : "Miss") + '</td></tr>').join("");
    const historyMarkup = historyRows || '<tr><td colspan="5" class="empty-cell">No resolved predictions yet.</td></tr>';
    return historyMarkup;
  };
  const renderCard = (card) => {
    const directionClassName = card.currentDirection.toLowerCase();
    const liveMarketStatus = card.liveMarketSlug ? "Live" : "Idle";
    const progressPercent = (card.progress * 100).toFixed(2);
    const predictionDirection = card.latestPrediction?.predictedDirection || "WAITING";
    const predictionConfidence = card.latestPrediction?.confidence.toFixed(2) || "--";
    const predictionTimestamp = card.latestPrediction?.predictionMadeAt || card.latestPrediction?.marketEnd || "Open";
    const liveUpPrice = card.liveUpPrice === null ? "--" : card.liveUpPrice.toFixed(3);
    const liveDownPrice = card.liveDownPrice === null ? "--" : card.liveDownPrice.toFixed(3);
    const predictedContractPrice = card.latestPrediction ? card.latestPrediction.predictedDirection === "UP" ? card.latestPrediction.upPrice : card.latestPrediction.downPrice : null;
    const predictedContractPriceValue = predictedContractPrice === null ? "--" : predictedContractPrice.toFixed(3);
    const upContractPrice = card.latestPrediction?.upPrice ?? null;
    const downContractPrice = card.latestPrediction?.downPrice ?? null;
    const referencePrice = card.referencePrice === null ? "N/A" : card.referencePrice.toFixed(2);
    const targetPrice = card.priceToBeat === null ? "N/A" : card.priceToBeat.toFixed(2);
    const scoreValue = card.scorePercent === null ? "--" : card.scorePercent.toFixed(1) + '%';
    const scoreDetail = card.correctPredictionCount + '/' + card.resolvedPredictionCount;
    const historyRowCount = Math.min(card.predictionHistory.filter((entry) => entry.actualDirection !== null).length, 6);
    const factMarkup = [
      renderFact("Chainlink", referencePrice, "Latest Chainlink price from the collector snapshot."),
      renderFact("Live UP", liveUpPrice, "Current UP contract price from the latest collector snapshot."),
      renderFact("Live DOWN", liveDownPrice, "Current DOWN contract price from the latest collector snapshot."),
      renderFact("Score", scoreValue, "Resolved prediction accuracy for this slot."),
      renderFact("Score hits", scoreDetail, "Correct predictions vs total resolved predictions."),
      renderFact("Target", targetPrice, "Strike price the market must finish above or below."),
      renderFact("Snapshots", String(card.snapshotCount), "Snapshots ingested for the current live market."),
      renderFact("Confidence", predictionConfidence, "Model confidence for the latest directional call."),
      renderFact("Entry price", predictedContractPriceValue, "Polymarket contract price we would have bought following the predicted side."),
      renderFact("UP price", upContractPrice === null ? "--" : upContractPrice.toFixed(3), "UP contract price at the exact moment the prediction was stored."),
      renderFact("DOWN price", downContractPrice === null ? "--" : downContractPrice.toFixed(3), "DOWN contract price at the exact moment the prediction was stored."),
      renderFact("Updated", predictionTimestamp, "Timestamp of the latest stored prediction event."),
      renderFact("Trained", String(card.modelStatus.trainedMarketCount), "Closed markets already used for model training."),
      renderFact("Pending closed", String(card.pendingClosedMarketCount), "Closed markets still waiting to be trained."),
      renderFact("Model", card.modelStatus.modelVersion, "Loaded checkpoint version serving this slot.")
    ].join("");
    return '<section class="card ' + directionClassName + '"><header class="card-header"><div class="card-title"><h3>' + card.asset.toUpperCase() + ' ' + card.window + '</h3><p>' + liveMarketStatus + '</p></div><div class="direction-pill">' + card.currentDirection + '</div></header><section class="status-row"><div><span class="hint-label" title="Current model direction for the live market.">Latest call</span><strong class="direction-value">' + predictionDirection + '</strong></div><div class="progress-shell"><div class="progress-header"><span class="hint-label" title="Elapsed share between market start and market end.">Market progress</span><strong>' + progressPercent + '%</strong></div><div class="progress-track"><span style="width:' + progressPercent + '%"></span></div></div></section><ul class="fact-list">' + factMarkup + '</ul><details class="history-panel" data-history-key="' + card.asset + '-' + card.window + '"><summary><div class="history-header"><div><span class="hint-label" title="Resolved predictions for this slot, ordered by recency.">Model vs actual</span><h4>Resolved prediction history</h4></div><p class="history-caption">Latest ' + historyRowCount + ' settled rows</p></div><span class="history-toggle">Click to expand</span></summary><table><thead><tr><th>Market End</th><th>Model</th><th>Actual</th><th>Conf</th><th>Result</th></tr></thead><tbody>' + renderHistoryRows(card) + '</tbody></table></details></section>';
  };
  const renderWindowSection = (windowLabel, cards) => '<section><div class="section-heading"><div><span class="eyebrow">' + windowLabel + '</span><h2>' + windowLabel + ' model slots</h2></div><p>' + cards.length + ' cards</p></div><div class="window-row"><div class="grid">' + cards.map((card) => renderCard(card)).join("") + '</div></div></section>';
  const renderDashboard = (payload) => {
    const openHistoryKeys = readOpenHistoryKeys();
    const fiveMinuteCards = payload.cards.filter((card) => card.window === "5m");
    const fifteenMinuteCards = payload.cards.filter((card) => card.window === "15m");
    dashboardRoot.innerHTML = '<section class="update-bar"><div><span class="eyebrow">Last update</span><strong class="update-value">' + payload.generatedAt + '</strong></div></section>' + renderWindowSection("5m", fiveMinuteCards) + renderWindowSection("15m", fifteenMinuteCards);
    restoreOpenHistoryKeys(openHistoryKeys);
  };
  const refreshDashboard = async () => {
    try {
      const response = await window.fetch("/api/dashboard", { headers: { accept: "application/json" } });
      if (response.ok) {
        renderDashboard(await response.json());
      }
    } catch (_error) {
    }
  };
  window.setInterval(() => {
    void refreshDashboard();
  }, 1000);
</script>`;

/**
 * @section public:properties
 */

export class DashboardPageService {
  /**
   * @section constructor
   */

  public constructor() {}

  /**
   * @section private:methods
   */

  private renderHistoryRows(card: DashboardModelCard): string {
    const historyRows = card.predictionHistory
      .filter((entry) => entry.actualDirection !== null)
      .slice(0, 6)
      .map(
        (entry) =>
          `<tr><td>${entry.marketEnd}</td><td>${entry.predictedDirection}</td><td>${entry.actualDirection || "-"}</td><td>${entry.confidence.toFixed(2)}</td><td>${entry.isCorrect ? "Hit" : "Miss"}</td></tr>`,
      )
      .join("");
    const historyMarkup = historyRows || `<tr><td colspan="5" class="empty-cell">No resolved predictions yet.</td></tr>`;
    return historyMarkup;
  }

  private renderFact(label: string, value: string, hint: string): string {
    const factMarkup = `<li class="fact-item"><span class="hint-label" title="${hint}">${label}</span><strong class="fact-value">${value}</strong></li>`;
    return factMarkup;
  }

  private renderCard(card: DashboardModelCard): string {
    const directionClassName = card.currentDirection.toLowerCase();
    const liveMarketStatus = card.liveMarketSlug ? "Live" : "Idle";
    const progressPercent = (card.progress * 100).toFixed(2);
    const predictionDirection = card.latestPrediction?.predictedDirection || "WAITING";
    const predictionConfidence = card.latestPrediction?.confidence.toFixed(2) || "--";
    const predictionTimestamp = card.latestPrediction?.predictionMadeAt || card.latestPrediction?.marketEnd || "Open";
    const liveUpPrice = card.liveUpPrice === null ? "--" : card.liveUpPrice.toFixed(3);
    const liveDownPrice = card.liveDownPrice === null ? "--" : card.liveDownPrice.toFixed(3);
    const predictedContractPrice = card.latestPrediction
      ? card.latestPrediction.predictedDirection === "UP"
        ? card.latestPrediction.upPrice
        : card.latestPrediction.downPrice
      : null;
    const predictedContractPriceValue = predictedContractPrice === null ? "--" : predictedContractPrice.toFixed(3);
    const upContractPrice = card.latestPrediction?.upPrice ?? null;
    const downContractPrice = card.latestPrediction?.downPrice ?? null;
    const referencePrice = card.referencePrice === null ? "N/A" : card.referencePrice.toFixed(2);
    const targetPrice = card.priceToBeat === null ? "N/A" : card.priceToBeat.toFixed(2);
    const scoreValue = card.scorePercent === null ? "--" : `${card.scorePercent.toFixed(1)}%`;
    const scoreDetail = `${card.correctPredictionCount}/${card.resolvedPredictionCount}`;
    const historyRowCount = Math.min(card.predictionHistory.filter((entry) => entry.actualDirection !== null).length, 6);
    const factMarkup = [
      this.renderFact("Chainlink", referencePrice, "Latest Chainlink price from the collector snapshot."),
      this.renderFact("Live UP", liveUpPrice, "Current UP contract price from the latest collector snapshot."),
      this.renderFact("Live DOWN", liveDownPrice, "Current DOWN contract price from the latest collector snapshot."),
      this.renderFact("Score", scoreValue, "Resolved prediction accuracy for this slot."),
      this.renderFact("Score hits", scoreDetail, "Correct predictions vs total resolved predictions."),
      this.renderFact("Target", targetPrice, "Strike price the market must finish above or below."),
      this.renderFact("Snapshots", String(card.snapshotCount), "Snapshots ingested for the current live market."),
      this.renderFact("Confidence", predictionConfidence, "Model confidence for the latest directional call."),
      this.renderFact("Entry price", predictedContractPriceValue, "Polymarket contract price we would have bought following the predicted side."),
      this.renderFact(
        "UP price",
        upContractPrice === null ? "--" : upContractPrice.toFixed(3),
        "UP contract price at the exact moment the prediction was stored.",
      ),
      this.renderFact(
        "DOWN price",
        downContractPrice === null ? "--" : downContractPrice.toFixed(3),
        "DOWN contract price at the exact moment the prediction was stored.",
      ),
      this.renderFact("Updated", predictionTimestamp, "Timestamp of the latest stored prediction event."),
      this.renderFact("Trained", String(card.modelStatus.trainedMarketCount), "Closed markets already used for model training."),
      this.renderFact("Pending closed", String(card.pendingClosedMarketCount), "Closed markets still waiting to be trained."),
      this.renderFact("Model", card.modelStatus.modelVersion, "Loaded checkpoint version serving this slot."),
    ].join("");
    const cardMarkup = `<section class="card ${directionClassName}"><header class="card-header"><div class="card-title"><h3>${card.asset.toUpperCase()} ${card.window}</h3><p>${liveMarketStatus}</p></div><div class="direction-pill">${card.currentDirection}</div></header><section class="status-row"><div><span class="hint-label" title="Current model direction for the live market.">Latest call</span><strong class="direction-value">${predictionDirection}</strong></div><div class="progress-shell"><div class="progress-header"><span class="hint-label" title="Elapsed share between market start and market end.">Market progress</span><strong>${progressPercent}%</strong></div><div class="progress-track"><span style="width:${progressPercent}%"></span></div></div></section><ul class="fact-list">${factMarkup}</ul><details class="history-panel" data-history-key="${card.asset}-${card.window}"><summary><div class="history-header"><div><span class="hint-label" title="Resolved predictions for this slot, ordered by recency.">Model vs actual</span><h4>Resolved prediction history</h4></div><p class="history-caption">Latest ${historyRowCount} settled rows</p></div><span class="history-toggle">Click to expand</span></summary><table><thead><tr><th>Market End</th><th>Model</th><th>Actual</th><th>Conf</th><th>Result</th></tr></thead><tbody>${this.renderHistoryRows(card)}</tbody></table></details></section>`;
    return cardMarkup;
  }

  private renderWindowSection(windowLabel: string, cards: DashboardModelCard[]): string {
    const sectionMarkup = `<section><div class="section-heading"><div><span class="eyebrow">${windowLabel}</span><h2>${windowLabel} model slots</h2></div><p>${cards.length} cards</p></div><div class="window-row"><div class="grid">${cards.map((card) => this.renderCard(card)).join("")}</div></div></section>`;
    return sectionMarkup;
  }

  private renderMainMarkup(payload: DashboardPayload): string {
    const fiveMinuteCards = payload.cards.filter((card) => card.window === "5m");
    const fifteenMinuteCards = payload.cards.filter((card) => card.window === "15m");
    const updateMarkup = `<section class="update-bar"><div><span class="eyebrow">Last update</span><strong class="update-value">${payload.generatedAt}</strong></div></section>`;
    const mainMarkup = `${updateMarkup}${this.renderWindowSection("5m", fiveMinuteCards)}${this.renderWindowSection("15m", fifteenMinuteCards)}`;
    return mainMarkup;
  }

  /**
   * @section public:methods
   */

  public renderDocument(payload: DashboardPayload): string {
    const documentMarkup = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Polymarket Model Farm</title><style>${DASHBOARD_PAGE_STYLES}</style></head><body><main id="dashboard-root">${this.renderMainMarkup(payload)}</main>${DASHBOARD_REFRESH_SCRIPT}</body></html>`;
    return documentMarkup;
  }
}
