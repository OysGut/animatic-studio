/** No test may fall through to a real provider. Tests install their own fake fetch. */
export function denyTestNetwork(): never {
  throw new Error("Test network blocked: install a mock before making a request");
}