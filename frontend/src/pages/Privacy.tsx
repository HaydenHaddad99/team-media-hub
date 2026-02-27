import React from "react";
import "../styles/pages.css";

export function Privacy() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1>Privacy Policy</h1>
        <p className="last-updated">Last updated: February 26, 2026</p>

        <section>
          <h2>What We Collect</h2>
          <p>
            Team Media Hub collects only the information necessary to provide our service:
            your email address for authentication, team photos and videos you upload, and
            basic usage data to improve the platform.
          </p>
        </section>

        <section>
          <h2>How We Use Your Data</h2>
          <p>
            We use your data solely to operate Team Media Hub. Your photos and videos are private
            to your team—never shared publicly or used for advertising. We don't sell your data. Period.
          </p>
        </section>

        <section>
          <h2>Data Security</h2>
          <p>
            Media files are stored securely in AWS S3 with encryption at rest. Access is restricted
            to team members only via secure, time-limited URLs. All transfers use HTTPS.
          </p>
        </section>

        <section>
          <h2>Your Rights</h2>
          <p>
            You can delete your account and all associated data at any time by contacting us.
            Team coaches can export or delete team media through their dashboard.
          </p>
        </section>

        <section>
          <h2>Contact Us</h2>
          <p>
            Questions about privacy? Email us at{" "}
            <a href="mailto:support@teammediahub.co">support@teammediahub.co</a>
          </p>
        </section>

        <button
          onClick={() => {
            window.history.back();
          }}
          className="back-button"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
