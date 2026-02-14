import React from "react";
import { navigate } from "../lib/navigation";

export function PublicNav() {
  return (
    <nav className="appNav">
      <button className="appNavBrand" onClick={() => navigate("/")}>TMH</button>
      <div className="appNavLinks">
        <button className="appNavLink" onClick={() => navigate("/")}>Home</button>
      </div>
    </nav>
  );
}
