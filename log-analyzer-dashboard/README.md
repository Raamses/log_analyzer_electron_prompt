# Log Analyzer Dashboard

A modern web application for analyzing IIS and Azure Application Gateway logs. This dashboard parses log files to provide actionable insights, visualizing key performance metrics and error trends in an interactive interface.

## Features

-   **Drag & Drop File Upload:** Easily load your log files using a simple drag-and-drop interface or file selection.
-   **Comprehensive Analytics:**
    -   **Traffic Overview:** View total requests and log time span.
    -   **Error Analysis:** Breakdown of HTTP status codes with detailed descriptions.
    -   **Traffic Segmentation:** Analyze top endpoints, top calling IPs, and search statistics.
    -   **Server Throughput:** Monitor Requests Per Minute (RPM) with mean and max values over different time windows.
-   **Virtualized Log Viewer:** Efficiently browse through thousands of log entries with high performance.
-   **Responsive Design:** Built with Tailwind CSS for a seamless experience on different screen sizes.
-   **Secure:** All log processing happens locally in your browser using the FileReader API.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development.

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or later)
-   [npm](https://www.npmjs.com/) (v9 or later)

### Installation

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/your-username/log-analyzer-dashboard.git
    cd log-analyzer-dashboard
    ```

2.  **Install dependencies:**

    ```sh
    npm install
    ```

## Available Scripts

In the project directory, you can run:

-   `npm run dev`: Starts the development server.
-   `npm run build`: Builds the app for production.
-   `npm run preview`: Locally preview the production build.
-   `npm test`: Runs unit tests with Vitest.
-   `npm run lint`: Lints the code using ESLint.

## Built With

-   [React](https://react.dev/) - The library for web and native user interfaces
-   [TypeScript](https://www.typescriptlang.org/) - Strongly typed programming language that builds on JavaScript
-   [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling
-   [Tailwind CSS v4](https://tailwindcss.com/) - A utility-first CSS framework
-   [Vitest](https://vitest.dev/) - Blazing Fast Unit Test Framework
