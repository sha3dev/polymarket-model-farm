/**
 * @section imports:externals
 */

import { readFileSync } from "node:fs";

/**
 * @section imports:internals
 */

import type { DashboardModelCard, DashboardPayload } from "./index.ts";

/**
 * @section consts
 */

const DASHBOARD_PAGE_STYLES = readFileSync(new URL("./dashboard-page.styles.css", import.meta.url), "utf8");
const DASHBOARD_REFRESH_SCRIPT = readFileSync(new URL("../../template/dashboard-page.client.js", import.meta.url), "utf8");
const DASHBOARD_DOCUMENT_TEMPLATE = readFileSync(new URL("./dashboard-page.document.html", import.meta.url), "utf8");
const DASHBOARD_MAIN_TEMPLATE = readFileSync(new URL("./dashboard-page.main.html", import.meta.url), "utf8");
const DASHBOARD_UPDATE_BAR_TEMPLATE = readFileSync(new URL("./dashboard-page.update-bar.html", import.meta.url), "utf8");
const DASHBOARD_WINDOW_SECTION_TEMPLATE = readFileSync(new URL("./dashboard-page.window-section.html", import.meta.url), "utf8");
const DASHBOARD_CARD_TEMPLATE = readFileSync(new URL("./dashboard-page.card.html", import.meta.url), "utf8");
const DASHBOARD_FACT_TEMPLATE = readFileSync(new URL("./dashboard-page.fact.html", import.meta.url), "utf8");

/**
 * @section types
 */

type DashboardTemplateValues = Record<string, string>;

/**
 * @section public:properties
 */

export class DashboardPageService {
  private static readonly DASHBOARD_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

  /**
   * @section private:methods
   */

  private formatDashboardDate(dateIso: string): string {
    const date = new Date(dateIso);
    const hasValidDate = !Number.isNaN(date.getTime());
    const formattedDate = hasValidDate ? DashboardPageService.DASHBOARD_DATE_FORMATTER.format(date) : dateIso;
    return formattedDate;
  }

  private renderTemplate(template: string, values: DashboardTemplateValues): string {
    let renderedTemplate = template;
    for (const [placeholder, value] of Object.entries(values)) {
      renderedTemplate = renderedTemplate.replaceAll(`{{${placeholder}}}`, value);
    }
    return renderedTemplate;
  }

  private serializePayload(payload: DashboardPayload): string {
    const payloadJson = JSON.stringify(payload).replaceAll("<", "\\u003c");
    return payloadJson;
  }

  private renderFact(label: string, value: string, hint: string): string {
    const factMarkup = this.renderTemplate(DASHBOARD_FACT_TEMPLATE, { DASHBOARD_FACT_LABEL: label, DASHBOARD_FACT_VALUE: value, DASHBOARD_FACT_HINT: hint });
    return factMarkup;
  }

