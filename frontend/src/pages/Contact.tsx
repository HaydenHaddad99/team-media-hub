import React from "react";
import "../styles/pages.css";

export function Contact() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1>Contact Us</h1>
        
        <section>
          <h2>Support</h2>
          <p>
            Have a question, issue, or feature request? We're here to help.
          </p>
          <p className="contact-email">
            <a href="mailto:support@teammediahub.co">support@teammediahub.co</a>
          </p>
          <p className="muted">
            We typically respond within 24 hours (usually much faster).
          </p>
        </section>

        <section>
          <h2>Billing Questions</h2>
          <p>
            Need help with subscriptions, upgrades, or invoices? Same email works:
          </p>
          <p className="contact-email">
            <a href="mailto:support@teammediahub.co">support@teammediahub.co</a>
          </p>
        </section>

        <section>
          <h2>Technical Issues</h2>
          <p>
            When reporting bugs or technical problems, please include:
          </p>
          <ul>
            <li>Your team code (if applicable)</li>
            <li>Browser and device you're using</li>
            <li>Steps to reproduce the issue</li>
            <li>Any error messages you see</li>
          </ul>
          <p>
            This helps us fix things faster. Thanks!
          </p>
        </section>

        <section>
          <h2>Built By Coaches</h2>
          <p>
            Team Media Hub was created by coaches who were frustrated with existing photo-sharing
            solutions. We're always improving based on feedback from teams like yours.
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
