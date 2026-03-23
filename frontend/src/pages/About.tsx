import React from "react";
import "../styles/pages.css";

export function About() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1>About Team Media Hub</h1>

        <section>
          <h2>Our Mission</h2>
          <p>
            Team Media Hub exists to help families capture team memories without giving up privacy.
            We are building the simplest and safest place for coaches and parents to share photos and
            videos from youth sports.
          </p>
        </section>

        <section>
          <h2>Why We Built It</h2>
          <p>
            Too many teams rely on social platforms that were never designed for private team sharing.
            Coaches asked for one place where parents could upload, browse, and download media without
            ads, algorithmic feeds, or public exposure.
          </p>
        </section>

        <section>
          <h2>What We Believe</h2>
          <ul>
            <li>Team memories should stay with the team.</li>
            <li>Sharing should be easy for every parent, on any device.</li>
            <li>Privacy and trust should be default settings, not premium add-ons.</li>
            <li>Tools for coaches should reduce workload, not add to it.</li>
          </ul>
        </section>

        <section>
          <h2>Where We Are Headed</h2>
          <p>
            We are focused on making Team Media Hub the home for youth sports media: faster uploads,
            smoother team management, and thoughtful features that keep families connected around the
            moments that matter most.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            We would love to hear your feedback and ideas. Reach us at{" "}
            <a href="mailto:support@teammediahub.co">support@teammediahub.co</a>.
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