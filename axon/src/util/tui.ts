/**
 * Shared TUI helpers for colored terminal output.
 *
 * Uses raw ANSI escape codes — no dependencies. Degrades to plain
 * text when stdout is not a TTY or when --json/--quiet is active.
 */

const ESC = "\x1b";

// Foreground
const FG_BLACK = `${ESC}[30m`;
const FG_WHITE = `${ESC}[97m`;

// Background
const BG_GREEN = `${ESC}[42m`;
const BG_RED = `${ESC}[41m`;
const BG_BLUE = `${ESC}[44m`;
const BG_CYAN = `${ESC}[46m`;
const BG_YELLOW = `${ESC}[43m`;
const BG_GRAY = `${ESC}[100m`;

const BOLD = `${ESC}[1m`;
const RESET = `${ESC}[0m`;

// Cursor control for live-updating TUI
export const CLEAR_LINE = `${ESC}[2K`;
export const CURSOR_UP = `${ESC}[1A`;
export const HIDE_CURSOR = `${ESC}[?25l`;
export const SHOW_CURSOR = `${ESC}[?25h`;

function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

function pill(text: string, bg: string, fg: string): string {
  if (!isTTY()) return `[${text}]`;
  return `${bg}${fg}${BOLD} ${text} ${RESET}`;
}

// ---- status bar -------------------------------------------------------------

export interface StatusBarInfo {
  connected: boolean;
  modelName?: string | null;
  modeName?: string | null;
}

export function renderStatusBar(info: StatusBarInfo): string {
  const parts: string[] = [];

  if (info.connected) {
    parts.push(pill("Connected", BG_GREEN, FG_BLACK));
  } else {
    parts.push(pill("Disconnected", BG_RED, FG_WHITE));
  }

  if (info.modelName) {
    parts.push(pill(info.modelName, BG_BLUE, FG_WHITE));
  }

  if (info.modeName) {
    parts.push(pill(info.modeName, BG_CYAN, FG_BLACK));
  }

  return parts.join("");
}

// ---- progress bar -----------------------------------------------------------

/**
 * Render a single-line progress bar.
 *
 *   Flashing ████████████░░░░░░░░  62%
 */
export function renderProgressBar(label: string, fraction: number, width = 30): string {
  const pct = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const pctText = `${Math.floor(pct * 100)}%`.padStart(4);
  if (!isTTY()) return `${label} ${pctText}`;
  return `${label} ${BG_GRAY}${FG_WHITE}${bar}${RESET} ${pctText}`;
}

// ---- parameter table --------------------------------------------------------

export interface ParamRow {
  name: string;
  value: string;
  unit?: string;
}

export function renderParamTable(rows: ParamRow[]): string {
  if (rows.length === 0) return "";
  const maxName = Math.max(...rows.map((r) => r.name.length));
  const lines: string[] = [];
  for (const r of rows) {
    const unit = r.unit && r.unit !== "enum" ? ` ${r.unit}` : "";
    lines.push(`  ${r.name.padEnd(maxName)}  ${r.value}${unit}`);
  }
  return lines.join("\n");
}
