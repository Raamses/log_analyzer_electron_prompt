# Log Analyzer Dashboard

A modern, high-performance web application for parsing and analyzing IIS (W3C) and Azure Application Gateway logs completely locally in your browser. This tool helps you transform massive, unreadable log text into actionable visual insights, throughput metrics, and security/error trends.

## 🚀 Features

- **Drag & Drop File Upload:** Easily load log files via drag-and-drop or file selection.
- **Comprehensive Analytics:**
  - **Traffic Overview:** Total requests, log time span, and traffic segmentation.
  - **Error Analysis:** Breakdown of HTTP status codes ($4xx$, $5xx$) and error rates.
  - **Server Throughput:** Requests Per Minute (RPM) calculations over 1, 15, and 60-minute windows.
- **Traffic Segmentation:** Analyzes top endpoints, calling IP addresses (with Whois integration), and custom search statistics.
- **Virtualized Log Viewer:** Browse thousands of log entries efficiently with zero DOM lag.
- **Secure & Private:** 100% of the parsing and data processing happens locally in your browser using the HTML5 `FileReader` API.

---

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/) (v9 or later)

### Installation
1. **Clone the repository:**
   ```sh
   git clone https://github.com/Raamses/log_analyzer_electron_prompt.git
   cd log-analyzer-dashboard
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```

### Available Scripts
- `npm run dev`: Starts the Vite development server.
- `npm run build`: Type-checks with TypeScript and builds the production bundle.
- `npm run lint`: Lints the codebase with ESLint.
- `npm test`: Runs unit tests with Vitest.

---

## 🏗️ Architecture & Technical Stack

- **React 19** & **TypeScript**
- **Vite** - Build tooling
- **Tailwind CSS v4** - Styling engine
- **Recharts** - SVG data visualization
- **Husky & lint-staged** - Pre-commit hooks for CI protection
- **GitHub Actions** - Cloud CI/CD pipelines

---

## 🤝 Contributing

This repository is maintained using a specialized suite of AI subagents. For details on how the SDLC workflows operate, please refer to [CONTRIBUTING.md](docs/CONTRIBUTING.md).
