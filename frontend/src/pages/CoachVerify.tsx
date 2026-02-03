import { useState, useEffect } from "react";

interface CoachVerifyProps {
  onVerified?: () => void;
}

export function CoachVerify({ onVerified }: CoachVerifyProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const storedEmail = localStorage.getItem("coach_signin_email");
    if (!storedEmail) {
      window.history.pushState({}, "", "/coach/signin");
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    setEmail(storedEmail);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim().replace(/\D/g, "").slice(0, 6);

    if (trimmedCode.length !== 6) {
      setError("Enter a 6-digit code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/auth/verify-coach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          code: trimmedCode,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || "Invalid code");
      }

      const data = await res.json();
      
      // Store the user token (different from invite token)
      if (data.user_token) {
        localStorage.setItem("tmh_user_token", data.user_token);
      }
      if (data.user_id) {
        localStorage.setItem("tmh_user_id", data.user_id);
      }

      // Keep email for display purposes (stored during sign-in)
      // localStorage.setItem("coach_signin_email", email) was already done in CoachSignIn

      // Navigate to coach dashboard
      window.history.pushState({}, "", "/coach/dashboard");
      window.dispatchEvent(new PopStateEvent("popstate"));
      onVerified?.();
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      maxWidth: "400px",
      margin: "0 auto",
      padding: "40px 20px",
    }}>
      <h2 style={{ marginTop: 0, color: "#00aeff" }}>Enter Code</h2>
      <p style={{ color: "#aaa", marginBottom: "10px" }}>
        We sent a 6-digit code to:
      </p>
      <p style={{ color: "#00ff88", fontWeight: "600", marginBottom: "30px" }}>
        {email}
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
            6-Digit Code
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            autoFocus
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #333",
              borderRadius: "6px",
              backgroundColor: "#1a1a2e",
              color: "#fff",
              fontSize: "24px",
              letterSpacing: "4px",
              textAlign: "center",
              fontWeight: "600",
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
          disabled={loading || code.length !== 6}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: loading || code.length !== 6 ? "#444" : "#00aeff",
            color: loading || code.length !== 6 ? "#999" : "#000",
            border: "none",
            borderRadius: "6px",
            fontSize: "16px",
            fontWeight: "600",
            cursor: (loading || code.length !== 6) ? "not-allowed" : "pointer",
            transition: "all 0.3s ease",
          }}
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>

      <p style={{
        textAlign: "center",
        color: "#666",
        fontSize: "14px",
        marginTop: "20px",
      }}>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem("coach_signin_email");
            window.history.pushState({}, "", "/coach/signin");
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
          Back
        </button>
      </p>
    </div>
  );
}
