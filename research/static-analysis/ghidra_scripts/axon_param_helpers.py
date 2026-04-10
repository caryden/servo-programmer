# -*- coding: utf-8 -*-
# Headless Ghidra Jython: decompile the two inline param helpers (the WRITE
# helper at 0x00404900 and the READ helper at 0x004047d0) plus every function
# that calls them. Writes results into tools/ghidra_out/param_*.c so a human
# can read them directly.
#
# Usage (after Features/PyGhidra has been renamed aside, so .py falls through
# to Jython):
#
#   export JAVA_HOME=~/tools/corretto21/Contents/Home
#   ~/tools/ghidra_12.0.4_PUBLIC/support/analyzeHeadless /tmp/ghidra_proj axon \
#       -process Axon_Servo_Programming_Software_v1.0.5.exe -noanalysis \
#       -scriptPath tools/ghidra_scripts -postScript axon_param_helpers.py
#
# @category Axon

import os

from ghidra.app.decompiler import DecompInterface, DecompileOptions
from ghidra.util.task import ConsoleTaskMonitor

OUT_DIR = os.environ.get(
    "AXON_OUT_DIR",
    "/Users/caryden/github/servo-programmer/tools/ghidra_out",
)

# The helper addresses found via capstone.
PARAM_WRITE_HELPER = 0x00404900
PARAM_READ_HELPER  = 0x004047d0

# Every callsite we already located by scanning for direct `call rel32` to
# each helper. For each, we'll look up the enclosing function and decompile it.
WRITE_CALLSITES = [0x00403186, 0x00404a71]
READ_CALLSITES  = [0x0040310f, 0x00403604, 0x00403821, 0x00404062,
                   0x004043c8, 0x00404a48, 0x00404a83, 0x00408bd3]


def log(msg):
    print("[axon-params] " + msg)


def ensure_out_dir():
    if not os.path.exists(OUT_DIR):
        os.makedirs(OUT_DIR)


def enclosing(addr_va):
    """Return the function containing a given VA, creating one if needed."""
    a = toAddr(addr_va)
    func = getFunctionContaining(a)
    if func is not None:
        return func

    # Walk raw bytes backwards for a `55 8B EC` x86 prologue.
    mem = currentProgram.getMemory()
    text_block = mem.getBlock(".text")
    text_start_va = text_block.getStart().getOffset()
    cur = addr_va
    from jarray import zeros
    MAX = 0x4000
    back_start = max(text_start_va, cur - MAX)
    nbytes = cur - back_start
    if nbytes <= 0:
        return None
    buf = zeros(nbytes, "b")
    mem.getBytes(toAddr(back_start), buf)
    i = nbytes - 3
    while i >= 0:
        if ((buf[i] & 0xff) == 0x55
                and (buf[i + 1] & 0xff) == 0x8b
                and (buf[i + 2] & 0xff) == 0xec):
            candidate = back_start + i
            if getFunctionContaining(toAddr(candidate)) is None:
                from ghidra.app.cmd.disassemble import DisassembleCommand
                prologue_at = toAddr(candidate)
                DisassembleCommand(prologue_at, None, True).applyTo(
                    currentProgram, monitor)
                createFunction(prologue_at, None)
                func = getFunctionAt(prologue_at)
                if func is not None:
                    return func
        i -= 1
    return None


def main():
    ensure_out_dir()

    dec = DecompInterface()
    dec.setOptions(DecompileOptions())
    dec.openProgram(currentProgram)

    def dump(label, va):
        func = enclosing(va)
        if func is None:
            log("  %s @ 0x%x : no enclosing function" % (label, va))
            return
        res = dec.decompileFunction(func, 120, ConsoleTaskMonitor())
        if res is None or not res.decompileCompleted():
            log("  %s @ 0x%x : decompile failed" % (label, va))
            return
        src = res.getDecompiledFunction().getC()
        fname = "param_%s_%s_%s.c" % (
            label,
            "%08x" % func.getEntryPoint().getOffset(),
            func.getName().replace("::", "_").replace("@", "at").replace("$", ""))
        path = os.path.join(OUT_DIR, fname)
        f = open(path, "w")
        try:
            f.write(src)
        finally:
            f.close()
        log("  %s @ 0x%x -> %s  (func %s @ %s, %d bytes)" %
            (label, va, fname, func.getName(), func.getEntryPoint(), len(src)))

    log("helpers")
    dump("helper_WRITE", PARAM_WRITE_HELPER)
    dump("helper_READ",  PARAM_READ_HELPER)

    log("write callers (rare -- 2 total)")
    for v in WRITE_CALLSITES:
        dump("write_caller", v)

    log("read callers (8 total)")
    for v in READ_CALLSITES:
        dump("read_caller", v)

    log("done.")


main()
