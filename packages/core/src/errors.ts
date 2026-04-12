/**
 * Shared exit codes and typed errors.
 *
 * The CLI consumes the exit codes directly. Other surfaces can still use
 * the stable categories and human-facing recovery hints.
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

export type ErrorCategory =
  | "no_adapter"
  | "adapter_busy"
  | "adapter_io"
  | "no_servo"
  | "servo_io"
  | "unknown_model"
  | "validation"
  | "usage"
  | "internal";

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

  static noAdapter(detail: string): AxonError {
    return new AxonError(
      ExitCode.DongleNotFound,
      detail,
      "Plug in the Axon servo programmer adapter. If it is already plugged in, release it from Parallels/Windows or close any app using it, then retry.",
      "no_adapter",
    );
  }

  static adapterBusy(detail: string): AxonError {
    return new AxonError(
      ExitCode.DongleNotFound,
      `Could not open the Axon adapter: ${detail}`,
      "Close any app or VM using the adapter, or release it from Parallels/Windows, then retry.",
      "adapter_busy",
    );
  }

  static adapterIo(detail: string): AxonError {
    return new AxonError(
      ExitCode.ServoIoError,
      `HID I/O to the Axon adapter failed: ${detail}`,
      "Unplug and replug the adapter, then retry.",
      "adapter_io",
    );
  }

  static noServo(detail = "Adapter connected, but no servo detected."): AxonError {
    return new AxonError(
      ExitCode.NotPrimed,
      detail,
      "Unplug and replug the servo from the adapter (leave the adapter connected).",
      "no_servo",
    );
  }

  static servoIo(detail: string): AxonError {
    return new AxonError(
      ExitCode.ServoIoError,
      `Servo I/O error: ${detail}`,
      "Unplug and replug the servo from the adapter (leave the adapter connected).",
      "servo_io",
    );
  }

  static unknownModel(modelId: string): AxonError {
    return new AxonError(
      ExitCode.UnknownModel,
      `Unknown servo model "${modelId}".`,
      `Please open an issue at https://github.com/caryden/servo-programmer/issues with the output of 'axon read --svo > unknown.svo' so this model can be added to the catalog.`,
      "unknown_model",
    );
  }

  static validation(detail: string): AxonError {
    return new AxonError(ExitCode.ValidationError, detail, undefined, "validation");
  }

  static usage(detail: string): AxonError {
    return new AxonError(ExitCode.UsageError, detail, undefined, "usage");
  }

  static dongleNotFound(detail: string): AxonError {
    return AxonError.noAdapter(detail);
  }

  static notPrimed(): AxonError {
    return AxonError.noServo();
  }
}
