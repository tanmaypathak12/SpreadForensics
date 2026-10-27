
"use strict";

/*
 * SpreadForensics — Commodity Derivatives Intelligence
 * Browser-only prototype; no external libraries.
 *
 * Supported CSV columns:
 * Date, Symbol, Close
 * Optional: ExpiryDate, Volume, OpenInterest
 *
 * IMPORTANT:
 * Demo data is synthetic, not actual MCX market data.
 */

const $ = (id) => document.getElementById(id);

const state = {
  rows: [],
  source: "none",
  fileName: "",
  warnings: [],
  parsed: []
};

const COLORS = [
  "#d5ad62",
  "#65b9a8",
  "#8da8ed",
  "#d58b8b",
  "#b8a0e6",
  "#b2c47d"
];

const REQUIRED_COLUMNS = ["date", "symbol", "close"];

const CONTRACT_INFO = {
  GOLD: { label: "Gold", unit: "normalised index" },
  SILVER: { label: "Silver", unit: "normalised index" },
  CRUDEOIL: { label: "Crude Oil", unit: "normalised index" },
  NATURALGAS: { label: "Natural Gas", unit: "normalised index" },
  COPPER: { label: "Copper", unit: "normalised index" },
  ALUMINIUM: { label: "Aluminium", unit: "normalised index" }
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC"
  });
}

function parseDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  // ISO: YYYY-MM-DD, optionally followed by a timestamp.
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return validDate(+match[1], +match[2], +match[3]);
  }

  // Indian-style dates: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY.
  match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (match) {
    return validDate(+match[3], +match[2], +match[1]);
  }

  // Avoid silently guessing ambiguous dates.
  return null;
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function normaliseSymbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
}

function findColumn(headers, candidates) {
  return headers.findIndex((header) =>
    candidates.includes(
      String(header).trim().toLowerCase().replace(/[\s_-]+/g, "")
    )
  );
}

/*
 * CSV parser handles commas inside quoted cells and escaped quotes.
 */
function parseCSV(text) {
  const output = [];
  let row = [];
  let cell = "";
  let quoted = false;

  const input = String(text).replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell.trim());

      if (row.some((item) => item !== "")) output.push(row);

      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) {
    throw new Error("CSV has an unclosed quoted field. Check the file format.");
  }

  row.push(cell.trim());
  if (row.some((item) => item !== "")) output.push(row);

  if (output.length < 2) {
    throw new Error("CSV must contain a header row and at least one data row.");
  }

  return output;
}

