
# SpreadForensics

SpreadForensics is a browser-based tool for analysing commodity futures prices, comparing contract spreads, and identifying unusual price deviations through statistical screening.

The goal is to make it easier to investigate relative pricing between contracts while keeping data quality and analytical limitations visible.

## Features

- **Contract Analysis** — Compare prices across selected commodity futures contracts.
- **CSV Upload** — Load market data using `Date`, `Symbol`, and `Close` columns.
- **Spread Analysis** — Calculate the price difference between two selected contracts.
- **Statistical Screening** — Use a reference window and z-score threshold to flag unusual deviations.
- **Data Quality** — Consider missing values, duplicate records, and contract alignment.
- **Interactive Dashboard** — Explore overview, contract analysis, investigations, and data quality sections.
- **Demo Dataset** — Explore the interface using simulated data.

## How It Works

1. Upload a CSV file or load the simulated dataset.
2. Prepare and inspect the input data.
3. Select the contracts to compare.
4. Configure the reference window and z-score threshold.
5. Review flagged observations and investigate their context.

### Spread Calculation

For two contracts, the spread is calculated as:

`Spread = Price of Contract A − Price of Contract B`

Statistical screening helps identify unusual deviations from a reference period. A flagged observation is a starting point for investigation, not proof of arbitrage or a profitable trading opportunity.

## Input Format

The uploaded CSV should contain the following columns:

| Column | Description |
|---|---|
| `Date` | Date of the observation |
| `Symbol` | Contract identifier |
| `Close` | Closing price |

Ensure that dates, prices, and contract identifiers are consistent before analysing the results.

## Tech Stack

The project uses a browser-based interface for data input, dashboard navigation, and spread analysis.

*Add the exact languages, frameworks, and libraries used in the source code here.*

## Run Locally

Clone the repository:

```bash
git clone https://github.com/tanmaypathak12/SpreadForensics.git
```

Navigate to the project directory:

```bash
cd SpreadForensics
```

Open the project in your preferred code editor. If it is configured as a static website, open `index.html` in a browser or serve the directory using a local development server.

Check the repository files for any additional setup requirements.

## Limitations

- The demo dataset contains simulated data, not verified historical market observations.
- Real-data analysis depends on the quality and consistency of the uploaded dataset.
- Statistical deviations do not guarantee arbitrage or future price movements.
- Liquidity, brokerage, bid–ask spreads, slippage, and execution feasibility are not established by the current prototype.

## Disclaimer

SpreadForensics is intended for research and educational purposes. It does not provide investment advice or guarantee trading profits.

