# side-by-side of the sunset piece and the private reference (reference/ is git-ignored)
import sys
from PIL import Image
shot = Image.open(sys.argv[1]); ref = Image.open("reference/sunset-ref.png").convert("RGB")
box = tuple(int(v) for v in sys.argv[2].split(","))
piece = shot.crop(box).convert("RGB")
h = 900
piece = piece.resize((int(piece.width * h / piece.height), h), Image.LANCZOS)
ref = ref.resize((int(ref.width * h / ref.height), h), Image.LANCZOS)
out = Image.new("RGB", (piece.width + ref.width + 30, h), (251, 250, 247))
out.paste(piece, (0, 0)); out.paste(ref, (piece.width + 30, 0))
out.save(sys.argv[3])
