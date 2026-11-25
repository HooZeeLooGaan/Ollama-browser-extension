import struct, zlib

def make_png(size, path):
    rows = []
    cx = cy = size / 2
    r_outer = size * 0.42
    r_inner = size * 0.22
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = (dx*dx + dy*dy) ** 0.5
            in_ring = r_inner <= d <= r_outer
            in_tail = (dx > 0 and dy > 0 and abs(dx - dy) < size * 0.08 and d <= r_outer * 1.15)
            if in_ring or in_tail:
                row.extend((56, 189, 248, 255))
            else:
                row.extend((30, 27, 75, 255))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(tag, data):
        return struct.pack('!I', len(data)) + tag + data + struct.pack('!I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)

for s in (16, 48, 128):
    make_png(s, f'icons/icon{s}.png')