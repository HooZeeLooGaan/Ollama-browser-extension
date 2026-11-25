from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SIZES = [16, 32, 48, 128]
OUTPUT_DIR = Path(".")

# Colors
TRANSPARENT = (0, 0, 0, 0)
BUBBLE_FILL = (255, 255, 255, 255)   # White message symbol
BUBBLE_STROKE = (20, 24, 32, 255)    # Crisp dark outline
TEXT_COLOR = (15, 23, 42, 255)       # Dark slate "AI" text


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def draw_speech_bubble_icon(size: int) -> Image.Image:
    # Render at 4x supersampling and downscale with LANCZOS for smooth anti-aliased edges
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), TRANSPARENT)
    draw = ImageDraw.Draw(img)

    pad = int(canvas_size * 0.08)
    tail_height = int(canvas_size * 0.16)
    bubble_bottom = canvas_size - pad - tail_height
    bubble_top = pad
    bubble_left = pad
    bubble_right = canvas_size - pad

    radius = int((bubble_right - bubble_left) * 0.24)
    stroke_w = max(2, int(canvas_size * 0.045))

    # Rounded message bubble body
    draw.rounded_rectangle(
        [bubble_left, bubble_top, bubble_right, bubble_bottom],
        radius=radius,
        fill=BUBBLE_FILL,
        outline=BUBBLE_STROKE,
        width=stroke_w,
    )

    # Bottom-left speech bubble tail
    tail_x0 = bubble_left + int((bubble_right - bubble_left) * 0.22)
    tail_x1 = tail_x0 + int((bubble_right - bubble_left) * 0.24)
    tail_tip_x = tail_x0 - int((bubble_right - bubble_left) * 0.04)
    tail_tip_y = canvas_size - pad

    # Fill tail slightly overlapping the bottom edge so there's no seam line
    overlap = max(2, stroke_w)
    draw.polygon(
        [
            (tail_x0, bubble_bottom - overlap),
            (tail_x1, bubble_bottom - overlap),
            (tail_tip_x, tail_tip_y),
        ],
        fill=BUBBLE_FILL,
    )
    draw.line(
        [(tail_x0, bubble_bottom), (tail_tip_x, tail_tip_y)],
        fill=BUBBLE_STROKE,
        width=stroke_w,
    )
    draw.line(
        [(tail_tip_x, tail_tip_y), (tail_x1, bubble_bottom)],
        fill=BUBBLE_STROKE,
        width=stroke_w,
    )

    # Draw "AI" centered inside the bubble body
    font_size = int((bubble_bottom - bubble_top) * (0.44 if size >= 32 else 0.50))
    font = load_font(font_size)

    text = "AI"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    bubble_center_x = (bubble_left + bubble_right) / 2
    bubble_center_y = (bubble_top + bubble_bottom) / 2

    text_x = bubble_center_x - (text_w / 2) - bbox[0]
    text_y = bubble_center_y - (text_h / 2) - bbox[1]

    draw.text((text_x, text_y), text, font=font, fill=TEXT_COLOR)

    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        icon = draw_speech_bubble_icon(size)
        out_path = OUTPUT_DIR / f"icon{size}.png"
        icon.save(out_path, format="PNG")
        print(f"Generated {out_path} ({size}x{size})")


if __name__ == "__main__":
    main()