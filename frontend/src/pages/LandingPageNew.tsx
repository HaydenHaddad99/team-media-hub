import React from "react";
import "../styles/LandingPageNew.css";

interface LandingPageNewProps {
  onReady?: () => void;
}

export function LandingPageNew({ onReady }: LandingPageNewProps) {

  const handleJoinClick = () => {
    window.history.pushState({}, "", "/join");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleCreateTeamClick = () => {
    window.history.pushState({}, "", "/create-team");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleCoachSignInClick = () => {
    window.history.pushState({}, "", "/coach/signin");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const screenshots = [
    {
      title: "Your team's photos in one place",
      description: "Clean grid view. Browse by date. Find what matters.",
      image: "/screenshots/grid.png",
    },
    {
      title: "Parents upload from their phone",
      description: "One button. Select photos. Done. No complicated folders.",
      image: "/screenshots/upload.png",
    },
    {
      title: "Private and secure",
      description: "Only your team sees photos. No algorithms. No ads. No social media drama.",
      image: "/screenshots/private.png",
    },
    {
      title: "Download anytime",
      description: "Parents download individual photos or entire events. Forever.",
      image: "/screenshots/download.png",
    },
    {
      title: "Works perfect on phones",
      description: "Built for mobile. Fast. Simple. Your way.",
      image: "/screenshots/mobile.png",
    },
  ];

  return (
    <div className="landing-new">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>A private place for your team's photos & videos</h1>
          <p className="hero-subtitle">No social media. No ads. Just your team.</p>

          <button
            className="cta-primary"
            onClick={handleJoinClick}
          >
            Join with Team Code
          </button>

          <p className="coach-link">
            Coach?{" "}
            <button
              type="button"
              onClick={handleCoachSignInClick}
              className="link-button"
            >
              Sign in
            </button>
            {" "}or{" "}
            <button
              type="button"
              onClick={handleCreateTeamClick}
              className="link-button"
            >
              Create a team
            </button>
          </p>
        </div>
      </section>

      {/* Screenshots Section */}
      <section className="screenshots-section">
        <h2>How it works</h2>
        <div className="screenshots-grid">
          {screenshots.map((screenshot, idx) => (
            <div key={idx} className="screenshot-card">
              <div className="screenshot-image">
                <div className="placeholder-image">
                  <div className="placeholder-text">{screenshot.title}</div>
                </div>
              </div>
              <h3>{screenshot.title}</h3>
              <p>{screenshot.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust Section */}
      <section className="trust-section">
        <div className="trust-stat">
          <div className="stat-number">50+</div>
          <div className="stat-label">Youth sports teams</div>
        </div>
        <div className="trust-stat">
          <div className="stat-number">10K+</div>
          <div className="stat-label">Photos shared privately</div>
        </div>
        <div className="trust-stat">
          <div className="stat-number">100%</div>
          <div className="stat-label">Private & secure</div>
        </div>
      </section>

      {/* Testimonials (optional - add real quotes later) */}
      <section className="testimonials">
        <h2>What coaches say</h2>
        <div className="testimonial-card">
          <p>"Finally, a place where parents can upload photos without worrying about privacy. Our whole team loves it."</p>
          <div className="testimonial-author">— Coach Mike, U10 Soccer</div>
        </div>
        <div className="testimonial-card">
          <p>"Way better than Facebook. Parents get it. Kids get it. Simple."</p>
          <div className="testimonial-author">— Coach Sarah, Youth Baseball</div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq">
        <h2>Questions?</h2>
        <div className="faq-item">
          <h4>Do I need a password?</h4>
          <p>Nope. Use your email. Get a 6-digit code. Done. Magic link auth.</p>
        </div>
        <div className="faq-item">
          <h4>How much storage do I get?</h4>
          <p>5GB free. That's 100+ high-res photos. Upgrade anytime.</p>
        </div>
        <div className="faq-item">
          <h4>Can I share outside my team?</h4>
          <p>Yes. Download photos anytime. Share how you want.</p>
        </div>
        <div className="faq-item">
          <h4>What about privacy?</h4>
          <p>Your photos stay private. Only your team sees them. No ads. No algorithms. No social media.</p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <h2>Ready to get started?</h2>
        <button className="cta-primary" onClick={handleJoinClick}>
          Join with Team Code
        </button>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>© 2026 Team Media Hub. Built for coaches. By coaches.</p>
        <div className="footer-links">
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#contact">Contact</a>
        </div>
      </footer>
    </div>
  );
}
