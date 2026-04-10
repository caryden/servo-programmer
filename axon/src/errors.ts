/**
 * Exit codes and typed errors for the Axon CLI.
 *
 * See docs/CLI_DESIGN.md "Exit codes" section for the contract.
 */

export const ExitCode = {
  Ok: 0,
  UsageError: 1,
  DongleNotFound: 2,
  NotPrimed: 3,
  ServoIoError: 4,
  ValidationError: 5,
  UnknownModel: 6,
} as const;

export type ExitCodeName = keyof typeof ExitCode;
export type ExitCodeValue = (typeof ExitCode)[ExitCodeName];

/**
 * Stable machine-readable category tag for errors that come back
 * through the CLI's --json mode. Coding agents (and scripts) should
 * branch on this field rather than parsing the human-readable
 * message or hint.
 *
 * The category is a specific *state observation*, not a free-form
 * error code. Each value corresponds to exactly one recoverable
 * situation and exactly one suggested recovery.
 */
export type ErrorCategory =
  | "no_adapter" // dongle not on USB
  | "adapter_busy" // enumerates but something else owns it
  | "adapter_stale" // opens but first HID write/read rejected (post-plug or hot-swap)
  | "no_servo" // adapter OK, identify returns rx[2]=0xFA
  | "servo_io" // mid-transaction I/O error (lost during read/write)
  | "unknown_model" // servo present but its model id isn't in the catalog
  | "validation" // user input out of range, bad file, etc.
  | "usage" // CLI argument problem
  | "internal"; // bug in our code — report with the stack on AXON_DEBUG=1

export class AxonError extends Error {
  public readonly category: ErrorCategory;

  constructor(
    public readonly code: ExitCodeValue,
    message: string,
    public readonly hint?: string,
    category: ErrorCategory = "internal",
  ) {
    super(message);
    this.name = "AxonError";
    this.category = category;
  }

  // -- USB / HID transport layer ---------------------------------------------

  /**
   * Nothing matching VID 0471 PID 13AA on USB.
   */
  static noAdapter(detail: string): AxonError {
    return new AxonError(
      ExitCode.DongleNotFound,
      detail,
      "Plug in the Axon servo programmer.",
      "no_adapter",
    );
  }

  /**
   * The dongle enumerated on USB but the HID handle could not be
   * opened. We don't know why — could be permissions, another
   * process, a stale handle, anything. Surface the raw OS error so
   * it can be diagnosed rather than papering over it.
   */
  static adapterBusy(detail: string): AxonError {
    return new AxonError(
      ExitCode.DongleNotFound,
      `Could not open the Axon dongle: ${detail}`,
      "Unplug and replug the dongle, then retry.",
      "adapter_busy",
    );
  }

  /**
   * The dongle opened but a HID write or read was rejected. Surface
   * the raw OS error so the actual cause is visible, not hidden
   * behind a speculative hint.
   */
  static adapterStale(detail: string): AxonError {
    return new AxonError(
      ExitCode.ServoIoError,
      `HID I/O to the Axon dongle failed: ${detail}`,
      "Unplug and replug the dongle, then retry.",
      "adapter_stale",
    );
  }

  /**
   * Adapter is connected, HID transport is fine, and identify
   * returned a well-formed reply saying no servo is attached
   * (rx[2]=0xFA).
   */
  static noServo(detail = "Adapter connected, but no servo detected."): AxonError {
    return new AxonError(
      ExitCode.NotPrimed,
      detail,
      "Unplug and replug the servo from the dongle (leave the adapter connected).",
      "no_servo",
    );
  }

  /**
   * Mid-transaction I/O failure: identify said present but a
   * subsequent read/write got an unexpected reply.
   */
  static servoIo(detail: string): AxonError {
    return new AxonError(
      ExitCode.ServoIoError,
      `Servo I/O error: ${detail}`,
      "Unplug and replug the servo from the dongle (leave the adapter connected).",
      "servo_io",
    );
  }

  // -- Catalog / model layer -------------------------------------------------

  static unknownModel(modelId: string): AxonError {
    return new AxonError(
      ExitCode.UnknownModel,
      `Unknown servo model "${modelId}".`,
      `Please open an issue at https://github.com/caryden/servo-programmer/issues with the output of 'axon read --svo > unknown.svo' so this model can be added to the catalog.`,
      "unknown_model",
    );
  }

  // -- User / CLI layer ------------------------------------------------------

  static validation(detail: string): AxonError {
    return new AxonError(ExitCode.ValidationError, detail, undefined, "validation");
  }

  static usage(detail: string): AxonError {
    return new AxonError(ExitCode.UsageError, detail, undefined, "usage");
  }

  // -- Deprecated aliases (kept for source compat with existing callers) ----

  /** @deprecated use `AxonError.noAdapter` */
  static dongleNotFound(detail: string): AxonError {
    return AxonError.noAdapter(detail);
  }

  /** @deprecated use `AxonError.noServo` */
  static notPrimed(): AxonError {
    return AxonError.noServo();
  }
}