function parseMarketCSV(text) {
  const matrix = parseCSV(text);
  const headers = matrix[0].map((value) => value.trim());

  const dateIndex = findColumn(headers, ["date", "tradedate", "timestamp"]);
  const symbolIndex = findColumn(headers, ["symbol", "contract", "instrument"]);
  const closeIndex = findColumn(headers, ["close", "closeprice", "settlementprice"]);
  const expiryIndex = findColumn(headers, ["expirydate", "expiry", "expiration"]);
  const volumeIndex = findColumn(headers, ["volume", "tradedvolume"]);
  const oiIndex = findColumn(headers, ["openinterest", "oi"]);

  const missing = [];
  if (dateIndex < 0) missing.push("Date");
  if (symbolIndex < 0) missing.push("Symbol");
  if (closeIndex < 0) missing.push("Close");

  if (missing.length) {
    throw new Error(
      `Missing required column(s): ${missing.join(", ")}. Required: Date, Symbol, Close.`
    );
  }

  const rows = [];
  const warnings = [];
  let skipped = 0;

  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];

    const date = parseDate(cells[dateIndex]);
    const symbol = normaliseSymbol(cells[symbolIndex]);
    const closeText = String(cells[closeIndex] ?? "").replace(/,/g, "").trim();
    const close = Number(closeText);

    if (!date || !symbol || !Number.isFinite(close) || close <= 0) {
      skipped++;
      continue;
    }

    const expiry = expiryIndex >= 0
      ? parseDate(cells[expiryIndex])
      : null;

    const volume = volumeIndex >= 0
      ? Number(String(cells[volumeIndex] ?? "").replace(/,/g, "")) || null
      : null;

    const openInterest = oiIndex >= 0
      ? Number(String(cells[oiIndex] ?? "").replace(/,/g, "")) || null
      : null;

    rows.push({
      date,
      dateKey: dateKey(date),
      symbol,
      close,
      expiry,
      expiryKey: expiry ? dateKey(expiry) : null,
      volume,
      openInterest,
      rowNumber: i + 1
    });
  }

  if (!rows.length) {
    throw new Error("No valid records found. Check your date and numeric formats.");
  }

  if (skipped) {
    warnings.push(`${skipped} row(s) were skipped because required values were invalid.`);
  }

  if (expiryIndex < 0) {
    warnings.push("ExpiryDate was not supplied. Contract-expiry alignment cannot be verified.");
  }

  if (volumeIndex < 0) {
    warnings.push("Volume was not supplied. Liquidity and transaction-cost analysis are unavailable.");
  }

  if (oiIndex < 0) {
    warnings.push("OpenInterest was not supplied. Open-interest confirmation is unavailable.");
  }

  const symbolCounts = new Map();
  rows.forEach((row) => {
    symbolCounts.set(row.symbol, (symbolCounts.get(row.symbol) || 0) + 1);
  });

  if (symbolCounts.size < 2) {
    warnings.push("At least two distinct symbols are recommended for a spread comparison.");
  }

  // Multiple expiries for the same symbol and date must not be silently merged.
  const contractGroups = new Map();
  rows.forEach((row) => {
    const key = `${row.dateKey}|${row.symbol}`;
    if (!contractGroups.has(key)) contractGroups.set(key, new Set());
    contractGroups.get(key).add(row.expiryKey || "EXPIRY_UNKNOWN");
  });

  const multiExpiryGroups = [...contractGroups.values()]
    .filter((set) => set.size > 1).length;

  if (multiExpiryGroups) {
    warnings.push(
      `${multiExpiryGroups} symbol/date group(s) contain multiple expiries. ` +
      "The prototype keeps one row per symbol/date; align contracts before interpreting results."
    );
  }

  return { rows, warnings };
}

/*
 * Keep one observation per symbol/date. Prefer the nearest known expiry
 * only for display; this is NOT a substitute for proper expiry alignment.
 */
function deduplicateRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = `${row.dateKey}|${row.symbol}`;
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, row);
      continue;
    }

    if (row.expiryKey && current.expiryKey) {
      if (row.expiryKey < current.expiryKey) grouped.set(key, row);
    } else if (row.expiryKey && !current.expiryKey) {
      grouped.set(key, row);
    }
  }

  return [...grouped.values()].sort((a, b) =>
    a.date - b.date || a.symbol.localeCompare(b.symbol)
  );
}

/*
 * Synthetic demo series with a deliberately inserted divergence.
 * These values are invented for interface demonstration only.
 */
function createDemoData() {
  const rows = [];
  const symbols = ["GOLD", "SILVER", "CRUDEOIL"];
  const base = {
    GOLD: 100,
    SILVER: 80,
    CRUDEOIL: 60
  };

  const start = Date.UTC(2026, 0, 5);
  let previous = { ...base };

  for (let i = 0; i < 120; i++) {
    const date = new Date(start + i * 86400000);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    for (const symbol of symbols) {
      const noise = Math.sin(i * 0.43 + symbols.indexOf(symbol)) * 0.65
        + Math.cos(i * 0.19 + symbols.indexOf(symbol)) * 0.32;

      let value = previous[symbol] + noise;

      if (symbol === "SILVER" && i >= 75 && i <= 79) {
        value -= (i - 74) * 2.8;
      }

      if (symbol === "SILVER" && i === 80) {
        value += 8.5;
      }

      value = Math.max(10, value);
      previous[symbol] = value;

      rows.push({
        date,
        dateKey: dateKey(date),
        symbol,
        close: Number(value.toFixed(2)),
        expiry: null,
        expiryKey: null,
        volume: null,
        openInterest: null,
        rowNumber: rows.length + 1
      });
    }
  }

  return rows;
}

