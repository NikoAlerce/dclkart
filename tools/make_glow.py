#!/usr/bin/env python3
"""
make_glow.py — Genera texturas RGBA de "glow" radial en PNG, en Python PURO
(solo stdlib: struct + zlib). Sin dependencias (no PIL).

Se usan como billboards para partículas/luciérnagas/niebla: un plano que mira a
la cámara con una textura de glow suave se ve MUCHO mejor que una esfera dura.

Uso:
  python tools/make_glow.py
Genera en assets/textures/:
  glow_soft.png   — bokeh suave (caída gaussiana) para luciérnagas/esporas
  glow_sharp.png  — núcleo más marcado para chispas
  glow_mist.png   — muy difuso y tenue para niebla
"""
import struct, zlib, os, math


def write_png(path, width, height, rgba_rows):
    """rgba_rows: lista de bytearrays, cada una width*4 bytes (RGBA, 8-bit)."""
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        crc = zlib.crc32(tag + data) & 0xffffffff
        return c + struct.pack('>I', crc)

    raw = bytearray()
    for row in rgba_rows:
        raw.append(0)          # filtro 0 (None) por scanline
        raw.extend(row)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8-bit, color type 6 = RGBA
    idat = zlib.compress(bytes(raw), 9)

    with open(path, 'wb') as f:
        f.write(sig)
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', idat))
        f.write(chunk(b'IEND', b''))


def radial(size, falloff, core, gamma, tint=(255, 255, 255)):
    """Genera filas RGBA de un glow radial centrado.
    falloff: 'gauss' o 'pow'
    core: radio (0..1) del núcleo casi opaco
    gamma: curva de la caída (mayor = bordes más suaves)
    """
    rows = []
    c = (size - 1) / 2.0
    maxr = c
    tr, tg, tb = tint
    for y in range(size):
        row = bytearray(size * 4)
        for x in range(size):
            dx = (x - c) / maxr
            dy = (y - c) / maxr
            r = math.sqrt(dx * dx + dy * dy)          # 0 centro → ~1 borde
            if r >= 1.0:
                a = 0.0
            elif r <= core:
                a = 1.0
            else:
                t = (r - core) / (1.0 - core)         # 0..1 en la zona de caída
                if falloff == 'gauss':
                    a = math.exp(-(t * t) * gamma)
                else:
                    a = (1.0 - t) ** gamma
            ai = max(0, min(255, int(a * 255)))
            o = x * 4
            row[o]   = tr
            row[o+1] = tg
            row[o+2] = tb
            row[o+3] = ai
        rows.append(row)
    return rows


def main():
    out = os.path.join('assets', 'textures')
    os.makedirs(out, exist_ok=True)

    write_png(os.path.join(out, 'glow_soft.png'),  128, 128,
              radial(128, 'gauss', core=0.04, gamma=5.0))
    write_png(os.path.join(out, 'glow_sharp.png'), 128, 128,
              radial(128, 'pow',   core=0.10, gamma=2.2))
    write_png(os.path.join(out, 'glow_mist.png'),  128, 128,
              radial(128, 'gauss', core=0.00, gamma=2.0))

    for f in ('glow_soft.png', 'glow_sharp.png', 'glow_mist.png'):
        p = os.path.join(out, f)
        print(f"  {f}: {os.path.getsize(p)} bytes")
    print("Listo →", out)


if __name__ == '__main__':
    main()
