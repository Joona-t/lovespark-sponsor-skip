#!/usr/bin/env python3
"""
LoveSpark Sponsor Skip — generate_icons.py
Generates pink skip/fast-forward icons (⏭️ shape) at 16, 48, and 128px using Pillow.

Install dependency:
    pip install Pillow
    # or: pip3 install Pillow

Run:
    python3 generate_icons.py
"""

import os
import math
from PIL import Image, ImageDraw

# ── Color palette ───────────────────────────────────────────────────────────
HOT_PINK   = (255, 105, 180, 255)   # #FF69B4 — main triangle fill
LIGHT_PINK = (255, 208, 232, 255)   # #FFD0E8 — sparkle dots
GLOW_PINK  = (255, 105, 180, 80)    # semi-transparent glow layer


def draw_right_triangle(draw, cx, cy, w, h, color):
    """Draw a right-pointing filled triangle centred at (cx, cy)."""
    pts = [
        (cx - w / 2, cy - h / 2),  # top-left
        (cx + w / 2, cy),           # right point
        (cx - w / 2, cy + h / 2),  # bottom-left
    ]
    draw.polygon(pts, fill=color)


def draw_bar(draw, cx, cy, w, h, color):
    """Draw a vertical bar (the | in ⏭️) centred at (cx, cy)."""
    x0 = cx - w / 2
    y0 = cy - h / 2
    x1 = cx + w / 2
    y1 = cy + h / 2
    draw.rectangle([x0, y0, x1, y1], fill=color)


def draw_sparkle(draw, cx, cy, r, color):
    """Draw a small 4-point star sparkle centred at (cx, cy)."""
    pts = []
    for i in range(8):
        angle = math.radians(i * 45)
        radius = r if i % 2 == 0 else r * 0.4
        pts.append((
            cx + radius * math.cos(angle),
            cy + radius * math.sin(angle)
        ))
    draw.polygon(pts, fill=color)


def generate_icon(size):
    """Create a single RGBA icon image at the given pixel size."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = size / 2, size / 2
    margin = size * 0.10

    if size <= 16:
        # At 16px: draw a single clean right-pointing triangle (simple, readable)
        tri_w = size * 0.58
        tri_h = size * 0.72
        draw_right_triangle(draw, cx - size * 0.04, cy, tri_w, tri_h, HOT_PINK)

        # Small vertical bar on the right
        bar_w = max(2, size * 0.12)
        bar_h = size * 0.60
        bar_cx = cx + size * 0.35
        draw_bar(draw, bar_cx, cy, bar_w, bar_h, HOT_PINK)

    else:
        # 48px and 128px: double triangle + vertical bar (⏭️ shape)

        # Total usable width
        usable_w = size - margin * 2
        usable_h = size - margin * 2

        # Layout: [tri1][tri2][bar] side by side, fitting in usable_w
        bar_w  = usable_w * 0.10
        tri_w  = usable_w * 0.38   # each triangle width
        gap    = usable_w * 0.02   # gap between elements

        total = tri_w + gap + tri_w + gap + bar_w
        start_x = cx - total / 2

        tri_h = usable_h * 0.80
        bar_h = usable_h * 0.80

        # ── Soft glow layer (drawn first, slightly bigger, semi-transparent) ──
        glow_scale = 1.08
        tri1_cx = start_x + tri_w / 2
        tri2_cx = tri1_cx + tri_w + gap
        bar_cx  = tri2_cx + tri_w / 2 + gap + bar_w / 2

        draw_right_triangle(draw, tri1_cx, cy, tri_w * glow_scale, tri_h * glow_scale, GLOW_PINK)
        draw_right_triangle(draw, tri2_cx, cy, tri_w * glow_scale, tri_h * glow_scale, GLOW_PINK)
        draw_bar(draw, bar_cx, cy, bar_w * glow_scale, bar_h * glow_scale, GLOW_PINK)

        # ── Main shapes ────────────────────────────────────────────────────
        draw_right_triangle(draw, tri1_cx, cy, tri_w, tri_h, HOT_PINK)
        draw_right_triangle(draw, tri2_cx, cy, tri_w, tri_h, HOT_PINK)
        draw_bar(draw, bar_cx, cy, bar_w, bar_h, HOT_PINK)

        # ── Sparkle accent (top-right area) ───────────────────────────────
        if size >= 48:
            sp_r = size * 0.055
            sp_cx = cx + usable_w * 0.38
            sp_cy = cy - usable_h * 0.38
            draw_sparkle(draw, sp_cx, sp_cy, sp_r, LIGHT_PINK)

            # Smaller companion sparkle
            draw_sparkle(draw, sp_cx - size * 0.09, sp_cy + size * 0.07,
                        sp_r * 0.45, LIGHT_PINK)

    return img


def main():
    out_dir = os.path.join(os.path.dirname(__file__), 'icons')
    os.makedirs(out_dir, exist_ok=True)

    sizes = [16, 48, 128]
    for size in sizes:
        img  = generate_icon(size)
        path = os.path.join(out_dir, f'icon-{size}.png')
        img.save(path, 'PNG', optimize=True)
        print(f'  Generated {path}  ({size}x{size})')

    print('\nDone! Icons saved to icons/')


if __name__ == '__main__':
    main()
