import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { FactoryGridScene } from "./FactoryGridScene";

export const FactoryGridPhaser: React.FC = () => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (gameRef.current) return;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 27 * 32,
      height: 27 * 32,
      parent: containerRef.current,
      backgroundColor: "#3498db",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [FactoryGridScene],
      pixelArt: true,
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100vw", height: "100vh" }} />;
};