  private formatUsd(value: number | null): string {
    const formattedUsd = value === null ? "--" : `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
    return formattedUsd;
  }

  private readPredictedContractPrice(card: DashboardModelCard): number | null {
    const predictedContractPrice = card.latestPrediction
      ? card.latestPrediction.predictedDirection === "UP"
        ? card.latestPrediction.upPrice
        : card.latestPrediction.downPrice
      : null;
    return predictedContractPrice;
  }

  private renderMarketFacts(card: DashboardModelCard): string {
    const predictedContractPrice = this.readPredictedContractPrice(card);
    const predictedContractPriceValue = predictedContractPrice === null ? "--" : predictedContractPrice.toFixed(3);
    const referencePrice = card.referencePrice === null ? "N/A" : card.referencePrice.toFixed(2);
    const targetPrice = card.priceToBeat === null ? "N/A" : card.priceToBeat.toFixed(2);
    const liveUpPrice = card.liveUpPrice === null ? "--" : card.liveUpPrice.toFixed(3);
    const liveDownPrice = card.liveDownPrice === null ? "--" : card.liveDownPrice.toFixed(3);
    const factMarkup = [
      this.renderFact("Chainlink", referencePrice, "Latest Chainlink price from the collector snapshot."),
      this.renderFact("Live UP", liveUpPrice, "Current UP contract price from the latest collector snapshot."),
      this.renderFact("Live DOWN", liveDownPrice, "Current DOWN contract price from the latest collector snapshot."),
      this.renderFact("Target", targetPrice, "Strike price the market must finish above or below."),
      this.renderFact("Entry price", predictedContractPriceValue, "Polymarket contract price we would have bought following the predicted side."),
    ].join("");
    return factMarkup;
  }

  private renderStatusFacts(card: DashboardModelCard): string {
    const predictionConfidence = card.latestPrediction?.confidence.toFixed(2) || "--";
    const resultValue = this.formatUsd(card.resultUsd);
    const hitRateValue = card.hitRatePercent === null ? "--" : `${card.hitRatePercent.toFixed(0)}%`;
    const factMarkup = [
      this.renderFact("Result", resultValue, "Total USD result from buying 5 shares on each valid resolved prediction at the entry price."),
      this.renderFact("Hit rate", hitRateValue, "Correct predictions as a share of resolved predictions."),
      this.renderFact("Snapshots", String(card.snapshotCount), "Snapshots ingested for the current live market."),
      this.renderFact("Confidence", predictionConfidence, "Model confidence for the latest directional call."),
      this.renderFact("Trained", String(card.modelStatus.trainedMarketCount), "Closed markets already used for model training."),
      this.renderFact("Pending closed", String(card.pendingClosedMarketCount), "Closed markets still waiting to be trained."),
    ].join("");
    return factMarkup;
  }

  private renderCardFacts(card: DashboardModelCard): string {
    const factMarkup = `${this.renderMarketFacts(card)}${this.renderStatusFacts(card)}`;
    return factMarkup;
  }

  private readHistoryRowCount(card: DashboardModelCard): number {
    const historyRowCount = Math.min(card.predictionHistory.filter((entry) => entry.actualDirection !== null).length, 6);
    return historyRowCount;
  }

  private renderCard(card: DashboardModelCard): string {
    const latestCall = card.latestPrediction?.predictedDirection || "WAITING";
    const cardMarkup = this.renderTemplate(DASHBOARD_CARD_TEMPLATE, {
      DASHBOARD_CARD_DIRECTION_CLASS: card.currentDirection.toLowerCase(),
      DASHBOARD_LATEST_CALL_CLASS: latestCall.toLowerCase(),
      DASHBOARD_CARD_TITLE: `${card.asset.toUpperCase()} ${card.window}`,
      DASHBOARD_CARD_STATUS: card.liveMarketSlug ? "Live" : "Idle",
      DASHBOARD_CARD_DIRECTION: card.currentDirection,
      DASHBOARD_PREDICTION_DIRECTION: latestCall,
      DASHBOARD_PROGRESS_PERCENT: (card.progress * 100).toFixed(2),
      DASHBOARD_CARD_FACTS: this.renderCardFacts(card),
      DASHBOARD_HISTORY_KEY: `${card.asset}-${card.window}`,
      DASHBOARD_HISTORY_ROW_COUNT: String(this.readHistoryRowCount(card)),
    });
    return cardMarkup;
  }

  private renderWindowSection(windowLabel: string, cards: DashboardModelCard[]): string {
    const sectionMarkup = this.renderTemplate(DASHBOARD_WINDOW_SECTION_TEMPLATE, {
      DASHBOARD_WINDOW_LABEL: windowLabel,
      DASHBOARD_WINDOW_TITLE: `${windowLabel} model slots`,
      DASHBOARD_CARD_COUNT: String(cards.length),
      DASHBOARD_WINDOW_CARDS: cards.map((card) => this.renderCard(card)).join(""),
    });
    return sectionMarkup;
  }

  private renderMainMarkup(payload: DashboardPayload): string {
    const fiveMinuteCards = payload.cards.filter((card) => card.window === "5m");
    const fifteenMinuteCards = payload.cards.filter((card) => card.window === "15m");
    const updateMarkup = this.renderTemplate(DASHBOARD_UPDATE_BAR_TEMPLATE, {
      DASHBOARD_GENERATED_AT: this.formatDashboardDate(payload.generatedAt),
      DASHBOARD_TOTAL_RESULT_5M: this.formatUsd(payload.totalResultUsd5m),
      DASHBOARD_TOTAL_RESULT_15M: this.formatUsd(payload.totalResultUsd15m),
    });
    const mainMarkup = this.renderTemplate(DASHBOARD_MAIN_TEMPLATE, {
      DASHBOARD_UPDATE_BAR: updateMarkup,
      DASHBOARD_FIVE_MINUTE_SECTION: this.renderWindowSection("5m", fiveMinuteCards),
      DASHBOARD_FIFTEEN_MINUTE_SECTION: this.renderWindowSection("15m", fifteenMinuteCards),
    });
    return mainMarkup;
  }

  /**
   * @section public:methods
   */

  public renderDocument(payload: DashboardPayload): string {
    const documentMarkup = this.renderTemplate(DASHBOARD_DOCUMENT_TEMPLATE, {
      DASHBOARD_PAGE_STYLES,
      DASHBOARD_MAIN_MARKUP: this.renderMainMarkup(payload),
      DASHBOARD_PAYLOAD_JSON: this.serializePayload(payload),
      DASHBOARD_REFRESH_SCRIPT,
    });
    return documentMarkup;
  }
}
