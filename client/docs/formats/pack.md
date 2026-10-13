# Packs (`.bin`) and the `.ipa`

Reader: `client/src/assets/vfs/zip.ts`. Tests: `client/test/packReader.test.ts`,
`client/test/realPacks.test.ts`.

## The `.ipa`

The `.ipa` is an ordinary ZIP. The packs sit inside it as
`Payload/<app>/<pack>.bin`, one file per pack.

## Pack layout

Every pack is a ZIP archive with one difference: each local file header
starts with the four bytes `GBMP` (read as a little-endian `uint32`,
`0x504D4247`) instead of `PK\x03\x04`. The central directory and the
end-of-central-directory record are standard. The reader accepts either
local signature.

| Record                   | Size                              | Fields the reader uses (byte offset: meaning)                                                                                    |
| ------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| End of central directory | 22 bytes                          | +10: entry count (`uint16`), +12: directory size, +16: directory offset                                                          |
| Central directory entry  | 46 bytes + name + extra + comment | +10: method, +20: compressed size, +24: size, +28: name length, +30: extra length, +32: comment length, +42: local header offset |
| Local file header        | 30 bytes + name + extra           | +6: flags, +18: compressed size, +22: size, +26: name length, +28: extra length                                                  |

- The packs carry no archive comment, so the end record is the last 22
  bytes of the file. The reader falls back to a bounded backwards search.
- Methods are 0 (stored) and 8 (raw DEFLATE). Nothing else appears.
- When flag bit 3 is set, or both sizes in the local header are zero, the
  sizes come from the central directory entry instead.
- Names use forward slashes. Case is not consistent between a pack and the
  data that refers into it (a model placed as `..._inn.bdae` can have its
  collision stored as `..._Inn.phy`), so every lookup is by lowercased name.

## Packs a build ships

| Pack                   | Holds                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| `res.bin`, `res_t.bin` | models, textures, effects, shaders, the interface                              |
| `tables.bin`           | the `.tbl` tables (see [ftable.md](ftable.md)); in 1.1.4 also the `.phy` files |
| `model_phy.bin`        | the `.phy` collision files, in 2.2.0                                           |
| `conf.bin`             | configuration                                                                  |
| `<map>.bin`            | one map's `.itm`, `.trn`, water and thumbnail files, under `world/<map>/`      |
| `<map>_layer.bin`      | that map's ground masks and shadow maps, under `world/<map>/layers/`           |

## Models inside `res.bin`

Every `.bdae` in `res.bin` is itself a small, standard (`PK`) ZIP holding
two members: `little_endian_not_quantized.bdae`, which is the model (see
[bdae.md](bdae.md)), and `version.nfo`. `unwrapBdae` returns the first
member whose name contains "little", and passes input that is not a ZIP
through unchanged.
