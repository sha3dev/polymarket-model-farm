const dashboardRoot = document.getElementById("dashboard-root");
const payloadElement = document.getElementById("dashboard-payload");
const historyModal = document.getElementById("history-modal");
const historyModalBody = document.getElementById("history-modal-body");
let currentPayload = payloadElement ? JSON.parse(payloadElement.textContent || '{"generatedAt":"","cards":[]}') : { generatedAt: "", cards: [] };
const dashboardDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

const formatDashboardDate = (dateIso) => {
  const date = new Date(dateIso);
  const hasValidDate = !Number.isNaN(date.getTime());
  const formattedDate = hasValidDate ? dashboardDateFormatter.format(date) : dateIso;
  return formattedDate;
};

const renderFact = (label, value, hint) =>
  '<li class="fact-item"><span class="hint-label" title="' + hint + '">' + label + '</span><strong class="fact-value">' + value + "</strong></li>";

const formatUsd = (value) => {
  const formattedUsd = value === null ? "--" : (value >= 0 ? "+$" : "-$") + Math.abs(value).toFixed(2);
  return formattedUsd;
};

const renderHistoryRows = (card) => {
  const resolvedHistory = card.predictionHistory.filter((entry) => entry.actualDirection !== null).slice(0, 6);
  const historyRows = resolvedHistory
    .map(
      (entry) => {
        const entryPrice = entry.predictedDirection === "UP" ? entry.upPrice : entry.downPrice;
        return (
        "<tr><td>" +
        formatDashboardDate(entry.marketEnd) +
        "</td><td>" +
        (entryPrice === null ? "--" : entryPrice.toFixed(3)) +
        "</td><td>" +
        entry.predictedDirection +
        "</td><td>" +
        (entry.actualDirection || "-") +
        "</td><td>" +
        entry.confidence.toFixed(2) +
        "</td><td>" +
        (entry.isCorrect ? "Hit" : "Miss") +
        "</td></tr>"
        );
      },
    )
    .join("");
  const historyMarkup = historyRows || '<tr><td colspan="6" class="empty-cell">No resolved predictions yet.</td></tr>';
  return historyMarkup;
};

const readActiveHistoryKey = () => historyModal?.dataset.activeHistoryKey || "";
const findCard = (historyKey) => currentPayload.cards.find((card) => card.asset + "-" + card.window === historyKey) || null;

const closeHistoryModal = () => {
  if (historyModal) {
    historyModal.classList.remove("is-visible");
    delete historyModal.dataset.activeHistoryKey;
  }
  if (historyModalBody) {
    historyModalBody.innerHTML = "";
  }
};

const openHistoryModal = (historyKey) => {
  const card = findCard(historyKey);
  if (!card || !historyModal || !historyModalBody) {
    closeHistoryModal();
    return;
  }
  const settledRowCount = Math.min(card.predictionHistory.filter((entry) => entry.actualDirection !== null).length, 6);
  historyModal.dataset.activeHistoryKey = historyKey;
  historyModal.classList.add("is-visible");
  historyModalBody.innerHTML =
    '<div class="history-dialog-header"><div><span class="hint-label">History</span><h4>' +
    card.asset.toUpperCase() +
    " " +
    card.window +
    '</h4><p class="history-caption">Latest ' +
    settledRowCount +
    ' settled rows</p></div><button class="history-close" type="button" data-history-close="true">Close</button></div><div class="history-dialog-body"><table><thead><tr><th>Market End</th><th>Entry price</th><th>Model</th><th>Actual</th><th>Conf</th><th>Result</th></tr></thead><tbody>' +
    renderHistoryRows(card) +
    "</tbody></table></div>";
};

