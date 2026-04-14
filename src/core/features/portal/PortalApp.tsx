import React, { useCallback, useEffect, useRef, useState } from "react";
import Phaser from "phaser";

// ─── Konstanten ───────────────────────────────────────────────────────────────
const TILE = 40;               // Pixel pro Feld
const ASSET_TILES = 2;         // Alle relevanten Assets sind 2×2 Felder groß
const AT = ASSET_TILES * TILE; // Asset-Größe in Pixel (80px)
const WORLD_TILES = 80;        // Weltgröße in Feldern
const GRASS_X0 = 32;
const GRASS_Y0 = 32;
const GRASS_N = 17;            // 17×17 Grasfeld → Felder 32..48
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;
const RESPAWN_MS = 10_000;

// Asset-Positionen — 2×2 Felder, 1-Tile-Abstand, alle innerhalb 32..48
// Reihe 1 (y=33): tree(33..34), stone(36..37), shop(39..40), iron(42..43)
// Reihe 2 (y=36): workbench(33..34), warehouse(36..37)
const POS = {
  tree:      { x: 33, y: 33, label: "Baum" },
  stone:     { x: 36, y: 33, label: "Stein" },
  shop:      { x: 39, y: 33, label: "Shop" },
  iron:      { x: 42, y: 33, label: "Eisen" },
  workbench: { x: 33, y: 36, label: "Werkbank" },
  warehouse: { x: 36, y: 36, label: "Lagerhaus" },
} as const;

// ─── Typen ────────────────────────────────────────────────────────────────────
type ResKey = "tree" | "stone" | "iron";
type ModalKey = "shop" | "workbench" | "warehouse";

interface Inv {
  wood: number; stone: number; iron: number;
  axes: number; woodPickaxes: number; stonePickaxes: number;
}
interface GameState {
  coins: number;
  inventory: Inv;
  resources: Record<ResKey, { alive: boolean; respawnAt: number | null }>;
}
interface Toast { id: number; label: string; amount: number; }

const INITIAL_STATE: GameState = {
  coins: 100,
  inventory: { wood: 0, stone: 0, iron: 0, axes: 0, woodPickaxes: 0, stonePickaxes: 0 },
  resources: {
    tree:  { alive: true, respawnAt: null },
    stone: { alive: true, respawnAt: null },
    iron:  { alive: true, respawnAt: null },
  },
};

interface Bridge {
  getState: () => GameState;
  setState: React.Dispatch<React.SetStateAction<GameState>>;
  openModal: (m: ModalKey) => void;
  addToast: (label: string, amount: number) => void;
}
const _bridge: { cb: Bridge | null } = { cb: null };

// ─── Phaser Scene ─────────────────────────────────────────────────────────────
class GameScene extends Phaser.Scene {
  private dragX = 0;
  private dragY = 0;
  private wasDragging = false;
  private resContainers = new Map<ResKey, Phaser.GameObjects.Container>();
  private respawnBars   = new Map<ResKey, Phaser.GameObjects.Container>();

  constructor() { super({ key: "GameScene" }); }

  create() {
    const worldPx = WORLD_TILES * TILE;
    this.cameras.main.setBounds(0, 0, worldPx, worldPx);
    this.drawWater();
    this.drawGrass();
    this.drawGridLines();
    this.drawGridCoords();
    this.placeBuildings();
    this.placeResources();
    this.setupInput();
    this.cameras.main.centerOn(
      (GRASS_X0 + GRASS_N / 2) * TILE,
      (GRASS_Y0 + GRASS_N / 2) * TILE,
    );
  }

  update() { this.tickRespawnBars(); }

