from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets' / 'og-kongxin-wang.jpg'
PORTRAIT = ROOT / 'assets' / 'kongxin-wang-portrait.jpg'

W, H = 1200, 630
NAVY = '#082a63'
NAVY_DEEP = '#061a3d'
GOLD = '#c9972b'
WHITE = '#ffffff'
MUTED = '#d7e3f7'
EN_FONT = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'
EN_BOLD = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'
CJK_FONT = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'


def font(path: str, size: int, index: int = 0):
    return ImageFont.truetype(path, size=size, index=index)


def crop_cover(image: Image.Image, width: int, height: int) -> Image.Image:
    ratio = width / height
    source_ratio = image.width / image.height
    if source_ratio > ratio:
        crop_width = int(image.height * ratio)
        left = (image.width - crop_width) // 2
        image = image.crop((left, 0, left + crop_width, image.height))
    else:
        crop_height = int(image.width / ratio)
        top = (image.height - crop_height) // 2
        image = image.crop((0, top, image.width, top + crop_height))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def main() -> None:
    canvas = Image.new('RGB', (W, H), NAVY_DEEP)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 780, H), fill=NAVY)
    draw.rectangle((72, 101, 164, 107), fill=GOLD)

    photo = crop_cover(Image.open(PORTRAIT).convert('RGB'), 420, H)
    canvas.paste(photo, (780, 0))
    draw.rectangle((758, 0, 780, H), fill=GOLD)

    draw.text((72, 144), 'Kongxin Wang', fill=WHITE, font=font(EN_BOLD, 64))
    draw.text((75, 226), '王孔鑫', fill=MUTED, font=font(CJK_FONT, 37))
    draw.text((72, 316), 'Financial Mathematics', fill=GOLD, font=font(EN_BOLD, 34))
    draw.text((72, 361), '& Data Analytics', fill=GOLD, font=font(EN_BOLD, 34))
    draw.text((72, 464), "Xi'an Jiaotong-Liverpool University", fill=MUTED, font=font(EN_FONT, 24))
    draw.text((72, 504), 'kongxinwang.com', fill=WHITE, font=font(EN_BOLD, 25))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, quality=92, optimize=True, progressive=True)
    print(f'created={OUT} size={OUT.stat().st_size} dimensions={W}x{H}')


if __name__ == '__main__':
    main()