function getSymbols(rows = state.rows) {
  return [...new Set(rows.map((row) => row.symbol))].sort();
}

function populatePairSelect() {
  const select = $("pairSelect");
  if (!select) return;

  const symbols = getSymbols();
  const previous = select.value;
  const pairs = [];

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      pairs.push([symbols[i], symbols[j]]);
    }
  }

  select.innerHTML = "";

  if (!pairs.length) {
    select.innerHTML = '<option value="">Need at least two symbols</option>';
    return;
  }

  pairs.forEach(([a, b]) => {
    const option = document.createElement("option");
    option.value = `${a}|${b}`;
    option.textContent = `${a} / ${b}`;
    select.appendChild(option);
  });

  if (pairs.some(([a, b]) => `${a}|${b}` === previous)) {
    select.value = previous;
  } else {
    const preferred = pairs.find(([a, b]) =>
      a === "GOLD" && b === "SILVER"
    );
    if (preferred) select.value = `${preferred[0]}|${preferred[1]}`;
  }
}

function getWindowSize() {
  const value = Number($("windowSelect")?.value || 20);
  return Number.isFinite(value) ? Math.max(5, Math.min(value, 90)) : 20;
}

function getThreshold() {
  const value = Number($("thresholdSelect")?.value || 2);
  return Number.isFinite(value) ? Math.max(1, Math.min(value, 4)) : 2;
}

function rollingStats(values, index, windowSize) {
  // Exclude the current observation to avoid look-ahead leakage.
  const start = Math.max(0, index - windowSize);
  const sample = values.slice(start, index).filter(Number.isFinite);

  if (sample.length < Math.min(5, windowSize)) {
    return { mean: null, sd: null, count: sample.length };
  }

  const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const variance = sample.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  ) / (sample.length - 1);

  return {
    mean,
    sd: Math.sqrt(variance),
    count: sample.length
  };
}

function buildPairSeries(symbolA, symbolB) {
  const mapA = new Map();
  const mapB = new Map();

  state.rows.forEach((row) => {
    if (row.symbol === symbolA) mapA.set(row.dateKey, row);
    if (row.symbol === symbolB) mapB.set(row.dateKey, row);
  });

  const dates = [...mapA.keys()]
    .filter((date) => mapB.has(date))
    .sort();

  if (!dates.length) return [];

  const firstA = mapA.get(dates[0]).close;
  const firstB = mapB.get(dates[0]).close;

  const points = dates.map((date) => {
    const a = mapA.get(date);
    const b = mapB.get(date);

    // Index both series to 100 at the first common date.
    const indexA = (a.close / firstA) * 100;
    const indexB = (b.close / firstB) * 100;

    return {
      date: a.date,
      dateKey: date,
      aClose: a.close,
      bClose: b.close,
      indexA,
      indexB,
      spread: indexA - indexB,
      aVolume: a.volume,
      bVolume: b.volume,
      aOI: a.openInterest,
      bOI: b.openInterest,
      aExpiry: a.expiryKey,
      bExpiry: b.expiryKey
    };
  });

  const values = points.map((point) => point.spread);
  const windowSize = getWindowSize();
  const threshold = getThreshold();

  points.forEach((point, index) => {
    const stats = rollingStats(values, index, windowSize);
    point.mean = stats.mean;
    point.sd = stats.sd;
    point.z = stats.sd && stats.sd > 0
      ? (point.spread - stats.mean) / stats.sd
      : null;
    point.threshold = threshold;
    point.flag = Number.isFinite(point.z) && Math.abs(point.z) >= threshold;
  });

  return points;
}

function svgNode(name, attributes = {}, textContent = "") {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });
  if (textContent !== "") node.textContent = textContent;
  return node;
}

