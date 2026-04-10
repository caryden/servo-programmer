# -*- coding: utf-8 -*-
# Headless Ghidra Jython script (Python 2.7 syntax -- Ghidra Jython).
#
# Goal:
#   1. Locate the "Error 1030:Firmware is incorrect." string.
#   2. Walk up its single xref to the enclosing function (the firmware-upload
#      handler).
#   3. Decompile that function and everything it directly calls, saving the
#      C-like output to files under tools/ghidra_out/ so a human / Claude can
#      pattern-match the AESDecFile call.
#   4. As a bonus, scan the entire .data / .rodata range for printable-ASCII
#      runs of length 16..32 that could plausibly be AES-128 key material,
#      and dump data xrefs from the firmware-upload function to the .data
#      section so the key buffer is easy to spot.
#
# Run with:
#   analyzeHeadless <proj> <name> -process <file> \
#       -scriptPath tools/ghidra_scripts \
#       -postScript axon_hunt_aes.py \
#       -noanalysis    (only if the project is already analyzed)
#
# @category Axon

import os

from ghidra.app.decompiler import DecompInterface, DecompileOptions
from ghidra.util.task import ConsoleTaskMonitor
from ghidra.program.model.symbol import RefType, SymbolType
from ghidra.program.model.listing import CodeUnit
from ghidra.program.model.address import AddressSet

OUT_DIR = os.environ.get(
    "AXON_OUT_DIR",
    "/Users/caryden/github/servo-programmer/tools/ghidra_out",
)


def log(msg):
    print("[axon] " + msg)


# monitor is injected by the Ghidra headless runner into the script globals;
# declare it at module scope for linting / readability.
monitor = monitor  # noqa: F821


def ensure_out_dir():
    if not os.path.exists(OUT_DIR):
        os.makedirs(OUT_DIR)


def find_string_address(needle):
    """Return the Address of the first occurrence of `needle` in memory.
    Uses Ghidra's findBytes, which takes a byte-pattern string."""
    mem = currentProgram.getMemory()
    start = mem.getMinAddress()
    # findBytes wants a "byte string" — escape backslashes etc.
    # For printable ASCII this is straightforward.
    escaped = ""
    for ch in needle:
        b = ord(ch)
        escaped += "\\x%02x" % b
    result = findBytes(start, escaped)
    return result  # single Address or None


def ref_from_addresses_to(addr):
    """Return list of from-addresses that reference `addr`.

    Two strategies. The flat getReferencesTo() API + the ReferenceManager
    sometimes miss references Ghidra's auto-analyzer never tagged (common
    when a string sits inside a Delphi AnsiString header and the analyzer
    marked the data a few bytes earlier). So we fall back to a manual
    byte scan of .text via Memory.getBytes() in Jython.
    """
    refs = list(getReferencesTo(addr))
    hits = [r.getFromAddress() for r in refs]
    if hits:
        log("  tagged refs: %d" % len(hits))
        return hits

    # Also try the ReferenceManager directly.
    rm = currentProgram.getReferenceManager()
    it = rm.getReferencesTo(addr)
    while it.hasNext():
        r = it.next()
        hits.append(r.getFromAddress())
    if hits:
        log("  via ReferenceManager: %d" % len(hits))
        return hits

    # Manual byte scan: read the .text block into a Jython string and
    # scan for the 4-byte little-endian VA.
    log("  no tagged refs; scanning .text bytes manually")
    va = addr.getOffset()
    pat_bytes = [va & 0xff, (va >> 8) & 0xff,
                 (va >> 16) & 0xff, (va >> 24) & 0xff]

    mem = currentProgram.getMemory()
    text_block = mem.getBlock(".text")
    if text_block is None:
        log("  no .text block")
        return []
    size = int(text_block.getSize())
    log("  reading .text: %d bytes" % size)

    # Read in chunks to avoid Jython array allocation issues.
    CHUNK = 1 << 20  # 1 MiB
    start_addr = text_block.getStart()
    offset = 0
    listing = currentProgram.getListing()
    results = []
    while offset < size:
        n = min(CHUNK, size - offset)
        from jarray import zeros
        buf = zeros(n, "b")
        base = start_addr.add(offset)
        mem.getBytes(base, buf)
        # Scan this chunk for the pattern
        i = 0
        while i + 4 <= n:
            if (buf[i] & 0xff) == pat_bytes[0] and \
               (buf[i + 1] & 0xff) == pat_bytes[1] and \
               (buf[i + 2] & 0xff) == pat_bytes[2] and \
               (buf[i + 3] & 0xff) == pat_bytes[3]:
                hit_addr = base.add(i)
                # Walk back up to 6 bytes to find an instruction that contains
                # this immediate.
                for back in range(7):
                    probe = hit_addr.subtract(back)
                    insn = listing.getInstructionAt(probe)
                    if insn is None:
                        continue
                    # Accept if the instruction length covers [probe, hit_addr+4)
                    if probe.add(insn.getLength()).compareTo(
                            hit_addr.add(4)) >= 0:
                        results.append(probe)
                        break
                else:
                    # No instruction found — still record the raw location,
                    # Ghidra may not have disassembled here.
                    results.append(hit_addr)
            i += 1
        offset += n

    # Dedupe
    seen = set()
    uniq = []
    for r in results:
        k = str(r)
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    log("  byte scan found: %d" % len(uniq))
    return uniq


