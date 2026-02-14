import { useState } from "react";
import { PublicNav } from "../components/PublicNav";

interface CoachSignInProps {
  onEmailSubmitted?: () => void;
}

export function CoachSignIn({ onEmailSubmitted }: CoachSignInProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/auth/coach-signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || "Failed to send code");
      }

      // Store email for verification step
      localStorage.setItem("coach_signin_email", trimmedEmail);
      
      // Navigate to verification
      window.history.pushState({}, "", "/coach/verify");
      window.dispatchEvent(new PopStateEvent("popstate"));
      onEmailSubmitted?.();
    } catch (err: any) {
      setError(err.message || "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PublicNav />
      <div style={{
        maxWidth: "400px",
        margin: "0 auto",
        padding: "40px 20px",
      }}>
        <h2 style={{ marginTop: 0, color: "#00aeff" }}>Coach Sign In</h2>
        <p style={{ color: "#aaa", marginBottom: "30px" }}>
          Enter your email to access your teams. We'll send you a 6-digit code.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "14px",
              fontWeight: "500",
              color: "#ddd",
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #333",
                borderRadius: "6px",
                backgroundColor: "#1a1a2e",
                color: "#fff",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
              disabled={loading}
            />
          </div>

          {error && (
            <div style={{
              padding: "12px",
              backgroundColor: "rgba(255, 100, 100, 0.1)",
              border: "1px solid #ff6464",
              borderRadius: "6px",
              color: "#ff8888",
              marginBottom: "20px",
              fontSize: "14px",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: loading ? "#444" : "#00aeff",
              color: loading ? "#999" : "#000",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.3s ease",
            }}
          >
            {loading ? "Sending..." : "Send Code"}
          </button>
        </form>

        <p style={{
          textAlign: "center",
          color: "#666",
          fontSize: "14px",
          marginTop: "20px",
        }}>
          Not a coach?{" "}
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, "", "/join");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
            style={{
              background: "none",
              border: "none",
              color: "#00aeff",
              cursor: "pointer",
              textDecoration: "underline",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            Join as parent
          </button>
        </p>
      </div>
    </div>
  );
}