  // ── Hintergrund ───────────────────────────────────────────────────────────
  private drawWater() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x1565c0);
    g.fillRect(0, 0, WORLD_TILES * TILE, WORLD_TILES * TILE);
  }

  private drawGrass() {
    const g = this.add.graphics().setDepth(1);
    for (let ty = GRASS_Y0; ty < GRASS_Y0 + GRASS_N; ty++) {
      for (let tx = GRASS_X0; tx < GRASS_X0 + GRASS_N; tx++) {
        g.fillStyle((tx + ty) % 2 === 0 ? 0x56ac3b : 0x4ea235);
        g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
  }

  private drawGridLines() {
    const g = this.add.graphics().setDepth(2);
    g.lineStyle(1, 0x000000, 0.12);
    for (let y = 0; y <= WORLD_TILES; y++) {
      g.moveTo(0, y * TILE); g.lineTo(WORLD_TILES * TILE, y * TILE);
    }
    for (let x = 0; x <= WORLD_TILES; x++) {
      g.moveTo(x * TILE, 0); g.lineTo(x * TILE, WORLD_TILES * TILE);
    }
    g.strokePath();
  }

  private drawGridCoords() {
    // Koordinaten auf jedem Feld – Phaser cullt off-screen Objects automatisch
    for (let ty = 0; ty < WORLD_TILES; ty++) {
      for (let tx = 0; tx < WORLD_TILES; tx++) {
        this.add.text(
          tx * TILE + 4, ty * TILE + 4,
          `${tx},${ty}`,
          { fontSize: "10px", color: "#ffffff" },
        ).setAlpha(0.45).setDepth(3);
      }
    }
  }

  // ── Assets ────────────────────────────────────────────────────────────────
  private makeTile(
    tx: number, ty: number,
    color: number, borderColor: number,
    emoji: string, label: string,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(tx * TILE, ty * TILE).setDepth(4);
    const bg = this.add.graphics();
    bg.fillStyle(color);
    bg.fillRoundedRect(3, 3, AT - 6, AT - 6, 7);
    bg.lineStyle(2, borderColor, 0.85);
    bg.strokeRoundedRect(3, 3, AT - 6, AT - 6, 7);
    const icon = this.add.text(AT / 2, AT / 2 - 8, emoji, { fontSize: "26px" }).setOrigin(0.5);
    const nameTxt = this.add.text(AT / 2, AT / 2 + 20, label, {
      fontSize: "11px", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5);
    c.add([bg, icon, nameTxt]);
    return c;
  }

  private addZone(tx: number, ty: number, cb: () => void) {
    const z = this.add.zone(tx * TILE + AT / 2, ty * TILE + AT / 2, AT, AT)
      .setInteractive({ useHandCursor: true }).setDepth(10);
    z.on("pointerup", () => { if (!this.wasDragging) cb(); });
  }

  private placeBuildings() {
    const defs: Array<{ key: ModalKey; color: number; border: number; emoji: string }> = [
      { key: "shop",      color: 0xc0621a, border: 0xff8c00, emoji: "🏪" },
      { key: "workbench", color: 0x6d4c41, border: 0xa0776b, emoji: "🔨" },
      { key: "warehouse", color: 0x37474f, border: 0x607d8b, emoji: "📦" },
    ];
    for (const { key, color, border, emoji } of defs) {
      const p = POS[key];
      this.makeTile(p.x, p.y, color, border, emoji, p.label);
      this.addZone(p.x, p.y, () => _bridge.cb?.openModal(key));
    }
  }

  private placeResources() {
    const defs: Array<{ key: ResKey; color: number; border: number; emoji: string }> = [
      { key: "tree",  color: 0x2e7d32, border: 0x66bb6a, emoji: "🌲" },
      { key: "stone", color: 0x616161, border: 0x9e9e9e, emoji: "🪨" },
      { key: "iron",  color: 0x455a64, border: 0x78909c, emoji: "🔩" },
    ];
    for (const { key, color, border, emoji } of defs) {
      const p = POS[key];
      const c = this.makeTile(p.x, p.y, color, border, emoji, p.label);
      this.resContainers.set(key, c);
      this.addZone(p.x, p.y, () => this.mine(key));
    }
  }

  // ── Abbau ─────────────────────────────────────────────────────────────────
  private shake(key: ResKey) {
    const spr = this.resContainers.get(key);
    if (!spr) return;
    const ox = spr.x;
    this.tweens.add({
      targets: spr, x: ox + 6, yoyo: true, repeat: 3, duration: 60,
      onComplete: () => { spr.x = ox; },
    });
  }

  private mine(key: ResKey) {
    const b = _bridge.cb;
    if (!b) return;
    const s = b.getState();
    if (!s.resources[key].alive) return;
    const inv = s.inventory;
    const now = Date.now();

    if (key === "tree"  && inv.axes          < 1) { this.shake(key); return; }
    if (key === "stone" && inv.woodPickaxes  < 1) { this.shake(key); return; }
    if (key === "iron"  && inv.stonePickaxes < 1) { this.shake(key); return; }

    if (key === "tree") {
      b.setState(prev => ({
        ...prev,
        inventory: { ...prev.inventory, wood:  prev.inventory.wood  + 5, axes:          prev.inventory.axes          - 1 },
        resources: { ...prev.resources, tree:  { alive: false, respawnAt: now + RESPAWN_MS } },
      }));
      b.addToast("🪵 Holz", 5);
    } else if (key === "stone") {
      b.setState(prev => ({
        ...prev,
        inventory: { ...prev.inventory, stone: prev.inventory.stone + 5, woodPickaxes:  prev.inventory.woodPickaxes  - 1 },
        resources: { ...prev.resources, stone: { alive: false, respawnAt: now + RESPAWN_MS } },
      }));
      b.addToast("🪨 Stein", 5);
    } else {
      b.setState(prev => ({
        ...prev,
        inventory: { ...prev.inventory, iron:  prev.inventory.iron  + 5, stonePickaxes: prev.inventory.stonePickaxes - 1 },
        resources: { ...prev.resources, iron:  { alive: false, respawnAt: now + RESPAWN_MS } },
      }));
      b.addToast("🔩 Eisen", 5);
    }

    this.resContainers.get(key)?.setVisible(false);
    this.startRespawnBar(key, now + RESPAWN_MS);
    this.time.delayedCall(RESPAWN_MS, () => {
      b.setState(prev => ({
        ...prev, resources: { ...prev.resources, [key]: { alive: true, respawnAt: null } },
      }));
      this.resContainers.get(key)?.setVisible(true);
      this.clearRespawnBar(key);
    });
  }

  // ── Respawn-Balken ────────────────────────────────────────────────────────
  private startRespawnBar(key: ResKey, at: number) {
    const p = POS[key];
    const c = this.add.container(p.x * TILE, p.y * TILE + AT + 3).setDepth(20);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7); bg.fillRect(0, 0, AT, 10);
    const bar = this.add.graphics();
    c.add([bg, bar]);
    c.setData("at", at); c.setData("bar", bar);
    this.respawnBars.set(key, c);
  }

  private clearRespawnBar(key: ResKey) {
    this.respawnBars.get(key)?.destroy();
    this.respawnBars.delete(key);
  }

  private tickRespawnBars() {
    const now = Date.now();
    this.respawnBars.forEach(c => {
      const at  = c.getData("at")  as number;
      const bar = c.getData("bar") as Phaser.GameObjects.Graphics;
      const p   = Math.min(1, (RESPAWN_MS - (at - now)) / RESPAWN_MS);
      bar.clear();
      bar.fillStyle(0x4caf50);
      bar.fillRect(1, 1, Math.floor((AT - 2) * p), 8);
    });
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  private setupInput() {
    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      this.dragX = ptr.x; this.dragY = ptr.y; this.wasDragging = false;
    });
    this.input.on("pointermove", (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown) return;
      const d = Math.hypot(ptr.x - this.dragX, ptr.y - this.dragY);
      if (d > 6) this.wasDragging = true;
      if (this.wasDragging) {
        this.cameras.main.scrollX -= (ptr.x - this.dragX);
        this.cameras.main.scrollY -= (ptr.y - this.dragY);
        this.dragX = ptr.x; this.dragY = ptr.y;
      }
    });
    this.input.on("wheel", (_p: unknown, _g: unknown, _dx: number, dy: number) => {
      const cam     = this.cameras.main;
      const worldPx = WORLD_TILES * TILE;
      // Dynamische Minimum-Zoom-Berechnung: Welt füllt immer den Viewport
      const minZoom = Math.max(this.scale.width / worldPx, this.scale.height / worldPx);
      cam.setZoom(Phaser.Math.Clamp(
        cam.zoom + (dy > 0 ? -ZOOM_STEP : ZOOM_STEP),
        minZoom,
        MAX_ZOOM,
      ));
    });
  }
}