function renderLineChart(containerId, series, options = {}) {
  const container = $(containerId);
  if (!container) return;

  container.innerHTML = "";

  if (!series.length) {
    container.innerHTML =
      '<div class="chart-empty">Not enough overlapping observations to plot this chart.</div>';
    return;
  }

  const width = 900;
  const height = options.height || 280;
  const margin = { top: 18, right: 22, bottom: 38, left: 62 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const allValues = series.flatMap((line) =>
    line.values.map((point) => point.y).filter(Number.isFinite)
  );

  if (!allValues.length) {
    container.innerHTML = '<div class="chart-empty">No numeric observations to plot.</div>';
    return;
  }

  let minY = Math.min(...allValues);
  let maxY = Math.max(...allValues);

  if (options.zeroLine) {
    minY = Math.min(minY, 0);
    maxY = Math.max(maxY, 0);
  }

  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const padding = (maxY - minY) * 0.12;
  minY -= padding;
  maxY += padding;

  const dates = series[0].values.map((point) => point.x);
  const x = (index) =>
    margin.left + (dates.length <= 1 ? plotW / 2 : index / (dates.length - 1) * plotW);

  const y = (value) =>
    margin.top + ((maxY - value) / (maxY - minY)) * plotH;

  const svg = svgNode("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": options.ariaLabel || "Market series line chart",
    preserveAspectRatio: "xMidYMid meet"
  });

  // Horizontal grid and y-axis labels.
  for (let tick = 0; tick <= 4; tick++) {
    const value = minY + (maxY - minY) * tick / 4;
    const py = y(value);

    svg.appendChild(svgNode("line", {
      x1: margin.left,
      y1: py,
      x2: width - margin.right,
      y2: py,
      stroke: "#2d3540",
      "stroke-width": 1
    }));

    svg.appendChild(svgNode("text", {
      x: margin.left - 10,
      y: py + 4,
      fill: "#98a2b3",
      "font-size": 11,
      "text-anchor": "end"
    }, formatNumber(value, 1)));
  }

  // X-axis labels.
  const labelCount = Math.min(5, dates.length);
  for (let i = 0; i < labelCount; i++) {
    const index = Math.round(
      i * (dates.length - 1) / Math.max(1, labelCount - 1)
    );

    svg.appendChild(svgNode("text", {
      x: x(index),
      y: height - 12,
      fill: "#98a2b3",
      "font-size": 11,
      "text-anchor": i === 0 ? "start" : i === labelCount - 1 ? "end" : "middle"
    
    }, formatDate(new Date(`${dates[index]}T00:00:00Z`))));

  }

  if (options.zeroLine && minY < 0 && maxY > 0) {
    svg.appendChild(svgNode("line", {
      x1: margin.left,
      y1: y(0),
      x2: width - margin.right,
      y2: y(0),
      stroke: "#7d8795",
      "stroke-dasharray": "4 4",
      "stroke-width": 1.2
    }));
  }

  series.forEach((line, lineIndex) => {
    const pathData = line.values
      .map((point, index) => {
        if (!Number.isFinite(point.y)) return "";
        return `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.y)}`;
      })
      .filter(Boolean)
      .join(" ");

    svg.appendChild(svgNode("path", {
      d: pathData,
      fill: "none",
      stroke: line.color || COLORS[lineIndex % COLORS.length],
      "stroke-width": line.width || 2.2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }));

    // Highlight flagged points if requested.
    if (line.flagged) {
      line.values.forEach((point, index) => {
        if (!point.flag || !Number.isFinite(point.y)) return;
        svg.appendChild(svgNode("circle", {
          cx: x(index),
          cy: y(point.y),
          r: 4,
          fill: "#e5b45f",
          stroke: "#171d25",
          "stroke-width": 1.5
        }));
      });
    }
  });

  container.appendChild(svg);
}

