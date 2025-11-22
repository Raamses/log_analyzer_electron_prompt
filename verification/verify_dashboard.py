from playwright.sync_api import sync_playwright, expect
import time

def verify_dashboard():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        page.goto("http://localhost:4173")

        # Expect initial upload screen
        expect(page.get_by_text("Log Analyzer")).to_be_visible()

        # Create a dummy log file content
        log_content = """#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) cs(Referer) sc-status sc-substatus sc-win32-status time-taken
2023-10-27 10:00:00 10.0.0.1 GET /api/v1/users - 80 - 192.168.1.1 Mozilla/5.0 - 200 0 0 150
2023-10-27 10:01:00 10.0.0.1 GET /api/v1/products - 80 - 192.168.1.2 Mozilla/5.0 - 200 0 0 200
2023-10-27 10:02:00 10.0.0.1 POST /api/v1/orders - 80 - 192.168.1.3 Mozilla/5.0 - 201 0 0 300
2023-10-27 10:03:00 10.0.0.1 GET /api/v1/users/123 - 80 - 192.168.1.4 Mozilla/5.0 - 404 0 0 50
2023-10-27 10:04:00 10.0.0.1 GET /api/v1/admin - 80 - 192.168.1.5 Mozilla/5.0 - 403 0 0 60
2023-10-27 10:05:00 10.0.0.1 GET /error - 80 - 192.168.1.6 Mozilla/5.0 - 500 0 0 500
"""

        # Create a temporary file
        with open("verification/dummy.log", "w") as f:
            f.write(log_content)

        # Upload the file
        # Note: We need to target the hidden file input. FileUploader usually has an input[type="file"]
        page.set_input_files('input[type="file"]', "verification/dummy.log")

        # Wait for parsing and dashboard to appear
        expect(page.get_by_text("Dashboard")).to_be_visible()

        # Take a screenshot of the dashboard
        page.screenshot(path="verification/dashboard_full.png", full_page=True)
        print("Screenshot saved to verification/dashboard_full.png")

        browser.close()

if __name__ == "__main__":
    verify_dashboard()
