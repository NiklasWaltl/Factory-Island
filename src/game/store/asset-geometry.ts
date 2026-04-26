import type { PlacedAsset } from "./types";

export function assetWidth(asset: PlacedAsset): number {
  return asset.width ?? asset.size;
}

export function assetHeight(asset: PlacedAsset): number {
  return asset.height ?? asset.size;
}

export function getAutoSmelterIoCells(asset: PlacedAsset): {
  input: { x: number; y: number };
  output: { x: number; y: number };
} {
  const dir = asset.direction ?? "east";
  const w = assetWidth(asset);
  const h = assetHeight(asset);
  switch (dir) {
    case "east":
      return { input: { x: asset.x - 1, y: asset.y }, output: { x: asset.x + w, y: asset.y } };
    case "west":
      return { input: { x: asset.x + w, y: asset.y }, output: { x: asset.x - 1, y: asset.y } };
    case "north":
      return { input: { x: asset.x, y: asset.y + h }, output: { x: asset.x, y: asset.y - 1 } };
    case "south":
      return { input: { x: asset.x, y: asset.y - 1 }, output: { x: asset.x, y: asset.y + h } };
  }
}
