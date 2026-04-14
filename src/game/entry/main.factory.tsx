import React from "react";
import { createRoot } from "react-dom/client";
import FactoryGame from "../../features/builder/FactoryGame";

const root = document.getElementById("root")!;
createRoot(root).render(
  <React.StrictMode>
    <FactoryGame />
  </React.StrictMode>,
);
