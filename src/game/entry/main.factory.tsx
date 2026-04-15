import React from "react";
import { createRoot } from "react-dom/client";
import FactoryApp from "./FactoryApp";

const root = document.getElementById("root")!;
createRoot(root).render(
  <React.StrictMode>
    <FactoryApp />
  </React.StrictMode>,
);