// ─── React-Komponenten ────────────────────────────────────────────────────────

// Backdrop-Klick schließt Modal (Feature 1)
const ModalWrap: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> =
  ({ title, onClose, children }) => (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.65)", zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#1e2a38", border: "2px solid #4a7fc0",
          borderRadius: 14, padding: "26px 30px", minWidth: 360,
          color: "#fff", position: "relative", boxShadow: "0 8px 50px rgba(0,0,0,0.8)",
        }}
      >
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 12, right: 16, background: "none", border: "none", color: "#aaa", fontSize: 24, cursor: "pointer" }}
        >✕</button>
        <h2 style={{ margin: "0 0 18px", fontSize: 24 }}>{title}</h2>
        {children}
      </div>
    </div>
  );

const Row: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 17 }}>
    <span style={{ color: "#aaa" }}>{label}</span>
    <strong style={{ color: "#fff" }}>{value}</strong>
  </div>
);

const Btn: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode }> =
  ({ onClick, disabled, children }) => (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "12px 0", margin: "7px 0", borderRadius: 9, border: "none",
      background: disabled ? "#2a3a50" : "#2e6fc7",
      color: disabled ? "#555" : "#fff",
      cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 17, fontWeight: "bold", transition: "background 0.2s",
    }}>{children}</button>
  );

