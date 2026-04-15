/**
 * Portal App Override – Factory Island
 *
 * This file overrides src/core/features/portal/PortalApp.tsx via a Vite alias
 * so that when VITE_PORTAL_APP is set, the Factory Island mini-game is loaded
 * instead of the default SFL portal example.
 *
 * The override mechanism:
 *   src/core/main.tsx imports "features/portal/PortalApp"
 *   → Vite alias redirects to this file (src/features/portal/PortalApp.tsx)
 *   → This renders FactoryApp directly
 */
import React from "react";
import FactoryApp from "../../game/entry/FactoryApp";

export const PortalApp: React.FC = () => {
  return <FactoryApp />;
};
