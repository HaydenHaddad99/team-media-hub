import React, { useState } from "react";
import { Landing } from "./pages/Landing";
import { Feed } from "./pages/Feed";
import { getCurrentToken } from "./lib/api";

export default function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => !!getCurrentToken());

  return hasToken ? (
    <Feed onLogout={() => setHasToken(false)} />
  ) : (
    <Landing onReady={() => setHasToken(true)} />
  );
}
