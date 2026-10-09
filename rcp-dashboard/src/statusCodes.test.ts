import { expect, it } from "vitest";
import { formatStatusCodes, parseStatusCodes } from "./statusCodes";
import { outcomeTone } from "./format";
it("keeps the default and makes custom sets explicit", () => {
  expect(parseStatusCodes("")).toBeNull(); expect(parseStatusCodes("200-399")).toBeNull();
  expect(parseStatusCodes("403,200,403")).toEqual([200,403]);
  expect(formatStatusCodes(parseStatusCodes("200-399,403"))).toBe("200-399,403");
  expect(parseStatusCodes("403")).toEqual([403]);
});
it("rejects malformed and out-of-range status sets", () => {
  for (const input of ["99","600","200,", "399-200", "200;403", "200.5", "100-600"]) expect(() => parseStatusCodes(input)).toThrow();
});
it("colours each HTTP result with its check's snapshot, including accepted 403", () => {
  expect(outcomeTone("HTTP_RESPONSE",403,null)).toBe("fault");
  expect(outcomeTone("HTTP_RESPONSE",403,[403])).toBe("good");
  expect(outcomeTone("HTTP_RESPONSE",200,[403])).toBe("fault");
  expect(outcomeTone("REQUEST_TIMEOUT",null,[403])).toBe("fault");
});
