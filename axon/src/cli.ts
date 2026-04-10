#!/usr/bin/env bun

/**
 * `axon` — cross-platform CLI for the Axon Robotics servo programmer.
 *
 * Entry point, argv parser, and dispatcher. See docs/CLI_DESIGN.md
 * for the v1 command surface.
 *
 * Hand-rolled argv parsing because the command surface is small and
 * adding a dep for it would outweigh the benefit.
 */

import { runMonitor } from "./commands/monitor.ts";
import { runRead } from "./commands/read.ts";
import { runStatus } from "./commands/status.ts";
import { runWrite } from "./commands/write.ts";
import { AxonError, ExitCode } from "./errors.ts";

export interface GlobalFlags {
  json: boolean;
  quiet: boolean;
  yes: boolean;
}

interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: Record<string, string | boolean>;
  global: GlobalFlags;
}

const GLOBAL_BOOLS = new Set(["json", "quiet", "yes", "y", "help", "h"]);

function parseArgs(argv: string[]): ParsedArgs {
  const global: GlobalFlags = { json: false, quiet: false, yes: false };
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      let name: string;
      let value: string | boolean;
      if (eq >= 0) {
        name = body.slice(0, eq);
        value = body.slice(eq + 1);
      } else {
        name = body;
        // boolean by default; if next arg isn't another flag, treat
        // as a string value (unless the flag is known to be a boolean)
        if (GLOBAL_BOOLS.has(name)) {
          value = true;
        } else {
          const next = argv[i + 1];
          if (next !== undefined && !next.startsWith("-")) {
            value = next;
            i++;
          } else {
            value = true;
          }
        }
      }
      if (name === "json") global.json = true;
      else if (name === "quiet") global.quiet = true;
      else if (name === "yes") global.yes = true;
      else flags[name] = value;
    } else if (arg.startsWith("-") && arg.length > 1) {
      // short flags: -y, -h, etc
      const ch = arg.slice(1);
      if (ch === "y") global.yes = true;
      else if (ch === "h") flags.help = true;
      else flags[ch] = true;
    } else if (command === null) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags, global };
}

function printTopLevelHelp(): void {
  process.stdout.write(
    `axon — cross-platform CLI for the Axon Robotics servo programmer

USAGE:
  axon [--json] [--quiet] [--yes] <command> [args...]

COMMANDS:
  status            Check adapter + servo presence (one shot)
  monitor           Live presence polling (Ctrl-C to stop)
  read              Read config from servo
  write             Write config to servo
  help              Show this message

GLOBAL FLAGS:
  --json            Machine-readable output
  --quiet           Suppress decoration
  --yes, -y         Skip confirmation prompts

Run 'axon <command> --help' for command-specific options.

See docs/CLI_DESIGN.md in the repo for the full spec.
`,
  );
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.command === null || parsed.command === "help") {
    printTopLevelHelp();
    return ExitCode.Ok;
  }

  if (parsed.flags.help || parsed.flags.h) {
    printCommandHelp(parsed.command);
    return ExitCode.Ok;
  }

  try {
    switch (parsed.command) {
      case "status":
        return await runStatus(parsed.global);

      case "monitor":
        return await runMonitor(parsed.global);

      case "read": {
        let format: "human" | "json" | "svo" | "hex" = "human";
        if (parsed.flags.svo) format = "svo";
        else if (parsed.flags.hex) format = "hex";
        else if (parsed.flags.json || parsed.global.json) format = "json";
        return await runRead(parsed.global, { format });
      }

      case "write": {
        const from = parsed.flags.from;
        if (typeof from !== "string" || from.length === 0) {
          throw AxonError.usage(
            "`axon write` requires --from <file.svo> (or file.json in a future release).",
          );
        }
        const dryRun = parsed.flags["dry-run"] === true;
        return await runWrite(parsed.global, { from, dryRun });
      }

      case "get":
      case "set":
      case "mode": {
        process.stderr.write(
          `axon ${parsed.command} is not yet implemented in the v1 scaffold.\n` +
            `Currently implemented: status, monitor, read, write.\n` +
            `See docs/BYTE_MAPPING.md for the byte→parameter mapping work blocking 'set'/'get',\n` +
            `and docs/CLI_DESIGN.md for the full v1 design.\n`,
        );
        return ExitCode.UsageError;
      }

      default:
        process.stderr.write(`unknown command: ${parsed.command}\n`);
        printTopLevelHelp();
        return ExitCode.UsageError;
    }
  } catch (e) {
    if (e instanceof AxonError) {
      if (parsed.global.json) {
        process.stderr.write(
          JSON.stringify({
            error: e.message,
            code: e.code,
            hint: e.hint ?? null,
          }) + "\n",
        );
      } else {
        process.stderr.write(`error: ${e.message}\n`);
        if (e.hint) process.stderr.write(`hint:  ${e.hint}\n`);
      }
      return e.code;
    }
    process.stderr.write(`unexpected error: ${(e as Error).message}\n`);
    if ((e as Error).stack) {
      process.stderr.write((e as Error).stack! + "\n");
    }
    return ExitCode.ServoIoError;
  }
}

function printCommandHelp(command: string): void {
  switch (command) {
    case "status":
      process.stdout.write(
        `axon status — one-shot presence check\n\n` +
          `Prints whether the dongle is connected and whether the servo reports PRESENT.\n` +
          `Always exits 0; the output is informational.\n\n` +
          `FLAGS:\n` +
          `  --json      Machine-readable output\n` +
          `  --quiet     Single-line summary only\n`,
      );
      break;
    case "monitor":
      process.stdout.write(
        `axon monitor — live presence polling\n\n` +
          `Polls every 300 ms (same cadence as the vendor exe) and prints one line per\n` +
          `state transition. States: no-adapter, adapter-only, servo-present.\n\n` +
          `FLAGS:\n` +
          `  --json      Emit transitions as newline-delimited JSON\n\n` +
          `Ctrl-C to stop.\n`,
      );
      break;
    case "read":
      process.stdout.write(
        `axon read — read the current config from the servo\n\n` +
          `FLAGS:\n` +
          `  (default)   Human-readable summary (named parameters not yet shown)\n` +
          `  --json      Machine-readable JSON with raw bytes\n` +
          `  --svo       Raw 95-byte dump to stdout (vendor .svo compatible)\n` +
          `  --hex       Annotated hex dump (for debugging)\n\n` +
          `Example:\n` +
          `  axon read --svo > backup.svo\n`,
      );
      break;
    case "write":
      process.stdout.write(
        `axon write — write a config file to the servo\n\n` +
          `FLAGS:\n` +
          `  --from <file>   Load config from file (vendor .svo format in v1)\n` +
          `  --dry-run       Show the diff without writing\n` +
          `  --yes           Skip the confirmation prompt\n\n` +
          `Example:\n` +
          `  axon write --from backup.svo\n\n` +
          `Always reads the current config, shows a byte-level diff, asks for\n` +
          `confirmation, writes, and verifies. Refuses to write if the file's\n` +
          `model id does not match the connected servo.\n`,
      );
      break;
    default:
      process.stdout.write(
        `no detailed help for '${command}'. Run 'axon help' for the command list.\n`,
      );
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`fatal: ${(e as Error).message}\n`);
    process.exit(ExitCode.ServoIoError);
  });
