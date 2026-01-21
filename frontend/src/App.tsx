import React, { useMemo, useState } from "react";
import { InviteLanding } from "./pages/InviteLanding";
import { Feed } from "./pages/Feed";
import { getCurrentToken } from "./lib/api";

export default function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => !!getCurrentToken());

  const content = hasToken ? (
    <Feed onLogout={() => setHasToken(false)} />
  ) : (
    <InviteLanding onReady={() => setHasToken(true)} />
  );

  return content;
}
