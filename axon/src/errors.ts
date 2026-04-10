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

export class AxonError extends Error {
  constructor(
    public readonly code: ExitCodeValue,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "AxonError";
  }

  static dongleNotFound(detail: string): AxonError {
    return new AxonError(
      ExitCode.DongleNotFound,
      detail,
      "Make sure exactly one Axon dongle is plugged in via USB.",
    );
  }

  static notPrimed(): AxonError {
    return new AxonError(
      ExitCode.NotPrimed,
      "Servo not reporting PRESENT (dongle is in cold state).",
      "Unplug the servo from the dongle and plug it back in. Leave the adapter connected.",
    );
  }

  static servoIo(detail: string): AxonError {
    return new AxonError(ExitCode.ServoIoError, `Servo I/O error: ${detail}`);
  }

  static validation(detail: string): AxonError {
    return new AxonError(ExitCode.ValidationError, detail);
  }

  static unknownModel(modelId: string): AxonError {
    return new AxonError(
      ExitCode.UnknownModel,
      `Unknown servo model "${modelId}".`,
      "Please file an issue at https://github.com/ — include the model id and the output of `axon read --svo > unknown.svo`.",
    );
  }

  static usage(detail: string): AxonError {
    return new AxonError(ExitCode.UsageError, detail);
  }
}
