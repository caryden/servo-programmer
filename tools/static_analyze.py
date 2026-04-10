#!/usr/bin/env python3
"""
Static-analysis helper for the Axon Servo Programmer binary.

Small toolbox that was used to produce docs/FINDINGS.md. Run with one of:

    python3 tools/static_analyze.py pe-info <exe>
    python3 tools/static_analyze.py find-xrefs <exe> <hex-va>
    python3 tools/static_analyze.py disasm <exe> <hex-va> [nbytes]
    python3 tools/static_analyze.py string-xrefs <exe> <ascii-string>
    python3 tools/static_analyze.py dump-dfm <exe>
    python3 tools/static_analyze.py sfw-diff <sfw1> <sfw2> [sfw3...]
    python3 tools/static_analyze.py try-decrypt <sfw> <hexkey-32-chars>

Requires: pefile, capstone (`pip install pefile capstone`).
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

try:
    import pefile
    import capstone
except ImportError as _imp_err:  # pragma: no cover
    # Non-fatal: several subcommands (decrypt, sfw-diff, try-decrypt) work
    # fine without pefile / capstone, so only the PE-specific commands bail.
    pefile = None  # type: ignore
    capstone = None  # type: ignore
    _IMPORT_ERROR = _imp_err
else:
    _IMPORT_ERROR = None


def _require_pe_libs() -> None:
    if _IMPORT_ERROR is not None:
        sys.stderr.write(
            "Install dependencies first:  pip install pefile capstone\n"
        )
        raise SystemExit(2) from _IMPORT_ERROR


# ---------------------------------------------------------------------------
# PE helpers
# ---------------------------------------------------------------------------

def open_pe(path: str):
    _require_pe_libs()
    return pefile.PE(path, fast_load=False)


def va_to_file(pe: pefile.PE, va: int) -> int:
    return pe.get_offset_from_rva(va - pe.OPTIONAL_HEADER.ImageBase)


def file_to_va(pe: pefile.PE, off: int) -> int:
    return pe.OPTIONAL_HEADER.ImageBase + pe.get_rva_from_offset(off)


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------

def cmd_pe_info(exe: str) -> None:
    pe = open_pe(exe)
    oh = pe.OPTIONAL_HEADER
    print(f"ImageBase       : 0x{oh.ImageBase:x}")
    print(f"EntryPoint (RVA): 0x{oh.AddressOfEntryPoint:x}")
    print(f"Subsystem       : {oh.Subsystem} (2=GUI,3=CUI)")
    print(f"Machine         : 0x{pe.FILE_HEADER.Machine:x}")
    print(f"Compile time    : {pe.FILE_HEADER.TimeDateStamp}")
    print("\nSections:")
    for s in pe.sections:
        name = s.Name.rstrip(b"\0").decode("ascii", "replace")
        print(f"  {name:10}  va=0x{s.VirtualAddress:08x}  vsize=0x{s.Misc_VirtualSize:08x}  "
              f"roff=0x{s.PointerToRawData:08x}  rsize=0x{s.SizeOfRawData:08x}")
    print("\nImports:")
    for entry in pe.DIRECTORY_ENTRY_IMPORT:
        print(f"  {entry.dll.decode()}  ({len(entry.imports)} funcs)")
    # Exports summary
    if hasattr(pe, "DIRECTORY_ENTRY_EXPORT"):
        n = len(pe.DIRECTORY_ENTRY_EXPORT.symbols)
        print(f"\nExports: {n} named symbols "
              f"(typical for Delphi / C++Builder RTTI)")


def cmd_find_xrefs(exe: str, hex_va: str) -> None:
    """Linear scan for 4-byte little-endian references to a virtual address."""
    target = int(hex_va, 16)
    pe = open_pe(exe)
    data = pe.__data__
    ref = struct.pack("<I", target)
    hits = []
    p = 0
    while True:
        i = data.find(ref, p)
        if i < 0:
            break
        hits.append(i)
        p = i + 1
    print(f"references to 0x{target:x}: {len(hits)}")
    for h in hits:
        try:
            rva = pe.get_rva_from_offset(h)
            va = pe.OPTIONAL_HEADER.ImageBase + rva
            print(f"  file 0x{h:x}  rva 0x{rva:x}  va 0x{va:x}")
        except Exception:
            print(f"  file 0x{h:x}  (outside mapped sections)")


def cmd_disasm(exe: str, hex_va: str, nbytes: str = "200") -> None:
    pe = open_pe(exe)
    data = pe.__data__
    va = int(hex_va, 16)
    n = int(nbytes)
    foff = va_to_file(pe, va)
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
    for ins in md.disasm(data[foff:foff + n], va):
        print(f"  0x{ins.address:08x}: {ins.mnemonic:7} {ins.op_str}")


def cmd_string_xrefs(exe: str, needle: str) -> None:
    pe = open_pe(exe)
    data = pe.__data__
    # find all occurrences of the string, then look for dword references
    needle_b = needle.encode("latin-1") + b"\x00"
    starts = []
    p = 0
    while True:
        i = data.find(needle_b, p)
        if i < 0:
            break
        starts.append(i)
        p = i + 1
    if not starts:
        print(f"'{needle}' not found (tried NUL-terminated ASCII)")
        return
    for s in starts:
        try:
            va = file_to_va(pe, s)
        except Exception:
            continue
        print(f"string at file 0x{s:x}  va 0x{va:x}")
        ref = struct.pack("<I", va)
        p = 0
        hits = []
        while True:
            i = data.find(ref, p)
            if i < 0:
                break
            hits.append(i)
            p = i + 1
        print(f"  {len(hits)} xrefs:")
        for h in hits[:20]:
            try:
                hva = file_to_va(pe, h)
                print(f"    file 0x{h:x}  va 0x{hva:x}")
            except Exception:
                pass


def cmd_dump_dfm(exe: str) -> None:
    """Extract the TForm1 DFM resource and save beside the exe."""
    pe = pefile.PE(exe)
    pe.parse_data_directories()

    def walk(dir_entry, path=""):
        for e in dir_entry.entries:
            name = e.name.decode() if e.name else f"ID_{e.id}"
            p = path + "/" + name
            if hasattr(e, "directory"):
                yield from walk(e.directory, p)
            else:
                yield p, e.data.struct

    out_dir = Path(exe).parent
    for p, info in walk(pe.DIRECTORY_ENTRY_RESOURCE):
        if not p.startswith("/ID_10/"):
            continue  # only RCDATA
        offset = pe.get_offset_from_rva(info.OffsetToData)
        blob = pe.__data__[offset:offset + info.Size]
        safe = p.strip("/").replace("/", "_")
        (out_dir / f"{safe}.bin").write_bytes(blob)
        print(f"  {p}  ({info.Size} bytes) -> {safe}.bin")


def cmd_sfw_diff(*paths: str) -> None:
    blobs = {Path(p).name: Path(p).read_bytes() for p in paths}
    sizes = {n: len(b) for n, b in blobs.items()}
    print("sizes:")
    for n, sz in sizes.items():
        print(f"  {n}: {sz}  (mod 16 = {sz % 16}; (sz-16) mod 16 = {(sz - 16) % 16})")
    print("\nfirst 16 bytes (per-file header / IV):")
    for n, b in blobs.items():
        print(f"  {n}: {b[:16].hex()}")
    print("\nbytes [0x10:0x70] (compare across files):")
    for n, b in blobs.items():
        print(f"  {n}:\n    {b[0x10:0x70].hex()}")
    # Pairwise common prefix of bytes [0x10:]
    names = list(blobs)
    print("\npairwise common-prefix length starting at offset 0x10:")
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a = blobs[names[i]][0x10:]
            b = blobs[names[j]][0x10:]
            k = 0
            while k < min(len(a), len(b)) and a[k] == b[k]:
                k += 1
            print(f"  {names[i]} vs {names[j]}: {k} bytes")


def cmd_decrypt(sfw: str, out: str = "-") -> None:
    """
    Decrypt an Axon .sfw firmware file and print (or save) the plaintext.

    The format is:
      - first 16 bytes of the file : AES-128-ECB, key = "TTTTTTTTTTTTTTTT"
        -> [uint32_le payload_length, 12 x 0x78 ('x') magic]
      - the remaining bytes        : AES-128-CBC, IV = 0, same key
        -> ASCII text: one "@0801<model>" handshake line, N "$HHHH" sector
           erase lines, then standard Intel HEX records terminated by the
           `:00000001FF` EOF record.

    Requires pycryptodome (`pip install pycryptodome`).
    """
    try:
        from Crypto.Cipher import AES  # type: ignore
    except ImportError:
        sys.stderr.write("pip install pycryptodome to use decrypt\n")
        raise
    key = b"T" * 16
    data = Path(sfw).read_bytes()
    if len(data) < 32 or len(data) % 16:
        raise SystemExit(
            f"{sfw}: size {len(data)} is not a valid .sfw "
            f"(must be >=32 and multiple of 16)"
        )
    header = AES.new(key, AES.MODE_ECB).decrypt(data[:16])
    payload_len = int.from_bytes(header[:4], "little")
    magic = header[4:16]
    if magic != b"x" * 12:
        sys.stderr.write(
            f"warning: header magic is {magic!r}, expected {b'x'*12!r}\n"
        )
    payload_ct = data[16:]
    payload_pt = AES.new(key, AES.MODE_CBC, iv=b"\x00" * 16).decrypt(payload_ct)
    plaintext = payload_pt[:payload_len]
    if out == "-":
        sys.stdout.buffer.write(plaintext)
    else:
        Path(out).write_bytes(plaintext)
        print(f"wrote {out}  ({len(plaintext)} bytes, header declared {payload_len})")


def cmd_try_decrypt(sfw: str, hex_key: str) -> None:
    """
    Best-effort probe for an unknown .sfw key. Tries ECB and CBC(iv=0) both
    with and without skipping the first 16 bytes. Useful when you have a
    candidate key and want to see if any variant produces printable text.

    Requires the PyCryptodome package  (`pip install pycryptodome`).
    """
    try:
        from Crypto.Cipher import AES  # type: ignore
    except ImportError:
        sys.stderr.write("pip install pycryptodome to use try-decrypt\n")
        raise
    key = bytes.fromhex(hex_key)
    if len(key) not in (16, 24, 32):
        raise SystemExit(f"key must be 16/24/32 bytes, got {len(key)}")
    data = Path(sfw).read_bytes()
    print(f"{sfw}: {len(data)} bytes")
    for skip, label in ((0, "full-blob"), (16, "skip first 16")):
        blob = data[skip:]
        if len(blob) % 16:
            print(f"  [{label}] length not multiple of 16, skipping")
            continue
        pt = AES.new(key, AES.MODE_ECB).decrypt(blob)
        printable = sum(1 for b in pt[:256] if 32 <= b < 127 or b in (9, 10, 13))
        print(f"  [{label}] first 32 bytes (hex): {pt[:32].hex()}")
        print(f"  [{label}] first 32 bytes (asc): "
              f"{bytes(c if 32 <= c < 127 else 46 for c in pt[:32]).decode()}")
        print(f"  [{label}] printable ratio in first 256 bytes: {printable}/256")
        # Try zlib after the 16-byte header
        try:
            import zlib
            unz = zlib.decompress(pt)
            print(f"  [{label}] zlib OK — {len(unz)} bytes")
        except Exception as exc:
            print(f"  [{label}] zlib failed: {exc}")


# ---------------------------------------------------------------------------
# entrypoint
# ---------------------------------------------------------------------------

COMMANDS = {
    "pe-info": cmd_pe_info,
    "find-xrefs": cmd_find_xrefs,
    "disasm": cmd_disasm,
    "string-xrefs": cmd_string_xrefs,
    "dump-dfm": cmd_dump_dfm,
    "sfw-diff": cmd_sfw_diff,
    "decrypt": cmd_decrypt,
    "try-decrypt": cmd_try_decrypt,
}


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        return 2
    cmd = COMMANDS[sys.argv[1]]
    cmd(*sys.argv[2:])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
