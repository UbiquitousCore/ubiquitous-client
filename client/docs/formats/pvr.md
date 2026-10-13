# Textures: PVR v2 and PVRTC

Reader: `client/src/assets/formats/pvrtc.ts`; the choice between PVR, TGA
and PNG is `client/src/assets/formats/texture.ts`. Tests:
`client/test/formats.test.ts`, `client/test/realPacks.test.ts`.

## Telling the formats apart

The file extension is not reliable: many `.tga` files in `res.bin` and
`res_t.bin` are PVR textures. A file is PVR when bytes 44-47 are the ASCII
`PVR!`. PNG is recognised by its own signature; anything else is read as
TGA.

## Header (52 bytes)

Thirteen little-endian `uint32` words.

| Offset | Meaning                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | header size (52)                                                                                                                            |
| 4      | height                                                                                                                                      |
| 8      | width                                                                                                                                       |
| 12     | mip level count, not counting the full-size level                                                                                           |
| 16     | flags: low byte is the pixel format, `0x100` is set when there are mip levels, `0x200` means twiddled, `0x8000` means the texture has alpha |
| 20     | data length                                                                                                                                 |
| 24     | bits per pixel                                                                                                                              |
| 28-40  | channel masks (not read)                                                                                                                    |
| 44     | `PVR!`                                                                                                                                      |
| 48     | surface count, 1 in the shipped files (not read)                                                                                            |

Pixel formats 24 (PVRTC 2 bits per pixel) and 25 (PVRTC 4 bits per pixel)
are decoded; anything else is refused. The shipped textures are all
format 25 with the twiddle flag set. Nearly all are square; the few that
are not have one side a power-of-two multiple of the other.

Mip levels follow the full-size level, largest first, back to back, and
the data length covers them all. Each level takes at least 2x2 blocks. The
reader can start from a smaller level when asked for a size cap.

## Blocks

Each 8-byte block covers 4x4 pixels (4 bpp) or 8x4 pixels (2 bpp). The
first `uint32` holds the per-pixel modulation, the second the two colours.

Colour A is the low 16 bits and colour B the high 16 bits. Each colour's
top bit chooses its encoding:

| Top bit         | Colour A           | Colour B           |
| --------------- | ------------------ | ------------------ |
| 1 (opaque)      | RGB 5-5-4          | RGB 5-5-5          |
| 0 (translucent) | alpha 3, RGB 4-4-3 | alpha 3, RGB 4-4-4 |

Channels are widened to 8 bits by bit replication. Bit 0 of the colour word
selects the block's modulation mode.

4 bpp modulation is two bits per pixel, a weight between A and B in
eighths: 0, 3, 5, 8 in the normal mode and 0, 4, 4, 8 in the other mode,
where value 2 also makes the pixel fully transparent. 2 bpp modulation is
one bit per pixel, weight 0 or 8.

A pixel's A and B are not its own block's colours: each is interpolated
bilinearly from the four nearest block centres, wrapping at the texture
edges, and the weight then mixes the two. Results round halves up.

## Block order

Blocks are not stored row by row. In a grid of `cols` x `rows` blocks, the
largest square it holds, of side `min(cols, rows)`, is stored in Z-order:
bit k of the block's y lands on bit 2k of its index and bit k of x on bit
2k + 1. A non-square grid is a row or column of such squares, each stored
whole before the next.