function renderPriceChart() {
  const symbols = getSymbols();
  const selectedSymbols = symbols.slice(0, 5);

  const series = selectedSymbols.map((symbol, index) => {
    const rows = state.rows.filter((row) => row.symbol === symbol);
    const first = rows[0]?.close || 1;

    return {
      name: symbol,
      color: COLORS[index % COLORS.length],
      values: rows.map((row) => ({
        x: row.dateKey,
        y: (row.close / first) * 100
      }))
    };
  });

  renderLineChart("priceChart", series, {
    ariaLabel: "Normalised closing-price series, indexed to 100",
    height: 285
  });

  const legend = $("priceLegend");
  if (legend) {
    legend.innerHTML = "";
    series.forEach((line) => {
      const item = document.createElement("span");
      item.className = "legend-item";

      const swatch = document.createElement("i");
      swatch.className = "legend-swatch";
      swatch.style.backgroundColor = line.color;

      const label = document.createElement("span");
      label.textContent = line.name;

      item.append(swatch, label);
      legend.appendChild(item);
    });
  }
}

function renderSpreadChart(points) {
  const spreadLine = {
    name: "Indexed spread",
    color: COLORS[0],
    values: points.map((point) => ({
      x: point.dateKey,
      y: point.spread,
      flag: point.flag
    })),
    flagged: true
  };

  const meanLine = {
    name: "Rolling mean",
    color: COLORS[2],
    width: 1.6,
    values: points.map((point) => ({
      x: point.dateKey,
      y: point.mean
    }))
  };

  renderLineChart("spreadChart", [spreadLine, meanLine], {
    ariaLabel: "Indexed spread with rolling mean",
    zeroLine: true,
    height: 260
  });
}

