import { describe, expect, it } from "vitest";
import { conTimeout } from "./fetch-prezzi";

const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("conTimeout", () => {
  it("risolve con il valore della promessa se arriva prima del limite", async () => {
    const risultato = await conTimeout(Promise.resolve("ok"), 50, "scaduto");
    expect(risultato).toBe("ok");
  });

  it("risolve con il valore di scadenza se la promessa impiega più del limite", async () => {
    const lenta = attesa(200).then(() => "troppo tardi");
    const risultato = await conTimeout(lenta, 20, "scaduto");
    expect(risultato).toBe("scaduto");
  });
});
