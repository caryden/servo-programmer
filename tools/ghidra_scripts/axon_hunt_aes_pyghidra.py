#!/usr/bin/env python3
"""
CPython-3 / PyGhidra driver that opens the already-imported Axon binary,
walks from the "Error 1030" string to the firmware-upload handler,
decompiles it and everything it directly calls, and dumps the results
under tools/ghidra_out/.

Run with the pyghidra venv activated:

    source ~/tools/pyghidra-venv/bin/activate
    export GHIDRA_INSTALL_DIR=~/tools/ghidra_12.0.4_PUBLIC
    export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
    python3 tools/ghidra_scripts/axon_hunt_aes_pyghidra.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Paths -----------------------------------------------------------------
REPO = Path(__file__).resolve().parents[2]
EXE = REPO / "downloads" / "Axon_Servo_Programming_Software_v1.0.5.exe"
PROJECT_DIR = "/tmp/ghidra_proj"
PROJECT_NAME = "axon"
OUT_DIR = REPO / "tools" / "ghidra_out"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def log(msg: str) -> None:
    print(f"[axon] {msg}", flush=True)


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def main() -> int:
    import pyghidra

    # Will reuse the project we imported into earlier; analysis is cached.
    pyghidra.start(verbose=False)

    # Import inside the Java bridge; these cannot be imported before start()
    from ghidra.app.decompiler import DecompInterface, DecompileOptions
    from ghidra.util.task import ConsoleTaskMonitor

    log(f"opening program: {EXE}")
    with pyghidra.open_program(
        str(EXE),
        project_location=PROJECT_DIR,
        project_name=PROJECT_NAME,
        analyze=True,
    ) as flat:
        prog = flat.getCurrentProgram()
        log(
            f"program: {prog.getName()}  "
            f"imageBase={prog.getImageBase()}  "
            f"language={prog.getLanguageID()}"
        )

        # --- find "Error 1030" string ---
        target = "Error 1030:Firmware is incorrect."
        escaped = "".join(f"\\x{ord(c):02x}" for c in target)
        mem = prog.getMemory()
        s_addr = flat.findBytes(mem.getMinAddress(), escaped)
        log(f'"{target}" at {s_addr}')
        if s_addr is None:
            log("not found; abort")
            return 1

        refs = [r.getFromAddress() for r in flat.getReferencesTo(s_addr)]
        log(f"xrefs to string: {len(refs)}")
        for r in refs:
            log(f"  from {r}")
        if not refs:
            return 1

        fn = flat.getFunctionContaining(refs[0])
        if fn is None:
            log(f"no function contains {refs[0]}; creating one")
            flat.createFunction(refs[0], None)
            fn = flat.getFunctionContaining(refs[0])
        if fn is None:
            log("unable to get enclosing function; abort")
            return 1
        log(
            f"enclosing function: {fn.getName()} "
            f"@ {fn.getEntryPoint()}  "
            f"body={fn.getBody().getNumAddresses()} bytes"
        )

        # --- decompile the firmware handler and its direct callees ---
        dec = DecompInterface()
        dec.setOptions(DecompileOptions())
        dec.openProgram(prog)

        def decompile(func):
            res = dec.decompileFunction(func, 120, ConsoleTaskMonitor())
            if res is None or not res.decompileCompleted():
                return None
            d = res.getDecompiledFunction()
            return d.getC() if d else None

        main_src = decompile(fn)
        if main_src is None:
            log("decompile of firmware handler failed")
            return 1
        out_main = OUT_DIR / "firmware_handler.c"
        write(out_main, main_src)
        log(f"wrote {out_main}  ({len(main_src)} bytes)")

        # Collect direct callees
        callees = set()
        listing = prog.getListing()
        for addr in fn.getBody().getAddresses(True):
            insn = listing.getInstructionAt(addr)
            if insn is None or not insn.getFlowType().isCall():
                continue
            for ref in insn.getReferencesFrom():
                if not ref.getReferenceType().isCall():
                    continue
                callee = flat.getFunctionAt(ref.getToAddress())
                if callee is not None:
                    callees.add(callee)

        log(f"direct callees: {len(callees)}")
        calls_file = OUT_DIR / "firmware_handler_callees.txt"
        with open(calls_file, "w") as f:
            for c in sorted(callees, key=lambda x: int(str(x.getEntryPoint()), 16)):
                f.write(f"{c.getEntryPoint()}  {c.getName()}\n")

        # Decompile each, but skip tiny VCL helpers we don't care about
        for c in callees:
            src = decompile(c)
            if src is None:
                continue
            ep = str(c.getEntryPoint())
            name = c.getName().replace("::", "_").replace("@", "at").replace("$", "")
            p = OUT_DIR / f"callee_{ep}_{name}.c"
            write(p, src)

        # --- data references from the handler into .data ---
        data_block = mem.getBlock(".data")
        if data_block is not None:
            data_start, data_end = data_block.getStart(), data_block.getEnd()
            data_refs = []
            for addr in fn.getBody().getAddresses(True):
                insn = listing.getInstructionAt(addr)
                if insn is None:
                    continue
                for ref in insn.getReferencesFrom():
                    tgt = ref.getToAddress()
                    if tgt is None:
                        continue
                    if (tgt.compareTo(data_start) >= 0
                            and tgt.compareTo(data_end) <= 0):
                        data_refs.append((addr, tgt, str(ref.getReferenceType())))
            out_refs = OUT_DIR / "firmware_handler_datarefs.txt"
            with open(out_refs, "w") as f:
                for a, t, rt in data_refs:
                    f.write(f"{a}  ->  {t}  ({rt})\n")
            log(f"wrote {len(data_refs)} data refs -> {out_refs}")

        log("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
