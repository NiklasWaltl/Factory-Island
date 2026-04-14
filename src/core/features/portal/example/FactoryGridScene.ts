const GRID_SIZE = 27;
const TILE_SIZE = 32;

export class FactoryGridScene extends Phaser.Scene {
  constructor() {
    super({ key: "factory_grid" });
  }

  create() {
    this.cameras.main.setBackgroundColor("#3498db");
    this.renderGrid();
  }

  renderGrid() {
    const offsetX = (this.cameras.main.width - GRID_SIZE * TILE_SIZE) / 2;
    const offsetY = (this.cameras.main.height - GRID_SIZE * TILE_SIZE) / 2;
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0xffffff, 0.3);
    for (let y = 0; y <= GRID_SIZE; y++) {
      graphics.moveTo(offsetX, offsetY + y * TILE_SIZE);
      graphics.lineTo(offsetX + GRID_SIZE * TILE_SIZE, offsetY + y * TILE_SIZE);
    }
    for (let x = 0; x <= GRID_SIZE; x++) {
      graphics.moveTo(offsetX + x * TILE_SIZE, offsetY);
      graphics.lineTo(offsetX + x * TILE_SIZE, offsetY + GRID_SIZE * TILE_SIZE);
    }
    graphics.strokePath();
  }
}
