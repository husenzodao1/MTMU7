import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isWeatherKind, kindFromCode, weatherFromForecast } from "../../src/features/dashboard/weather-kind.ts";

describe("the sky over Istaravshan, from Open-Meteo", () => {
  it("reads every WMO code as a kind the card can draw", () => {
    const cases: Array<[number, string]> = [
      [0, "clear"],
      [1, "partly"],
      [2, "partly"],
      [3, "cloudy"],
      [45, "fog"],
      [48, "fog"],
      [51, "drizzle"],
      [57, "drizzle"],
      [61, "rain"],
      [67, "rain"],
      [80, "rain"],
      [82, "rain"],
      [71, "snow"],
      [77, "snow"],
      [85, "snow"],
      [86, "snow"],
      [95, "storm"],
      [99, "storm"],
      [4, "clear"],
    ];
    for (const [code, kind] of cases) assert.equal(kindFromCode(code), kind, `code ${code}`);
  });

  it("takes the current block, rounding the numbers", () => {
    const weather = weatherFromForecast({ current: { temperature_2m: 17.6, weather_code: 61, wind_speed_10m: 9.4 } });
    assert.deepEqual(weather, { kind: "rain", temperature: 18, wind: 9, windy: false });
  });

  it("calls a strong wind windy", () => {
    assert.equal(weatherFromForecast({ current: { temperature_2m: 3, weather_code: 3, wind_speed_10m: 31 } })?.windy, true);
  });

  it("is no weather when the answer is not one", () => {
    assert.equal(weatherFromForecast(null), null);
    assert.equal(weatherFromForecast({}), null);
    assert.equal(weatherFromForecast({ current: { weather_code: "x", temperature_2m: 1 } }), null);
    assert.equal(weatherFromForecast({ current: { weather_code: 1 } }), null);
  });

  it("keeps a missing wind at calm", () => {
    assert.deepEqual(weatherFromForecast({ current: { temperature_2m: -2.4, weather_code: 73 } }), { kind: "snow", temperature: -2, wind: 0, windy: false });
  });

  it("knows its own kinds", () => {
    assert.equal(isWeatherKind("rain"), true);
    assert.equal(isWeatherKind("hail"), false);
    assert.equal(isWeatherKind(3), false);
  });
});