const ShopModal: React.FC<{
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<GameState>>;
  addToast: (l: string, n: number) => void;
  onClose: () => void;
}> = ({ state, setState, addToast, onClose }) => (
  <ModalWrap title="🏪 Shop" onClose={onClose}>
    <Row label="Münzen" value={`${state.coins} 🪙`} />
    <hr style={{ borderColor: "#2a3a50", margin: "14px 0" }} />
    <p style={{ fontSize: 16, color: "#ccc", margin: "0 0 4px" }}>
      🪓 Axt <span style={{ color: "#777", fontSize: 14 }}>— hält 1 Baum</span>
    </p>
    <Btn
      onClick={() => {
        setState(p => ({ ...p, coins: p.coins - 10, inventory: { ...p.inventory, axes: p.inventory.axes + 1 } }));
        addToast("🪓 Axt", 1);
      }}
      disabled={state.coins < 10}
    >Kaufen — 10 🪙</Btn>
  </ModalWrap>
);

const WorkbenchModal: React.FC<{
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<GameState>>;
  addToast: (l: string, n: number) => void;
  onClose: () => void;
}> = ({ state, setState, addToast, onClose }) => {
  const inv = state.inventory;
  return (
    <ModalWrap title="🔨 Werkbank" onClose={onClose}>
      <Row label="🪵 Holz"  value={inv.wood} />
      <Row label="🪨 Stein" value={inv.stone} />
      <hr style={{ borderColor: "#2a3a50", margin: "14px 0" }} />
      <p style={{ fontSize: 16, color: "#ccc", margin: "0 0 4px" }}>🪓 Holzspitzhacke</p>
      <Btn
        onClick={() => {
          setState(p => ({ ...p, inventory: { ...p.inventory, wood: p.inventory.wood - 5, woodPickaxes: p.inventory.woodPickaxes + 1 } }));
          addToast("🪓 Holzspitzhacke", 1);
        }}
        disabled={inv.wood < 5}
      >Craften — 5 🪵</Btn>
      <p style={{ fontSize: 16, color: "#ccc", margin: "10px 0 4px" }}>⛏️ Steinspitzhacke</p>
      <Btn
        onClick={() => {
          setState(p => ({ ...p, inventory: { ...p.inventory, stone: p.inventory.stone - 5, stonePickaxes: p.inventory.stonePickaxes + 1 } }));
          addToast("⛏️ Steinspitzhacke", 1);
        }}
        disabled={inv.stone < 5}
      >Craften — 5 🪨</Btn>
    </ModalWrap>
  );
};