function renderObservations(points) {
  const container = $("observations");
  if (!container) return;

  const recent = [...points].slice(-12).reverse();

  if (!recent.length) {
    container.innerHTML = '<div class="empty-state">No overlapping observations available.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Indexed spread</th>
            <th>Rolling Z-score</th>
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          ${recent.map((point) => {
            const flagged = point.flag;
            return `
              <tr>
                <td>${escapeHTML(formatDate(point.date))}</td>
                <td>${escapeHTML(formatNumber(point.spread, 3))}</td>
                <td>${escapeHTML(formatNumber(point.z, 2))}</td>
                <td>
                  <span class="signal-pill ${flagged ? "signal-flag" : "signal-normal"}">
                    ${flagged ? "Threshold crossed" : "No flag"}
                  </span>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEvidence(points, symbolA, symbolB) {
  const card = $("evidenceCard");
  if (!card) return;

  const valid = points.filter((point) => Number.isFinite(point.z));
  const latest = points[points.length - 1];
  const flagged = valid.filter((point) => point.flag);
  const maxAbs = valid.reduce((best, point) =>
    Math.abs(point.z) > Math.abs(best?.z ?? 0) ? point : best, null);

  if (!latest) {
    card.innerHTML = '<p>No evidence available for this pair.</p>';
    return;
  }

  const dataMode = state.source === "demo"
    ? "Synthetic demonstration data"
    : "User-uploaded CSV data";

  const maxText = maxAbs
    ? `${formatDate(maxAbs.date)} (Z = ${formatNumber(maxAbs.z, 2)})`
    : "Not enough observations";

  const latestSignal = latest.flag
    ? `The latest observation crosses the selected absolute Z-score threshold of ${getThreshold()}.`
    : "The latest observation does not cross the selected absolute Z-score threshold.";

  const caveats = [
    "Prices are indexed to 100 at the first common date; the spread is not a tradable rupee-valued spread.",
    "The rolling baseline uses prior observations only. It is a statistical screen, not proof of mispricing.",
    "Contract expiries, market liquidity, brokerage, slippage and exchange specifications require independent validation."
  ];

  card.innerHTML = `
    <div class="evidence-heading">
      <span class="evidence-kicker">OBSERVATION SUMMARY</span>
      <span class="signal-pill ${latest.flag ? "signal-flag" : "signal-normal"}">
        ${latest.flag ? "Threshold crossed" : "No current flag"}
      </span>
    </div>
    <h3>${escapeHTML(symbolA)} / ${escapeHTML(symbolB)}</h3>
    <p>${escapeHTML(dataMode)}. ${escapeHTML(latestSignal)}</p>
    <div class="evidence-stats">
      <div>
        <span>Latest Z-score</span>
        <strong>${escapeHTML(formatNumber(latest.z, 2))}</strong>
      </div>
      <div>
        <span>Flagged observations</span>
        <strong>${flagged.length}</strong>
      </div>
      <div>
        <span>Largest absolute Z-score</span>
        <strong>${escapeHTML(formatNumber(maxAbs?.z, 2))}</strong>
      </div>
    </div>
    <p><strong>Largest absolute deviation:</strong> ${escapeHTML(maxText)}</p>
    <p class="evidence-note"><strong>Interpretation:</strong> A threshold crossing indicates an unusual deviation relative to the selected historical window. It does not establish a profitable trade, manipulation, or a market anomaly.</p>
    <ul class="evidence-caveats">
      ${caveats.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}
    </ul>
  `;
}

function renderQualityNotes(points) {
  const container = $("qualityNotes");
  if (!container) return;

  const items = [
    {
      title: "Data source",
      detail: state.source === "demo"
        ? "Synthetic demonstration series; not real exchange observations."
        : "User-provided CSV. The source and accuracy have not been independently verified."
    },
    {
      title: "Contract comparability",
      detail: state.rows.some((row) => !row.expiryKey)
        ? "Expiry metadata is incomplete. Calendar-spread or same-contract conclusions are not supported."
        : "Expiry dates are present, but matching contract specifications still requires validation."
    },
    {
      title: "Statistical limits",
      detail: `${points.filter((point) => point.flag).length} threshold crossing(s) detected using a rolling window of ${getWindowSize()} prior observations. No transaction costs or execution simulation included.`
    }
  ];

  container.innerHTML = items.map((item) => `
    <div class="quality-item">
      <strong>${escapeHTML(item.title)}</strong>
      <p>${escapeHTML(item.detail)}</p>
    </div>
  `).join("");
}

function setDataNotice(title, message, mode) {
  setText("dataNoticeTitle", title);
  setText("dataNotice", message);
  setText("dataModeBadge", mode);
}

function updateMetrics(points) {
  const symbols = getSymbols();
  const dates = [...new Set(state.rows.map((row) => row.dateKey))].sort();
  const flagged = points.filter((point) => point.flag);

  setText("rowCount", state.rows.length.toLocaleString("en-IN"));
  setText("contractCount", symbols.length.toLocaleString("en-IN"));
  setText("dateCount", dates.length.toLocaleString("en-IN"));
  setText("flagCount", flagged.length.toLocaleString("en-IN"));

  if (dates.length) {
    setText(
      "priceDateRange",
      `${formatDate(new Date(`${dates[0]}T00:00:00Z`))} — ${formatDate(new Date(`${dates[dates.length - 1]}T00:00:00Z`))}`
    );
  } else {
    setText("priceDateRange", "—");
  }

  const latest = points[points.length - 1];
  setText("latestSpread", latest ? formatNumber(latest.spread, 3) : "—");
  setText("latestZ", latest ? formatNumber(latest.z, 2) : "—");
  setText("latestWindow", `${getWindowSize()} prior observations`);
  setText(
    "pairStatus",
    latest?.flag ? "Threshold crossed" : latest ? "Within threshold" : "Insufficient data"
  );
}

function renderAll() {
  state.rows = deduplicateRows(state.rows);

  populatePairSelect();
  renderPriceChart();

  const pair = $("pairSelect")?.value || "";
  const [symbolA, symbolB] = pair.split("|");

  if (!symbolA || !symbolB) {
    updateMetrics([]);
    renderSpreadChart([]);
    renderObservations([]);
    renderEvidence([], symbolA || "—", symbolB || "—");
    renderQualityNotes([]);
    return;
  }

  const points = buildPairSeries(symbolA, symbolB);

  updateMetrics(points);
  renderSpreadChart(points);
  renderObservations(points);
  renderEvidence(points, symbolA, symbolB);
  renderQualityNotes(points);

  if (state.source === "demo") {
    setDataNotice(
      "DEMO MODE — SYNTHETIC DATA",
      "Illustrative data is used to demonstrate the workflow. Do not treat the displayed signals as real market findings.",
      "DEMO"
    );
    setText("sourceStatus", "Synthetic demo");
    setText("sourceSubtext", "Not connected to live MCX data");
  } else if (state.source === "csv") {
    setDataNotice(
      "USER-UPLOADED DATA",
      "Results are calculated from the uploaded CSV. Verify the source, contract expiry alignment, units and missing records before interpreting any signal.",
      "CSV IMPORT"
    );
    setText("sourceStatus", "CSV imported");
    setText("sourceSubtext", state.fileName || "Local file");
  } else {
    setText("sourceStatus", "No data loaded");
    setText("sourceSubtext", "Load a CSV or open demo data");
  }

  if (state.warnings.length) {
    setText("dataMessage", state.warnings.join(" "));
  } else {
    setText("dataMessage", "Basic input checks passed. This does not independently validate the market data.");
  }
}

function loadDemo() {
  state.rows = createDemoData();
  state.source = "demo";
  state.fileName = "synthetic-demo-data";
  state.warnings = [
    "Synthetic demo data only. Signals are illustrative, not actual market findings."
  ];

  renderAll();
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const result = parseMarketCSV(text);

    state.rows = result.rows;
    state.source = "csv";
    state.fileName = file.name;
    state.warnings = result.warnings;

    renderAll();
  } catch (error) {
    setText(
      "dataMessage",
      error instanceof Error ? error.message : "Could not read this CSV file."
    );
    setText("sourceStatus", "Import failed");
    setText("sourceSubtext", "Check CSV columns and formats");
  } finally {
    // Allows selecting the same file again after correcting it.
    event.target.value = "";
  }
}

function resetApp() {
  state.rows = [];
  state.source = "none";
  state.fileName = "";
  state.warnings = [];

  setText("sourceStatus", "No data loaded");
  setText("sourceSubtext", "Load a CSV or open demo data");
  setText("dataNoticeTitle", "DATA REQUIRED");
  setText("dataNotice", "Import a CSV file or load the synthetic demo to explore the interface.");
  setText("dataModeBadge", "AWAITING DATA");
  setText("dataMessage", "Required CSV columns: Date, Symbol, Close.");
  setText("rowCount", "0");
  setText("contractCount", "0");
  setText("dateCount", "0");
  setText("flagCount", "0");
  setText("priceDateRange", "—");
  setText("latestSpread", "—");
  setText("latestZ", "—");
  setText("latestWindow", "—");
  setText("pairStatus", "Awaiting data");

  const pairSelect = $("pairSelect");
  if (pairSelect) pairSelect.innerHTML = '<option value="">Load data first</option>';

  ["priceChart", "spreadChart", "priceLegend", "observations", "evidenceCard", "qualityNotes"]
    .forEach((id) => {
      const element = $(id);
      if (element) element.innerHTML = "";
    });
}

function initialise() {
  $("demoBtn")?.addEventListener("click", loadDemo);
  $("demoBtnSecondary")?.addEventListener("click", loadDemo);
  $("resetBtn")?.addEventListener("click", resetApp);
  $("csvFile")?.addEventListener("change", handleFileUpload);

  $("windowSelect")?.addEventListener("change", () => {
    if (state.rows.length) renderAll();
  });

  $("thresholdSelect")?.addEventListener("change", () => {
    if (state.rows.length) renderAll();
  });

  $("pairSelect")?.addEventListener("change", () => {
    if (state.rows.length) renderAll();
  });

  resetApp();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialise);
} else {
  initialise();
}
