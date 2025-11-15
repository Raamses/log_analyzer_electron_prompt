# IIS/Azure APGW Log Analyzer Dashboard

This is a desktop application for analyzing IIS and Azure Application Gateway logs. It provides a user-friendly interface to help you quickly identify trends, errors, and performance metrics from your log files.

## Features

-   **Native File Access:** Uses Electron's native file dialog for a seamless user experience.
-   **Comprehensive Analytics:** Calculates total requests, time span, error rates, and more.
-   **Interactive Dashboard:** Visualizes key metrics to help you understand your application's performance at a glance.
-   **Virtualized Log Viewer:** Efficiently displays large log files without performance degradation.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or later)
-   [npm](https://www.npmjs.com/) (v9 or later)

### Installing

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/your-username/log-analyzer-dashboard.git
    cd log-analyzer-dashboard
    ```

2.  **Install the dependencies:**

    ```sh
    npm install
    ```

## Available Scripts

In the project directory, you can run:

-   `npm run dev`: Runs the app in the development mode.
-   `npm run build`: Builds the app for production to the `dist` folder.
-   `npm test`: Launches the test runner in the interactive watch mode.
-   `npm run lint`: Lints the code using ESLint.

## Built With

-   [React](https://reactjs.org/) - The web framework used
-   [TypeScript](https://www.typescriptlang.org/) - Superset of JavaScript that adds static types
-   [Electron](https://www.electronjs.org/) - Framework for creating native applications with web technologies
-   [Vite](https://vitejs.dev/) - Next-generation front-end tooling
-   [Tailwind CSS](https://tailwindcss.com/) - A utility-first CSS framework
-   [Vitest](https://vitest.dev/) - A blazing fast unit test framework powered by Vite