const WarehouseModal: React.FC<{ state: GameState; onClose: () => void }> =
  ({ state, onClose }) => {
    const inv = state.inventory;
    return (
      <ModalWrap title="📦 Lagerhaus" onClose={onClose}>
        <div style={{ fontSize: 13, color: "#5a7a9a", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.2 }}>Ressourcen</div>
        <Row label="🪵 Holz"  value={inv.wood} />
        <Row label="🪨 Stein" value={inv.stone} />
        <Row label="🔩 Eisen" value={inv.iron} />
        <hr style={{ borderColor: "#2a3a50", margin: "14px 0" }} />
        <div style={{ fontSize: 13, color: "#5a7a9a", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.2 }}>Werkzeuge</div>
        <Row label="🪓 Äxte"              value={inv.axes} />
        <Row label="🪓 Holzspitzhacken"   value={inv.woodPickaxes} />
        <Row label="⛏️ Steinspitzhacken"  value={inv.stonePickaxes} />
      </ModalWrap>
    );
  };

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export const PortalApp: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [modal,     setModal]     = useState<ModalKey | null>(null);
  const [toasts,    setToasts]    = useState<Toast[]>([]);
  const stateRef = useRef(gameState);
  const gameRef  = useRef<Phaser.Game | null>(null);
  const phaserEl = useRef<HTMLDivElement>(null);
  const toastId     = useRef(0);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => { stateRef.current = gameState; }, [gameState]);

  const addToast = useCallback((label: string, amount: number) => {
    // Gleiche Labels mergen statt stapeln
    setToasts(prev => {
      const exists = prev.find(t => t.label === label);
      if (exists) {
        return prev.map(t => t.label === label ? { ...t, amount: t.amount + amount } : t);
      }
      return [{ id: ++toastId.current, label, amount }, ...prev];
    });
    // Timer zurücksetzen, damit das Popup erst 3s nach der letzten Erhalt-Aktion verschwindet
    const old = toastTimers.current.get(label);
    if (old) clearTimeout(old);
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.label !== label));
      toastTimers.current.delete(label);
    }, 3000);
    toastTimers.current.set(label, timer);
  }, []);

  useEffect(() => {
    if (!phaserEl.current || gameRef.current) return;
    _bridge.cb = { getState: () => stateRef.current, setState: setGameState, openModal: setModal, addToast };
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: phaserEl.current,
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [GameScene],
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      _bridge.cb = null;
    };
  }, [addToast]);

  return (
    <>
      <div ref={phaserEl} style={{ width: "100vw", height: "100vh", overflow: "hidden" }} />

      {/* Münzen-Anzeige oben rechts */}
      <div style={{
        position: "fixed", top: 16, right: 16, zIndex: 500,
        background: "rgba(10,20,40,0.92)", border: "2px solid #f5c842",
        borderRadius: 12, padding: "10px 22px",
        color: "#f5c842", fontSize: 22, fontWeight: "bold",
        display: "flex", alignItems: "center", gap: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}>
        🪙 {gameState.coins}
      </div>

      {/* Toast-Benachrichtigungen links (Feature 2) */}
      <div style={{
        position: "fixed", left: 16, top: "50%", transform: "translateY(-50%)",
        zIndex: 500, display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: "none",
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: "rgba(10,20,40,0.94)", border: "2px solid #4a7fc0",
            borderRadius: 10, padding: "10px 20px",
            color: "#fff", fontSize: 18, fontWeight: "bold",
            whiteSpace: "nowrap", animation: "slideIn 0.25s ease",
          }}>
            +{t.amount} {t.label}
          </div>
        ))}
      </div>

      {/* Modals */}
      {modal === "shop"      && <ShopModal      state={gameState} setState={setGameState} addToast={addToast} onClose={() => setModal(null)} />}
      {modal === "workbench" && <WorkbenchModal state={gameState} setState={setGameState} addToast={addToast} onClose={() => setModal(null)} />}
      {modal === "warehouse" && <WarehouseModal state={gameState} onClose={() => setModal(null)} />}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
};
