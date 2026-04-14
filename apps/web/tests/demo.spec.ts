import { expect, test, type Page } from "@playwright/test";

async function pointSnapshot(page: Page) {
  const locator = page.locator("[data-operating-point]");
  return {
    torque: await locator.getAttribute("data-torque-kgcm"),
    speed: await locator.getAttribute("data-speed-rpm"),
    current: await locator.getAttribute("data-current-a"),
    mechPower: await locator.getAttribute("data-mechanical-power-w"),
    elecPower: await locator.getAttribute("data-electrical-power-w"),
    heat: await locator.getAttribute("data-heat-w"),
    efficiency: await locator.getAttribute("data-efficiency"),
    effectiveVoltage: await locator.getAttribute("data-effective-voltage"),
  };
}

test.describe("web demo", () => {
  test("shared frame layout stays fixed when switching between Servo and CR", async ({ page }) => {
    await page.goto("/?demo");

    const topline = page.locator(".topline");
    const workspace = page.locator(".workspace");
    const configPane = page.locator(".config-pane");
    const simPane = page.locator(".sim-pane");

    const beforeTopline = await topline.boundingBox();
    const beforeWorkspace = await workspace.boundingBox();
    const beforeConfig = await configPane.boundingBox();
    const beforeSim = await simPane.boundingBox();

    await page.locator('[data-mode="cr_mode"]').click();

    const afterTopline = await topline.boundingBox();
    const afterWorkspace = await workspace.boundingBox();
    const afterConfig = await configPane.boundingBox();
    const afterSim = await simPane.boundingBox();

    expect(beforeTopline).not.toBeNull();
    expect(beforeWorkspace).not.toBeNull();
    expect(beforeConfig).not.toBeNull();
    expect(beforeSim).not.toBeNull();
    expect(afterTopline).not.toBeNull();
    expect(afterWorkspace).not.toBeNull();
    expect(afterConfig).not.toBeNull();
    expect(afterSim).not.toBeNull();

    expect(afterTopline?.x).toBeCloseTo(beforeTopline!.x, 1);
    expect(afterWorkspace?.x).toBeCloseTo(beforeWorkspace!.x, 1);
    expect(afterConfig?.x).toBeCloseTo(beforeConfig!.x, 1);
    expect(afterSim?.x).toBeCloseTo(beforeSim!.x, 1);
    expect(afterTopline?.width).toBeCloseTo(beforeTopline!.width, 1);
    expect(afterWorkspace?.width).toBeCloseTo(beforeWorkspace!.width, 1);
    expect(afterConfig?.width).toBeCloseTo(beforeConfig!.width, 1);
    expect(afterSim?.width).toBeCloseTo(beforeSim!.width, 1);
  });

  test("loads the ready demo state", async ({ page }) => {
    await page.goto("/?demo");

    await expect(page.locator('[title="Servo state"] .state-value')).toHaveText("Micro");
    await expect(page.locator('[title="Show status log"] .state-value')).toHaveText("Ready");
    await expect(page.locator("[data-command='toggle-sweep']")).toBeVisible();
    await expect(page.locator("[data-setting='sensitivity']")).toBeVisible();
    await expect(page.locator("[data-setting='dampening']")).toBeVisible();
    await expect(page.locator("[data-setting='overload-protection']")).toBeVisible();
    await expect(page.locator("[data-setting='overload-level1']")).toBeVisible();
    await expect(page.locator("[data-setting='overload-level2']")).toBeVisible();
    await expect(page.locator("[data-setting='overload-level3']")).toBeVisible();
    await expect(page.locator("[data-setting='power-limit']")).toBeVisible();
  });

  test("config controls stay in the intended priority order", async ({ page }) => {
    await page.goto("/?demo");

    const servoOrder = await page
      .locator(".config-pane > [data-setting]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-setting")));
    expect(servoOrder).toEqual([
      "range",
      "center",
      "direction",
      "power-limit",
      "sensitivity",
      "dampening",
      "signal-loss",
      "overload-protection",
      "ramp",
    ]);

    await page.locator('[data-mode="cr_mode"]').click();
    const crOrder = await page
      .locator(".config-pane > [data-setting]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-setting")));
    expect(crOrder).toEqual(["stop-trim", "direction", "power-limit", "proptl"]);
  });

  test("servo-mode playback and kinematics do not move the operating point", async ({ page }) => {
    await page.goto("/?demo");

    const sweepButton = page.locator("[data-command='toggle-sweep']");
    const pwmValue = page.locator("[data-live-pwm-value]");
    const before = await pointSnapshot(page);

    await expect(sweepButton).toHaveAttribute("aria-label", "Pause sweep");
    await sweepButton.click({ position: { x: 20, y: 20 } });
    await expect(sweepButton).toHaveAttribute("aria-label", "Play sweep");
    const pausedValue = await pwmValue.textContent();
    await page.waitForTimeout(300);
    await expect(pwmValue).toHaveText(String(pausedValue));
    await expect(await pointSnapshot(page)).toEqual(before);

    const rangeSlider = page.locator("[data-slider='range']");
    await rangeSlider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("[data-range-value]")).toHaveText("181 deg");
    await expect(await pointSnapshot(page)).toEqual(before);

    const pwmSlider = page.locator('[data-slider="pwm"]');
    await pwmSlider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(await pointSnapshot(page)).toEqual(before);
    expect(await pwmValue.textContent()).not.toBe(pausedValue);

    await sweepButton.click();
    await expect(sweepButton).toHaveAttribute("aria-label", "Pause sweep");
    const resumedValue = await pwmValue.textContent();
    await page.waitForTimeout(300);
    expect(await pwmValue.textContent()).not.toBe(resumedValue);
  });

  test("status log can be opened and closed", async ({ page }) => {
    await page.goto("/?demo");

    await page.locator("[data-command='toggle-status-log']").click();
    await expect(page.getByText("Status Log")).toBeVisible();
    await expect(page.locator("[data-command='copy-status-log']")).toBeVisible();

    await page.locator("[aria-label='Close status log']").click();
    await expect(page.getByText("Status Log")).toHaveCount(0);
  });

  test("help tooltip uses the app font stack", async ({ page }) => {
    await page.goto("/?demo");

    const helpButton = page.locator('[data-setting="range"] .help');
    await helpButton.hover();

    const tooltip = page.locator(".help-tooltip");
    await expect(tooltip).toBeVisible();

    const styles = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const tooltipEl = document.querySelector(".help-tooltip");
      if (!(tooltipEl instanceof HTMLElement)) return null;
      const tooltip = getComputedStyle(tooltipEl);
      return {
        bodyFontFamily: body.fontFamily,
        tooltipFontFamily: tooltip.fontFamily,
        bodyFontSize: body.fontSize,
        tooltipFontSize: tooltip.fontSize,
      };
    });

    expect(styles).not.toBeNull();
    expect(styles?.tooltipFontFamily).toBe(styles?.bodyFontFamily);
    expect(styles?.tooltipFontSize).toBe("13px");
  });

  test("CR mode swaps in ProPTL and drive changes the curve family", async ({ page }) => {
    await page.goto("/?demo");

    await page.locator('[data-mode="cr_mode"]').click();
    await expect(page.locator('[data-setting="range"]')).toHaveCount(0);
    await expect(page.locator('[data-setting="sensitivity"]')).toHaveCount(0);
    await expect(page.locator('[data-setting="dampening"]')).toHaveCount(0);
    await expect(page.locator('[data-setting="overload-protection"]')).toHaveCount(0);
    await expect(page.locator('[data-setting="proptl"]')).toBeVisible();
    await expect(page.getByText("On signal loss")).toHaveCount(0);
    await expect(page.locator("[data-command='toggle-sweep']")).toBeVisible();
    await expect(page.locator("[data-command='toggle-sweep']")).toHaveAttribute(
      "aria-label",
      "Pause animation",
    );

    const before = await pointSnapshot(page);
    await expect(page.locator('[data-live-pwm-value]')).toHaveText("2000 us");

    const driveSlider = page.locator('[data-slider="pwm"]');
    await driveSlider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("[data-command='toggle-sweep']")).toHaveAttribute(
      "aria-label",
      "Pause animation",
    );
    const lowerDrive = await pointSnapshot(page);
    expect(lowerDrive.effectiveVoltage).not.toBe(before.effectiveVoltage);

    await driveSlider.focus();
    await page.keyboard.press("End");
    await expect(page.locator('[data-live-pwm-value]')).toHaveText("2500 us");

    const loadSlider = page.locator('[data-slider="load"]');
    await loadSlider.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = input.max;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const stalled = await pointSnapshot(page);
    expect(stalled.speed).toBe("0.000");
  });

  test("discard resets to the loaded draft", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "axon-config-checkpoints-v1",
        JSON.stringify([
          {
            id: "checkpoint-cr",
            createdAt: "2026-04-13T18:45:00.000Z",
            label: "micro-cr-checkpoint",
            modelId: "SA20BHS*",
            modelName: "Axon Micro",
            draft: {
              mode: "cr_mode",
              rangePercent: 50,
              neutralUs: 12,
              direction: "ccw",
              pwmLossBehavior: "hold",
              softStart: false,
              sensitivityStep: 4,
              dampeningFactor: 166,
              overloadProtectionEnabled: true,
              overloadLevels: [
                { pct: 55, sec: 4.0 },
                { pct: 75, sec: 2.0 },
                { pct: 100, sec: 0.8 },
              ],
              pwmPowerPercent: 60,
              proptlSeconds: 7.5,
            },
          },
        ]),
      );
    });

    await page.goto("/?demo");

    await page.locator("[data-command='toggle-file-menu']").click();
    await page.locator('[data-command="load-checkpoint"][data-checkpoint-id="checkpoint-cr"]').click();

    await expect(page.locator('[data-mode="cr_mode"]')).toHaveAttribute("data-selected", "true");
    await expect(page.locator("[data-command='discard']")).toBeDisabled();
    await expect(page.locator("[data-command='apply']")).toBeEnabled();
    await expect(page.locator("[data-setting='proptl']")).toBeVisible();
    await expect(page.locator("[data-proptl-value]")).toHaveText("7.5 s");

    const proptlSlider = page.locator('[data-slider="proptl"]');
    await proptlSlider.focus();
    await page.keyboard.press("ArrowRight");

    await expect(page.locator("[data-command='discard']")).toBeEnabled();
    await expect(page.locator("[data-proptl-value]")).not.toHaveText("7.5 s");

    await page.locator("[data-command='discard']").click();
    await expect(page.locator('[data-mode="cr_mode"]')).toHaveAttribute("data-selected", "true");
    await expect(page.locator("[data-proptl-value]")).toHaveText("7.5 s");
  });
});
