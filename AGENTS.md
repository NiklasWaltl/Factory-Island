# AGENTS.md — Factory Island

Dieses Dokument richtet sich an KI-Coding-Agenten, die an diesem Repository arbeiten.

## Projektziel

Factory Island ist ein eigenständiges 2D-Fabrik-Aufbauspiel.

## Aktiver Scope

- Arbeite in `src/game/**`, `index.factory.html`, `vite.factory.config.ts`, `tsconfig.factory.json`, `package.json`, `public/` und `.github/workflows/`.

## Wichtige Regeln

- Keine neuen npm-Abhängigkeiten ohne Rückfrage.
- Keine großen Refactors ohne vorherigen Plan.
- Keine Spiellogik in UI-Komponenten.
- Keine Magic Numbers; nutze vorhandene Konstanten.
- Behalte den Build funktionsfähig (`yarn build`).

## Architekturhinweise

- `FactoryApp.tsx` ist der Root für Spielzustand und Ticks (`useReducer` + `setInterval`).
- `store/reducer.ts` ist die zentrale Quelle für State, Typen, Konstanten und Reducer-Logik.
- `simulation/game.ts` ist ein Re-Export-Wrapper (`export * from "../store/reducer"`) für bestehende Imports.
- Rezepte gehören ausschließlich nach `src/game/simulation/recipes/`.
- Neue UI-Elemente gehören in `src/game/ui/**`.
- Debug-Code nur hinter `import.meta.env.DEV`.

## Arbeitsweise

- Verändere nur die Dateien, die für die aktuelle Aufgabe nötig sind.
- Wenn eine Änderung mehrere Dateien betrifft, arbeite in kleinen, überprüfbaren Schritten.
- Zeige vor größeren Änderungen kurz Plan, betroffene Dateien und Risiko.
- Nach Codeänderungen immer die passenden Tests oder Builds ausführen.

## Prüfbefehle

- Lokal starten: `yarn dev`
- Bauen: `yarn build`
- Typecheck: `tsc --project tsconfig.factory.json --noEmit`
- Tests: `yarn test`
- Lint: `yarn lint`

## Bekannte Stolperfallen

- Alte Saves müssen über `normalizeLoadedState()` kompatibel bleiben.
- Bei Größenberechnungen nie direkt `asset.size` verwenden, sondern die vorhandenen Helper.
- Rotierbare Maschinen brauchen korrekte `direction`-Logik.
- Wenn ein Build-Fehler auftritt, zuerst die betroffene Konfigurations- oder Importkette prüfen.

## Verboten

- Keine stillen Fallbacks für fehlende Logik.
- Keine Änderung ohne anschließende Verifikation.