def decompile(dec, func):
    if func is None:
        return None
    res = dec.decompileFunction(func, 60, ConsoleTaskMonitor())
    if res is None or not res.decompileCompleted():
        return None
    dfn = res.getDecompiledFunction()
    if dfn is None:
        return None
    return dfn.getC()


def write_file(path, text):
    f = open(path, "w")
    try:
        f.write(text)
    finally:
        f.close()


def data_refs_into(data_start, data_end, from_func):
    """Collect all references from instructions inside `from_func` that
    target addresses in [data_start, data_end]."""
    body = from_func.getBody()
    hits = []
    iterator = body.getAddresses(True)
    listing = currentProgram.getListing()
    while iterator.hasNext():
        a = iterator.next()
        insn = listing.getInstructionAt(a)
        if insn is None:
            continue
        for ref in insn.getReferencesFrom():
            tgt = ref.getToAddress()
            if tgt is None:
                continue
            if (tgt.compareTo(data_start) >= 0 and
                    tgt.compareTo(data_end) <= 0):
                hits.append((a, tgt, ref.getReferenceType().toString()))
    return hits


def called_functions(func):
    """All functions directly called from `func` (flat, deduped)."""
    calls = set()
    listing = currentProgram.getListing()
    body = func.getBody()
    it = body.getAddresses(True)
    while it.hasNext():
        a = it.next()
        insn = listing.getInstructionAt(a)
        if insn is None:
            continue
        if not insn.getFlowType().isCall():
            continue
        for ref in insn.getReferencesFrom():
            if not ref.getReferenceType().isCall():
                continue
            f = getFunctionAt(ref.getToAddress())
            if f is not None:
                calls.add(f)
    return list(calls)


def section_range(name):
    """Return (minAddr, maxAddr) for a named memory block, or None."""
    mem = currentProgram.getMemory()
    blk = mem.getBlock(name)
    if blk is None:
        return None
    return (blk.getStart(), blk.getEnd())


