# -*- coding: utf-8 -*-
# Headless Ghidra Jython: decompile a hard-coded list of functions by VA and
# drop the results into tools/ghidra_out/. Quick-and-dirty helper for
# iterating on specific functions without re-running the full pipeline.
#
# @category Axon

import os

from ghidra.app.decompiler import DecompInterface, DecompileOptions
from ghidra.util.task import ConsoleTaskMonitor

OUT_DIR = os.environ.get(
    "AXON_OUT_DIR",
    "/Users/caryden/github/servo-programmer/research/static-analysis/ghidra_out",
)

TARGETS = [
    # ("label", va)
    ("slider_overlay_0x352",  0x00405518),
    ("slider_overlay_0x357",  0x00406248),
    ("param_read_read_caller_00403ffc", 0x00403ffc),
    ("param_read_read_caller_00408b90", 0x00408b90),
    ("param_caller_0040330c_arrival",   0x0040330c),
    # Load-to-UI functions: read config bytes → populate form widgets.
    # Called from the arrival handler (0x0040330c) at lines 165 and 211.
    ("load_to_ui_servo_0x352", 0x00404b28),   # servo mode load-to-UI
    ("load_to_ui_cr_0x357",    0x004054a0),   # CR mode load-to-UI
]


def log(msg):
    print("[axon-decomp] " + msg)


def main():
    if not os.path.exists(OUT_DIR):
        os.makedirs(OUT_DIR)
    dec = DecompInterface()
    dec.setOptions(DecompileOptions())
    dec.openProgram(currentProgram)

    for label, va in TARGETS:
        a = toAddr(va)
        func = getFunctionAt(a)
        if func is None:
            func = getFunctionContaining(a)
        if func is None:
            log("  %s: no function @ 0x%x" % (label, va))
            continue
        res = dec.decompileFunction(func, 120, ConsoleTaskMonitor())
        if res is None or not res.decompileCompleted():
            log("  %s: decompile failed" % label)
            continue
        src = res.getDecompiledFunction().getC()
        fname = "decomp_%s_%s.c" % (label, "%08x" % func.getEntryPoint().getOffset())
        path = os.path.join(OUT_DIR, fname)
        f = open(path, "w")
        try:
            f.write(src)
        finally:
            f.close()
        log("  %s -> %s  (%s, %d bytes)" % (label, fname, func.getName(), len(src)))


main()
