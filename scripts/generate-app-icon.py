from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SCALE = 4
SIZE = 1024
CANVAS = SIZE * SCALE


def point(value):
    return int(value * SCALE)


image = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
mask = Image.new('L', (CANVAS, CANVAS), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle(
    (point(56), point(56), point(968), point(968)),
    radius=point(225),
    fill=255,
)

gradient = Image.new('RGBA', (CANVAS, CANVAS))
pixels = gradient.load()
start = (160, 96, 255)
end = (91, 33, 182)
for y in range(CANVAS):
    for x in range(CANVAS):
        mix = min(1.0, max(0.0, (x + y) / (CANVAS * 2)))
        pixels[x, y] = tuple(int(start[i] * (1 - mix) + end[i] * mix) for i in range(3)) + (255,)
image.paste(gradient, (0, 0), mask)

glow = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse(
    (point(80), point(-170), point(850), point(600)),
    fill=(255, 255, 255, 68),
)
glow = glow.filter(ImageFilter.GaussianBlur(point(105)))
image.alpha_composite(glow)

draw = ImageDraw.Draw(image)
white = (255, 255, 255, 244)
soft_white = (255, 255, 255, 205)
stroke = point(31)
top = [(point(512), point(260)), (point(770), point(390)), (point(512), point(520)), (point(254), point(390)), (point(512), point(260))]
middle = [(point(254), point(500)), (point(512), point(630)), (point(770), point(500))]
bottom = [(point(254), point(620)), (point(512), point(750)), (point(770), point(620))]
draw.line(top, fill=white, width=stroke, joint='curve')
draw.line(middle, fill=soft_white, width=stroke, joint='curve')
draw.line(bottom, fill=soft_white, width=stroke, joint='curve')

png_path = ROOT / 'public' / 'icon.png'
ico_path = ROOT / 'build' / 'icon.ico'
ico_path.parent.mkdir(parents=True, exist_ok=True)
final = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
final.save(png_path, optimize=True)
final.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(png_path)
print(ico_path)