def scan_printable_runs(minlen=16, maxlen=64):
    """Walk .data and collect candidate printable runs."""
    data_range = section_range(".data")
    if data_range is None:
        return []
    mem = currentProgram.getMemory()
    start, end = data_range
    out = []
    cur = []
    cur_start = None
    a = start
    while a.compareTo(end) <= 0:
        b = mem.getByte(a) & 0xff
        if 0x20 <= b < 0x7f:
            if cur_start is None:
                cur_start = a
            cur.append(chr(b))
        else:
            if cur_start is not None and minlen <= len(cur) <= maxlen:
                s = "".join(cur)
                if len(set(s)) > 4:
                    out.append((cur_start, s))
            cur = []
            cur_start = None
        try:
            a = a.next()
        except Exception:
            break
        if a is None:
            break
    if cur_start is not None and minlen <= len(cur) <= maxlen:
        out.append((cur_start, "".join(cur)))
    return out


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main():
    ensure_out_dir()
    log("output dir: " + OUT_DIR)

    prog = currentProgram
    log("program: %s  (imageBase %s)" %
        (prog.getName(), prog.getImageBase()))

    # 1. Find the Error 1030 string
    s_addr = find_string_address("Error 1030:Firmware is incorrect.")
    log("Error 1030 string at: %s" % s_addr)
    if s_addr is None:
        log("  not found — bailing")
        return

    # 2. Get xrefs
    refs = ref_from_addresses_to(s_addr)
    log("xrefs: %d" % len(refs))
    for r in refs:
        log("  from %s" % r)

    if not refs:
        return

    # 3. Enclosing function. Ghidra may not have discovered it; if so, walk
    # backwards through the listing looking for a `push ebp; mov ebp, esp`
    # prologue and force-create a function there.
    ref_addr = refs[0]
    func = getFunctionContaining(ref_addr)
    # Detect a bogus stub function Ghidra (or a prior run) created at the
    # ref address itself with only one or two instructions.
    if func is not None:
        body_size = func.getBody().getNumAddresses()
        if body_size < 32 and str(func.getEntryPoint()) == str(ref_addr):
            log("removing bogus %d-byte stub function at %s" %
                (body_size, func.getEntryPoint()))
            fm = currentProgram.getFunctionManager()
            fm.removeFunction(func.getEntryPoint())
            func = None
    if func is None:
        log("no function contains %s - searching backwards" % ref_addr)
        listing = currentProgram.getListing()
        insn = listing.getInstructionAt(ref_addr)
        log("  instruction at ref addr: %s" % insn)

        prev_func = getFunctionBefore(ref_addr)
        if prev_func is not None:
            log("  previous function: %s @ %s  (end %s)" % (
                prev_func.getName(),
                prev_func.getEntryPoint(),
                prev_func.getBody().getMaxAddress()
            ))

        # Walk raw bytes backwards from ref_addr looking for the standard
        # C++Builder / MSVC function prologue: `push ebp; mov ebp, esp`
        # which encodes as 55 8B EC. Ghidra's instruction-level walk would
        # skip over undisassembled gaps, so we operate on raw memory.
        mem = currentProgram.getMemory()
        text_block = mem.getBlock(".text")
        start_va = text_block.getStart().getOffset()
        cur_va = ref_addr.getOffset()
        MAX_BACK = 0x4000  # 16 KiB should comfortably contain any function
        prologue_va = None
        # Read a chunk backwards
        back_start = max(start_va, cur_va - MAX_BACK)
        nbytes = cur_va - back_start
        from jarray import zeros
        buf = zeros(nbytes, "b")
        mem.getBytes(toAddr(back_start), buf)
        # Scan from highest index to lowest
        i = nbytes - 3
        while i >= 0:
            if (buf[i] & 0xff) == 0x55 \
                    and (buf[i + 1] & 0xff) == 0x8b \
                    and (buf[i + 2] & 0xff) == 0xec:
                candidate = back_start + i
                # Prefer a candidate that is NOT inside an already-known
                # function (otherwise we'd split an existing one).
                a = toAddr(candidate)
                in_existing = getFunctionContaining(a)
                if in_existing is None:
                    prologue_va = candidate
                    break
            i -= 1

        if prologue_va is not None:
            prologue_at = toAddr(prologue_va)
            log("  found 55 8B EC prologue at %s - disassembling" %
                prologue_at)
            # Force disassembly from the prologue forward.
            from ghidra.app.cmd.disassemble import DisassembleCommand
            from ghidra.program.model.address import AddressSet
            cmd = DisassembleCommand(prologue_at, None, True)
            cmd.applyTo(currentProgram, monitor)
            createFunction(prologue_at, None)
            func = getFunctionAt(prologue_at)
            if func is None:
                log("  createFunction returned None at %s" % prologue_at)
        else:
            log("  no 55 8B EC prologue found within %d bytes back" %
                MAX_BACK)

    if func is None:
        log("still no function - bailing")
        return

    log("enclosing function: %s @ %s  (size %d)" %
        (func.getName(), func.getEntryPoint(),
         func.getBody().getNumAddresses()))

    # 4. Decompile it + every directly-called function
    dec = DecompInterface()
    dec.setOptions(DecompileOptions())
    dec.openProgram(prog)

    c_src = decompile(dec, func)
    if c_src is None:
        log("decompile failed for firmware handler")
        return
    out_main = os.path.join(OUT_DIR, "firmware_handler.c")
    write_file(out_main, c_src)
    log("wrote firmware handler: %s (%d bytes)" %
        (out_main, len(c_src)))

    callees = called_functions(func)
    log("direct callees: %d" % len(callees))
    for cal in sorted(callees, key=lambda f: f.getEntryPoint()):
        name = cal.getName()
        addr = cal.getEntryPoint()
        src = decompile(dec, cal)
        if src is None:
            continue
        safe_name = "%s_%s.c" % (addr, name.replace("::", "_"))
        safe_name = safe_name.replace("@", "at").replace("$", "")
        p = os.path.join(OUT_DIR, safe_name)
        write_file(p, src)
    log("wrote %d callee decompilations" % len(callees))

    # 5. Collect data xrefs from the firmware handler into .data
    data_range = section_range(".data")
    if data_range is not None:
        start, end = data_range
        data_hits = data_refs_into(start, end, func)
        lines = ["%s  ->  %s  (%s)" % (a, t, rt) for (a, t, rt) in data_hits]
        write_file(os.path.join(OUT_DIR, "firmware_handler_datarefs.txt"),
                   "\n".join(lines) + "\n")
        log("wrote %d data references from firmware handler" % len(data_hits))

    # 6. Scan .data for printable runs
    runs = scan_printable_runs(16, 64)
    out_runs = os.path.join(OUT_DIR, "data_printable_runs.txt")
    f = open(out_runs, "w")
    try:
        for addr, s in runs:
            f.write("%s  len=%d  %r\n" % (addr, len(s), s))
    finally:
        f.close()
    log("wrote %d printable runs in .data -> %s" % (len(runs), out_runs))

    log("done.")


main()
