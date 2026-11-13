# Restaurant visual asset pass

## Created

- `customer-floor.svg` — seamless dark slate checker floor for the dining/customer area. The 512 × 512 texture repeats cleanly and is kept separate from game code for review.

## New GLB assets

The six requested modular props are in `public/gpt-models/`, with a visual preview at `restaurant-assets-preview.png`:

- `kitchen-floor-checker.glb` — small cream/sage checker tiles.
- `dining-set-gingham.glb` — customer dining table and four chairs with a red/cream checker top.
- `counter-front-oak.glb` — oak cabinet face section with framed doors and brass pulls.
- `kitchen-halfwall-brick.glb` — red-brown brick half-wall with end piers and cap.
- `wall-dressing-panel.glb` — framed food picture, spice shelf, jars, and wall sconce.
- `dining-detail-pack.glb` — menu sign, tabletop condiment tray, and candle.

The existing props folder also contains plants, guest variants, windows, brick/backsplash panels, sinks, and fridges. These new assets remain standalone for review and have not been wired into game code.
