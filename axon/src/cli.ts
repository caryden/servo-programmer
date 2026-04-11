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

import pkg from "../package.json" with { type: "json" };
import { runDoctor } from "./commands/doctor.ts";
import { printGetHelp, runGet } from "./commands/get.ts";
import { type ModeSubcommand, runMode } from "./commands/mode.ts";
import { runMonitor } from "./commands/monitor.ts";
import { runRead } from "./commands/read.ts";
import { runSet } from "./commands/set.ts";
import { runStatus } from "./commands/status.ts";
import { runWrite } from "./commands/write.ts";
import { AxonError, ExitCode } from "./errors.ts";

/**
 * CLI version string, baked in at build time via the Bun JSON
 * import of `../package.json`. When `bun build --compile` bundles
 * this into a standalone binary, the version comes along inside
 * the executable.
 */
export const VERSION: string = pkg.version;

export interface GlobalFlags {
  json: boolean;
  quiet: boolean;
  yes: boolean;
}

export interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: Record<string, string | boolean>;
  global: GlobalFlags;
}

const GLOBAL_BOOLS = new Set([
  "json",
  "quiet",
  "yes",
  "y",
  "help",
  "h",
  "version",
  "v",
  "recover",
  "debug",
]);

function isNegativeNumberToken(arg: string): boolean {
  return /^-(?:\d|\.\d)/.test(arg);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const global: GlobalFlags = { json: false, quiet: false, yes: false };
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (isNegativeNumberToken(arg)) {
      if (command === null) {
        command = arg;
      } else {
        positional.push(arg);
      }
    } else if (arg.startsWith("--")) {
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
  doctor            Run non-destructive diagnostics
  monitor           Live presence polling (Ctrl-C to stop)
  read              Read config from servo
  write             Write config to servo
  get               Read a named parameter (or list them)
  set               Write a named parameter
  mode              List / show / flash servo modes
  version           Print the CLI version and exit
  help              Show this message

GLOBAL FLAGS:
  --json            Machine-readable output
  --quiet           Suppress decoration
  --yes, -y         Skip confirmation prompts
  --version, -v     Print the CLI version and exit

Run 'axon <command> --help' for command-specific options.

See docs/CLI_DESIGN.md in the repo for the full spec.
`,
  );
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);

  // `axon --version` / `axon -v` / `axon version` prints the bundled
  // version string and exits. Works before we attempt any tool
  // dispatch so it's safe to call on a broken dongle / missing
  // adapter / whatever.
  if (parsed.flags.version || parsed.flags.v || parsed.command === "version") {
    process.stdout.write(`axon ${VERSION}\n`);
    return ExitCode.Ok;
  }

  if (parsed.command === null || parsed.command === "help") {
    printTopLevelHelp();
    return ExitCode.Ok;
  }

  if (parsed.flags.help || parsed.flags.h) {
    // `axon get <param> --help` is handled inside the get command so
    // it can render per-parameter help from the catalog. Everything
    // else (including bare `axon get --help`) uses printCommandHelp.
    if (parsed.command === "get" && parsed.positional.length > 0) {
      // fall through to the command dispatcher below
    } else {
      printCommandHelp(parsed.command);
      return ExitCode.Ok;
    }
  }

  try {
    switch (parsed.command) {
      case "status":
        return await runStatus(parsed.global);

      case "doctor": {
        const debug = parsed.flags.debug === true;
        return await runDoctor(parsed.global, { debug });
      }

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

      case "get": {
        // Per-parameter --help is a pure catalog lookup; no hardware.
        // Top-level `axon get --help` is covered by the global help path.
        if ((parsed.flags.help || parsed.flags.h) && parsed.positional.length === 0) {
          return printGetHelp(parsed.global);
        }
        const param = parsed.positional[0];
        const raw = !!parsed.flags.raw;
        const help = !!(parsed.flags.help || parsed.flags.h);
        return await runGet(parsed.global, { param, raw, help });
      }

      case "set": {
        const backup = typeof parsed.flags.backup === "string" ? parsed.flags.backup : undefined;
        const dryRun = parsed.flags["dry-run"] === true;
        return await runSet(parsed.global, {
          positional: parsed.positional,
          backup,
          dryRun,
        });
      }

      case "mode": {
        const sub = parsed.positional[0];
        if (sub === undefined) {
          throw AxonError.usage(
            "`axon mode` requires a sub-command: list, current, or set. " +
              "Run 'axon mode --help' for details.",
          );
        }
        if (sub !== "list" && sub !== "current" && sub !== "set") {
          throw AxonError.usage(
            `unknown 'mode' sub-command: ${sub}. Expected: list, current, set.`,
          );
        }
        const subcommand: ModeSubcommand = sub;
        if (subcommand === "set") {
          const filePath = typeof parsed.flags.file === "string" ? parsed.flags.file : undefined;
          const recoverFlag = parsed.flags.recover;
          const recover = recoverFlag === true || typeof recoverFlag === "string";
          const modeName = parsed.positional[1];
          const recoveryModel =
            parsed.positional[2] ?? (typeof recoverFlag === "string" ? recoverFlag : undefined);
          return await runMode(parsed.global, {
            subcommand,
            modeName,
            filePath,
            recover,
            recoveryModel,
          });
        }
        return await runMode(parsed.global, { subcommand });
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
          `${JSON.stringify({
            error: e.message,
            code: e.code,
            category: e.category,
            hint: e.hint ?? null,
          })}\n`,
        );
      } else {
        process.stderr.write(`error: ${e.message}\n`);
        if (e.hint) process.stderr.write(`hint:  ${e.hint}\n`);
      }
      return e.code;
    }
    process.stderr.write(`unexpected error: ${(e as Error).message}\n`);
    const stack = (e as Error).stack;
    if (stack) {
      process.stderr.write(`${stack}\n`);
    }
    return ExitCode.ServoIoError;
  }
}

function printCommandHelp(command: string): void {
  switch (command) {
    case "status":
      process.stdout.write(
        `axon status — one-shot presence check\n\n` +
          `Prints whether the adapter is connected and whether the servo reports PRESENT.\n` +
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
    case "doctor":
      process.stdout.write(
        `axon doctor — run non-destructive diagnostics\n\n` +
          `Checks runtime, catalog, USB/HID visibility, HID openability,\n` +
          `safe identify, and safe config read.\n\n` +
          `FLAGS:\n` +
          `  --json      Machine-readable diagnostic report\n` +
          `  --quiet     Print only the final category\n` +
          `  --debug     Include raw identify/config HID reply prefixes\n`,
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
    case "get":
      printGetHelp({ json: false, quiet: false, yes: false });
      break;
    case "set":
      process.stdout.write(
        `axon set — write a named parameter to the servo\n\n` +
          `USAGE:\n` +
          `  axon set <param> <value>         Read-modify-write with diff + confirm\n` +
          `  axon set <param> default         Reset one parameter to the model default\n` +
          `  axon set default                 Reset ALL parameters in the current mode\n` +
          `  axon set default --backup <f>    Save current config to <f> before resetting\n\n` +
          `FLAGS:\n` +
          `  --yes        Skip confirmation prompt\n` +
          `  --dry-run    Show the diff without writing\n` +
          `  --json       Machine-readable output (implies --yes)\n\n` +
          `Example:\n` +
          `  axon set servo_angle 180\n` +
          `  axon set pwm_power 75\n`,
      );
      break;
    case "mode":
      process.stdout.write(
        `axon mode — list, inspect, and switch servo modes\n\n` +
          `USAGE:\n` +
          `  axon mode list                     Show available modes for the connected servo\n` +
          `  axon mode current                  Show the mode the servo is currently in\n` +
          `  axon mode set servo                Switch to Servo Mode (position control)\n` +
          `  axon mode set cr                   Switch to CR Mode (continuous rotation)\n` +
          `  axon mode set --file <path>        Flash an arbitrary .sfw file\n\n` +
          `  axon mode set servo --recover mini Recover Mini to Servo Mode from search paths\n` +
          `  axon mode set cr --recover mini    Recover Mini to CR Mode from search paths\n` +
          `  axon mode set --file <path> --recover\n` +
          `                                      Flash via bootloader when identify/read fails\n\n` +
          `FLAGS:\n` +
          `  --yes, -y    Skip the confirmation prompt\n` +
          `  --recover    Skip normal identify/config read and flash via bootloader\n\n` +
          `FIRMWARE SEARCH:\n` +
          `  --file <path> always wins. Otherwise axon searches AXON_FIRMWARE_PATH,\n` +
          `  the user firmware cache, and repo downloads/ when running from source.\n\n` +
          `Example:\n` +
          `  axon mode set servo\n` +
          `  axon mode set cr --yes\n`,
      );
      break;
    default:
      process.stdout.write(
        `no detailed help for '${command}'. Run 'axon help' for the command list.\n`,
      );
  }
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stderr.write(`fatal: ${(e as Error).message}\n`);
      process.exit(ExitCode.ServoIoError);
    });
}