const renderCard = (card) => {
  const directionClassName = card.currentDirection.toLowerCase();
  const latestCallClassName = (card.latestPrediction?.predictedDirection || "WAITING").toLowerCase();
  const liveMarketStatus = card.liveMarketSlug ? "Live" : "Idle";
  const progressPercent = (card.progress * 100).toFixed(2);
  const predictionDirection = card.latestPrediction?.predictedDirection || "WAITING";
  const predictionConfidence = card.latestPrediction?.confidence.toFixed(2) || "--";
  const tradeStatus = card.latestPrediction ? (card.latestPrediction.isExecuted ? "Executed" : "Shadow") : "--";
  const skipReason = card.latestPrediction?.isExecuted === false ? (card.latestPrediction.skipReason || "--").replaceAll("_", " ") : "--";
  const liveUpPrice = card.liveUpPrice === null ? "--" : card.liveUpPrice.toFixed(3);
  const liveDownPrice = card.liveDownPrice === null ? "--" : card.liveDownPrice.toFixed(3);
  const predictedContractPrice = card.latestPrediction ? (card.latestPrediction.predictedDirection === "UP" ? card.latestPrediction.upPrice : card.latestPrediction.downPrice) : null;
  const predictedContractPriceValue = predictedContractPrice === null ? "--" : predictedContractPrice.toFixed(3);
  const referencePrice = card.referencePrice === null ? "N/A" : card.referencePrice.toFixed(2);
  const targetPrice = card.priceToBeat === null ? "N/A" : card.priceToBeat.toFixed(2);
  const resultValue = formatUsd(card.resultUsd);
  const hitRateValue = card.hitRatePercent === null ? "--" : card.hitRatePercent.toFixed(0) + "%";
  const historyRowCount = Math.min(card.predictionHistory.filter((entry) => entry.actualDirection !== null).length, 6);
  const factMarkup = [
    renderFact("Chainlink", referencePrice, "Latest Chainlink price from the collector snapshot."),
    renderFact("Live UP", liveUpPrice, "Current UP contract price from the latest collector snapshot."),
    renderFact("Live DOWN", liveDownPrice, "Current DOWN contract price from the latest collector snapshot."),
    renderFact("Result", resultValue, "Total USD result from buying 5 shares on each valid resolved prediction at the entry price."),
    renderFact("Hit rate", hitRateValue, "Correct predictions as a share of resolved predictions."),
    renderFact("Target", targetPrice, "Strike price the market must finish above or below."),
    renderFact("Trade", tradeStatus, "Whether the latest prediction would have executed a trade or only remained as shadow history."),
    renderFact("Skip", skipReason, "Reason why the latest prediction stayed as shadow history instead of executing."),
    renderFact("Confidence", predictionConfidence, "Model confidence for the latest directional call."),
    renderFact("Entry price", predictedContractPriceValue, "Polymarket contract price we would have bought following the predicted side."),
    renderFact("Trained", String(card.modelStatus.trainedMarketCount), "Closed markets already used for model training."),
    renderFact("Pending closed", String(card.pendingClosedMarketCount), "Closed markets still waiting to be trained."),
  ].join("");
  return (
    '<section class="card ' +
    directionClassName +
    '"><header class="card-header"><div class="card-title"><h3>' +
    card.asset.toUpperCase() +
    " " +
    card.window +
    "</h3><p>" +
    liveMarketStatus +
    '</p></div><div class="direction-pill">' +
    card.currentDirection +
    '</div></header><section class="status-row"><div class="latest-call ' +
    latestCallClassName +
    '"><span class="hint-label" title="Current model direction for the live market.">Latest call</span><strong class="direction-value">' +
    predictionDirection +
    '</strong></div><div class="progress-shell"><div class="progress-header"><span class="hint-label" title="Elapsed share between market start and market end.">Market progress</span><strong>' +
    progressPercent +
    '%</strong></div><div class="progress-track"><span style="width:' +
    progressPercent +
    '%"></span></div></div></section><ul class="fact-list">' +
    factMarkup +
    '</ul><footer class="card-actions"><button class="history-button" type="button" data-history-button="' +
    card.asset +
    "-" +
    card.window +
    '">History</button><span class="history-count">' +
    historyRowCount +
    " rows</span></footer></section>"
  );
};

const renderWindowSection = (windowLabel, cards) =>
  '<section><div class="section-heading"><div><span class="eyebrow">' +
  windowLabel +
  "</span><h2>" +
  windowLabel +
  ' model slots</h2></div><p>' +
  cards.length +
  ' cards</p></div><div class="window-row"><div class="grid">' +
  cards.map((card) => renderCard(card)).join("") +
  "</div></div></section>";

const renderDashboard = (payload) => {
  const activeHistoryKey = readActiveHistoryKey();
  currentPayload = payload;
  const fiveMinuteCards = payload.cards.filter((card) => card.window === "5m");
  const fifteenMinuteCards = payload.cards.filter((card) => card.window === "15m");
  dashboardRoot.innerHTML =
    '<section class="update-bar"><div><span class="eyebrow">Last update</span><strong class="update-value">' +
    formatDashboardDate(payload.generatedAt) +
    '</strong></div><div><span class="eyebrow">5m result</span><strong class="update-value">' +
    formatUsd(payload.totalResultUsd5m ?? null) +
    '</strong></div><div><span class="eyebrow">15m result</span><strong class="update-value">' +
    formatUsd(payload.totalResultUsd15m ?? null) +
    "</strong></div></section>" +
    renderWindowSection("5m", fiveMinuteCards) +
    renderWindowSection("15m", fifteenMinuteCards);
  if (activeHistoryKey) {
    openHistoryModal(activeHistoryKey);
  }
};

dashboardRoot?.addEventListener("click", (event) => {
  const historyButton = event.target.closest("[data-history-button]");
  if (historyButton) {
    openHistoryModal(historyButton.getAttribute("data-history-button") || "");
  }
});

historyModal?.addEventListener("click", (event) => {
  const shouldClose = event.target === historyModal || event.target.closest("[data-history-close]");
  if (shouldClose) {
    closeHistoryModal();
  }
});

const refreshDashboard = async () => {
  try {
    const response = await window.fetch("/api/dashboard", { headers: { accept: "application/json" } });
    if (response.ok) {
      renderDashboard(await response.json());
    }
  } catch (_error) {}
};

window.setInterval(() => {
  void refreshDashboard();
}, 1000);
