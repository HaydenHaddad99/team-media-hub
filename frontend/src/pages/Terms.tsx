import React from "react";
import "../styles/pages.css";

export function Terms() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1>Terms of Service</h1>
        <p className="last-updated">Last updated: February 26, 2026</p>

        <section>
          <h2>Acceptance of Terms</h2>
          <p>
            By using Team Media Hub, you agree to these terms. If you don't agree, please don't use
            our service. Simple as that.
          </p>
        </section>

        <section>
          <h2>Account Responsibilities</h2>
          <p>
            Team coaches are responsible for managing their team's access and content. Parents and
            uploaders must only share appropriate, team-related media. Don't upload anything illegal,
            offensive, or unrelated to your team.
          </p>
        </section>

        <section>
          <h2>Storage &amp; Billing</h2>
          <p>
            Free teams get 10GB of storage. Paid plans (Plus: 50GB, Pro: 200GB) are billed monthly.
            If you exceed your storage limit, uploads will be blocked until you upgrade or free up space.
          </p>
        </section>

        <section>
          <h2>Content Ownership</h2>
          <p>
            You own all media you upload. We don't claim any rights to your photos or videos.
            We store them securely and make them available only to your team members.
          </p>
        </section>

        <section>
          <h2>Service Availability</h2>
          <p>
            We strive for 99.9% uptime but can't guarantee it. We may perform maintenance that
            temporarily limits access. We're not liable for data loss (though we back up regularly).
          </p>
        </section>

        <section>
          <h2>Termination</h2>
          <p>
            You can cancel anytime. We may suspend accounts that violate these terms. Upon
            cancellation, your data will be retained for 30 days, then permanently deleted.
          </p>
        </section>

        <section>
          <h2>Questions?</h2>
          <p>
            Contact us at{" "}
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
